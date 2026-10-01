"""Compile a small stakeholder timeline from a verified, versioned ledger.

Selection and prose are explicit analyst proposals. Quotes, dates, attribution,
coverage and review states come from the ledger, never from presentation copy.
"""
import argparse
import calendar
import json
from pathlib import Path

from .ledger import build_ledger, require, unique, bounds, LedgerError
from .ledger_schema import DIMENSIONS

NAMES = dict(zip(DIMENSIONS, ('Delivery credibility', 'Disclosure & accountability',
                              'Operating efficiency', 'Capital stewardship')))
TYPES = {'promise': 'Commitment', 'conditional_intention': 'Intention',
         'authorization': 'Authorization', 'obligation': 'Obligation',
         'forecast': 'Forecast', 'outcome': 'Outcome', 'decision': 'Decision',
         'challenge': 'Setback', 'context': 'Context'}


def anchor(entry, kind):
    require(kind in ('statement', 'event', 'measurement_period'), 'Invalid timeline date kind')
    value = entry['dates'][kind]
    require(value is not None, f'{entry["id"]} has no supported {kind} date')
    if kind == 'measurement_period':
        return dict(month=value['end'][:7], date=value['label'], date_kind='Measurement period',
                    date_precision='period', period_start=value['start'], period_end=value['end'])
    bounds(value)  # Also validate precision and calendar values.
    text, precision = value['value'], value['precision']
    month = text[:7] if precision != 'year' else text + '-12'
    label = text if precision == 'year' else f'{calendar.month_abbr[int(text[5:7])]} {text[:4]}'
    if precision == 'day':
        label = f'{int(text[8:10])} {label}'
    return dict(month=month, date=label, date_kind=f'{kind.title()} {precision}',
                date_precision=precision, **{kind + '_date': text})


def compile_presentation(ledger, selection):
    require(selection['schema_version'] == 1, 'Unsupported presentation selection version')
    require(selection['company'] == ledger['company'], 'Presentation company mismatch')
    first, last = selection['fiscal_years']
    require(type(first) is int and type(last) is int and last - first == 4,
            'Presentation must name five consecutive completed fiscal years')
    require(last < int(ledger['as_of'][:4]), 'Current fiscal year must be separate from completed years')
    entries = unique(ledger['entries'], 'ledger entry')
    events = unique(selection['events'], 'presentation event')
    require(1 <= len(events) <= 20, 'Select 1 to 20 major events; retain the full ledger separately')
    assessments = unique(selection['assessments'], 'presentation assessment')
    require(set(assessments) == set(DIMENSIONS), 'Keep all four assessment dimensions separate')
    evidence = {}

    def details(item):
        ids = item['entry_ids']
        require(bool(ids) and len(ids) == len(set(ids)), 'Selection needs unique ledger entries')
        require(all(e in entries for e in ids), 'Unknown ledger entry in presentation')
        selected = [entries[e] for e in ids]
        require(all(e['review_status'] != 'rejected' for e in selected), 'Rejected entry cannot be featured')
        require(all(e['assessment'] != 'not_available_as_of' for e in selected), 'Entry unavailable at the presentation cutoff')
        roles = {}
        def add_refs(refs, role):
            for ref in refs:
                roles.setdefault(ref, set()).add(role)
        for entry in selected:
            add_refs(entry['evidence_refs'], 'Statement evidence')
            add_refs(entry['contrary_evidence_refs'], 'Contrary evidence')
            for kind, value in entry['dates'].items():
                if value:
                    add_refs(value['evidence_refs'], kind.replace('_', ' ').title() + ' support')
            for actor in entry['actors']['individuals']:
                add_refs(actor['evidence_refs'], 'Attribution support')
                for date_kind in ('tenure_start', 'tenure_end'):
                    if actor[date_kind]:
                        add_refs(actor[date_kind]['evidence_refs'], 'Tenure support')
        refs = list(roles)
        for ref in refs:
            record = ledger['evidence'][ref]
            claim = record['claim']
            doc = ledger['documents'][record['document_ref']]
            require(not doc.get('publication_date') or doc['publication_date'] <= ledger['as_of'],
                    'Document unavailable at the presentation cutoff')
            page = ledger['source_pages'][record['source_page_ref']]
            require(claim['excerpt'] in page['text'], 'Presentation quote no longer matches source page')
            evidence[ref] = dict(claim_id=claim['id'], claim_number=ref, page=claim['page'],
                                 section=claim['section'], excerpt=claim['excerpt'],
                                 source_url=doc['url'].split('#')[0] + f'#page={claim["page"]}',
                                 attribution=claim['attribution'], report_year=doc['fiscal_year'],
                                 quote_verification=record['quote_check'],
                                 snapshot_method=page['extraction_method'],
                                 origin=claim.get('origin', 'collector_extraction'),
                                 source_page_text=page['text'])
        return dict(refs=refs, entry_ids=ids, meaning=item['meaning'], limit=item['limit'],
                    reference_roles={r: sorted(v) for r, v in roles.items()},
                    dates_by_entry={e['id']: e['dates'] for e in selected},
                    date_support=[dict(entry=e['summary'], role=kind.replace('_', ' '),
                                       value=value.get('value', value.get('label')), basis=value['basis'])
                                  for e in selected for kind, value in e['dates'].items() if value],
                    review_status='proposed',
                    entry_review_status={e['id']: e['review_status'] for e in selected},
                    ledger_states={e['id']: e['assessment'] for e in selected})

    compiled_events = []
    anchors = set()
    for item in events.values():
        require(item['anchor_entry'] in item['entry_ids'], 'Date anchor must belong to selected entries')
        primary = entries.get(item['anchor_entry'])
        require(primary is not None, 'Unknown date anchor entry')
        date_fields = anchor(primary, item['anchor_kind'])
        require(first <= int(date_fields['month'][:4]) <= last, 'Timeline event outside completed-year window')
        # Never invent distinct days to separate month-only evidence. Multiple
        # entries sharing an anchor belong in one milestone, with every citation.
        require(date_fields['month'] not in anchors, 'Combine milestones sharing a month anchor')
        anchors.add(date_fields['month'])
        require(bool(item['materiality_reason'].strip()), 'Major event needs a selection rationale')
        compiled_events.append(dict(id=item['id'], **date_fields, **details(item),
                                    type=TYPES[primary['kind']], lens=primary['dimension'],
                                    owner=primary['actors']['statement_by'] or ledger['company'],
                                    decision_by=primary['actors']['decision_by'],
                                    title=item['title'], summary=item['summary'], tile=item['tile'], label=item['label'],
                                    materiality_reason=item['materiality_reason'],
                                    target_period=(primary['dates']['measurement_period'] or {}).get('label')
                                      if primary['kind'] in ('promise', 'forecast') else None))
    compiled_events.sort(key=lambda e: e['month'])
    compiled_assessments = []
    for dimension in DIMENSIONS:
        item = assessments[dimension]
        require(all(entries[e]['dimension'] == dimension for e in item['entry_ids'] if e in entries),
                'Assessment cannot blend different dimensions')
        compiled_assessments.append(dict(id=dimension, name=NAMES[dimension], **details(item),
                                         value=item['value'], summary=item['summary'], caption=item['caption']))
    coverage = []
    for year in range(first, last + 1):
        docs = [(ref, d) for ref, d in ledger['documents'].items()
                if d['report_type'] == 'annual' and d['fiscal_year'] == year]
        identities = {(d['sha256'], d['report_type'], d['period_end']) for _, d in docs}
        records = [e for e in ledger['evidence'].values() if e['document_ref'] in {ref for ref, _ in docs}]
        count = len(records)
        supplemental = sum(e['claim'].get('origin') == 'separate_offline_source_review' for e in records)
        full = bool(docs) and all(d.get('extracted_chunks', 0) == d.get('total_chunks', -1) for _, d in docs)
        coverage.append(dict(year=year, documents=len(identities), accepted_excerpts=count,
                             collector_excerpts=count-supplemental, supplemental_excerpts=supplemental,
                             status='collected; review pending' if count and full else 'partial' if docs else 'not collected'))
    return dict(schema_version=1, company=ledger['company'], scope=f'FY{first}–FY{last}',
                title=selection['title'], deck=selection['deck'], as_of=ledger['as_of'],
                review='Proposed interpretations. Quote checks do not establish delivery or individual contribution.',
                source_documents=len({(d['sha256'], d['report_type'], d['period_end']) for d in ledger['documents'].values()}), extracted_claims=len(ledger['evidence']),
                claim_count_is_quality_score=False, coverage=coverage,
                supplemental_excerpts=sum(r['supplemental_excerpts'] for r in coverage),
                collector_extracted_claims=sum(r['collector_excerpts'] for r in coverage),
                ledger_curation_sha256=ledger['curation_sha256'],
                ledger_entries=len(entries), uncurated_claims=len(ledger['coverage']['uncurated_refs']),
                collection_gaps=[gap for s in ledger['sources'] for gap in s['gaps']],
                limitations=selection['limitations'], assessments=compiled_assessments,
                events=compiled_events, evidence=evidence)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--curation', required=True, type=Path)
    parser.add_argument('--selection', required=True, type=Path)
    parser.add_argument('--as-of', required=True)
    parser.add_argument('--previous', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        ledger = build_ledger(args.curation, args.as_of, args.previous)
        result = compile_presentation(ledger, json.loads(args.selection.read_text()))
        # This is a replaceable UI view, not an immutable collector/ledger file.
        args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(2, f'Presentation not built: {exc}\n')
    print(f'{len(result["events"])} major events from {result["source_documents"]} documents; {args.output}')


if __name__ == '__main__':
    main()
