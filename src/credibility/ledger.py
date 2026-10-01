"""Offline promise-to-outcome ledger over pinned, immutable collector evidence.

No models, network calls, fuzzy semantic joins, currency conversions, or scores.
Run ``python -m credibility.ledger --help`` from a PYTHONPATH=src environment.
"""
import argparse
import calendar
from collections import defaultdict
import copy
from datetime import date
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re

from .ledger_schema import CURATION, DIMENSIONS
from .schema import validate


class LedgerError(ValueError):
    """Invalid evidence or curation; no assessment should be published."""


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def require(condition, message):
    if not condition:
        raise LedgerError(message)


def unique(items, label):
    indexed = {}
    for item in items:
        require(item['id'] and item['id'] not in indexed, f'Duplicate or empty {label} id: {item["id"]}')
        indexed[item['id']] = item
    return indexed


def day(value):
    require(bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value)), f'Expected ISO calendar day: {value}')
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise LedgerError(f'Invalid date: {value}') from exc


def bounds(value):
    """Date precision creates uncertainty bounds, not invented occurrence days."""
    if value is None:
        return None
    text, precision = value['value'], value['precision']
    if precision == 'day':
        return day(text), day(text)
    if precision == 'month':
        require(bool(re.fullmatch(r'\d{4}-\d{2}', text)), f'Expected YYYY-MM: {text}')
        start = day(text + '-01')
        return start, date(start.year, start.month, calendar.monthrange(start.year, start.month)[1])
    require(bool(re.fullmatch(r'\d{4}', text)), f'Expected YYYY: {text}')
    return day(text + '-01-01'), day(text + '-12-31')


def decimal(value):
    try:
        result = Decimal(value)
    except (InvalidOperation, TypeError) as exc:
        raise LedgerError(f'Invalid decimal: {value}') from exc
    require(result.is_finite(), f'Non-finite decimal: {value}')
    return result


def review_status(record):
    return record['review_history'][-1]['status']


def saved_file(root, name):
    path = (root / name).resolve()
    require(path.is_relative_to(root.resolve()), f'Saved evidence path escapes run: {name}')
    require(path.is_file(), f'Missing saved evidence: {path}')
    return path


def load_evidence(curation, base):
    """Recheck source hashes and exact quotes, including layout-specific snapshots."""
    evidence, documents, pages, sources = {}, {}, {}, []
    for source in curation['sources']:
        path = (base / source['path']).resolve()
        raw = path.read_bytes()
        require(digest(raw) == source['sha256'], f'Evidence hash mismatch: {source["id"]}')
        pack = json.loads(raw)
        require(pack.get('schema_version') == 1, 'Unsupported collector schema')
        require(pack['company'] == curation['company'], 'Evidence company mismatch')
        docs = unique(pack['documents'], 'document')
        unique(pack['claims'], 'claim')
        snapshots = {}
        for doc_id, doc in docs.items():
            snapshot_path = saved_file(path.parent, doc['snapshot'])
            original = saved_file(path.parent, str(Path(doc['snapshot']).with_name(doc_id + '.source')))
            require(digest(original.read_bytes()) == doc['sha256'], f'Raw source hash mismatch: {doc_id}')
            documents[source['id'] + ':' + doc_id] = copy.deepcopy(doc)
            snapshots[doc['snapshot']] = (snapshot_path, json.loads(snapshot_path.read_bytes()))
        for claim in pack['claims']:
            require(claim['document_id'] in docs, f'Orphan claim: {claim["id"]}')
            doc = docs[claim['document_id']]
            name = claim.get('quote_snapshot', doc['snapshot'])
            if name not in snapshots:
                sp = saved_file(path.parent, name)
                snapshots[name] = (sp, json.loads(sp.read_bytes()))
            sp, snapshot = snapshots[name]
            require(snapshot['sha256'] == doc['sha256'], f'Snapshot source identity mismatch: {name}')
            number = claim['page']
            require(type(number) is int and 1 <= number <= len(snapshot['pages']), 'Invalid source page')
            page_text = snapshot['pages'][number - 1]
            require(bool(claim['excerpt'].strip()) and claim['excerpt'] in page_text,
                    f'Quotation no longer matches its saved snapshot: {claim["id"]}')
            ref = source['id'] + ':' + claim['id']
            page_key = source['id'] + ':' + name + ':' + str(number)
            # The full page preserves table column headers absent from some extracted quotations.
            pages[page_key] = dict(snapshot=name, snapshot_sha256=digest(sp.read_bytes()),
                                   page=number, text=page_text,
                                   extraction_method=snapshot.get('extraction_method', 'original supplied snapshot'))
            evidence[ref] = dict(claim=copy.deepcopy(claim), document_ref=source['id'] + ':' + doc['id'],
                                 source_page_ref=page_key, quote_check='exact_saved_page_substring',
                                 independent_corroboration=False)
        sources.append(dict(source, resolved_path=str(path), collection_status=pack['status'],
                            gaps=[gap for job in pack.get('jobs', []) for gap in job.get('gaps', [])]))
    return evidence, documents, pages, sources


def validate_curation(curation, evidence):
    entries = unique(curation['entries'], 'entry')
    metrics = unique(curation['metrics'], 'metric')
    matches = unique(curation['matches'], 'match')

    def refs(values, label, required=False):
        require(not required or bool(values), f'{label} needs evidence references')
        require(len(values) == len(set(values)), f'{label} has repeated references')
        require(all(ref in evidence for ref in values), f'{label} has an unknown evidence reference')

    def dated(value):
        if value is not None:
            bounds(value)
            require(bool(value['basis'].strip()), 'Date needs a basis')
            refs(value['evidence_refs'], 'date', required=True)

    def reviews(record):
        require(bool(record['review_history']), 'Review history is required')
        last = date.min
        for review in record['review_history']:
            current = day(review['at'])
            require(current >= last, 'Review history must be chronological')
            require(review['reviewer'].strip() and review['rationale'].strip(), 'Review needs author and rationale')
            last = current

    groups = defaultdict(list)
    for entry in entries.values():
        groups[entry['economic_id']].append(entry)
        require(entry['economic_id'].strip() and entry['summary'].strip() and entry['grouping_rationale'].strip(),
                'Entry needs economic identity, summary and grouping rationale')
        refs(entry['evidence_refs'], entry['id'], required=True)
        refs(entry['contrary_evidence_refs'], 'contrary evidence')
        reviews(entry)
        require(entry['metric_id'] is None or entry['metric_id'] in metrics, 'Unknown canonical metric')
        for key, value in entry['dates'].items():
            if key == 'measurement_period':
                if value is not None:
                    require(day(value['start']) <= day(value['end']), 'Reversed measurement period')
                    require(value['basis'].strip() and value['label'].strip(), 'Measurement period needs basis and label')
                    refs(value['evidence_refs'], 'measurement period', required=True)
            else:
                dated(value)
        for person in entry['actors']['individuals']:
            refs(person['evidence_refs'], 'individual attribution', required=True)
            require(person['name'].strip() and person['role'].strip() and person['rationale'].strip(),
                    'Individual attribution needs name, role and rationale')
            dated(person['tenure_start']); dated(person['tenure_end'])
            if person['tenure_start'] and person['tenure_end']:
                require(bounds(person['tenure_start'])[0] <= bounds(person['tenure_end'])[1], 'Reversed tenure')
        require(entry['actors']['outcome_entity'] == curation['company'], 'Outcome entity must be the evidence company')
        value = entry['value']
        if value:
            amount = decimal(value['amount'])
            require(entry['metric_id'] is not None, 'Numeric value needs a canonical metric')
            require((value['upper'] is not None) == (value['operator'] == 'range'), 'Only ranges need an upper bound')
            if value['upper'] is not None:
                require(decimal(value['upper']) >= amount, 'Reversed numeric range')
            if value['tolerance'] is not None:
                require(value['operator'] == 'approximate' and decimal(value['tolerance']) >= 0,
                        'Tolerance must be nonnegative and only applies to approximate targets')
        prior_id = entry['supersedes']
        require((prior_id is None) == (entry['change'] == 'original'), 'Versions must link their predecessor')
        if prior_id is not None:
            require(prior_id in entries and prior_id != entry['id'], 'Invalid predecessor')
            prior = entries[prior_id]
            require(prior['economic_id'] == entry['economic_id'] and prior['dimension'] == entry['dimension'],
                    'Version cannot change economic identity or assessment dimension')
            earlier, later = bounds(prior['dates']['statement']), bounds(entry['dates']['statement'])
            require(earlier and later and earlier[1] < later[0], 'Version sequence needs unambiguous statement dates')
    for group in groups.values():
        require(sum(e['change'] == 'original' for e in group) == 1, 'Economic group needs exactly one original')
        predecessors = [e['supersedes'] for e in group if e['supersedes']]
        require(len(predecessors) == len(set(predecessors)), 'Ambiguous branched version chain')
    for match in matches.values():
        require(match['promise_id'] in entries and match['outcome_id'] in entries, 'Match references unknown entry')
        require(match['promise_id'] != match['outcome_id'], 'Self match is invalid')
        require(match['rationale'].strip(), 'Match rationale is required')
        refs(match['contrary_evidence_refs'], 'match contrary evidence')
        reviews(match)
    return entries, metrics


def compare(promise, outcome, match, metrics, as_of):
    """Fail closed on every semantic, measurement and vintage comparison gate."""
    checks = []

    def check(name, ok, detail):
        checks.append(dict(field=name, aligned=bool(ok), rationale=detail))

    check('entry_kind', promise['kind'] == 'promise' and outcome['kind'] == 'outcome'
          and promise['change'] != 'withdrawal' and outcome['change'] != 'withdrawal',
          'Only delivery promises and reported outcomes qualify; intentions and authorizations do not.')
    check('review', all(review_status(x) == 'reviewed' for x in (promise, outcome, match)),
          'Both interpretations and the proposed match require explicit semantic review.')
    pm, om = metrics.get(promise['metric_id']), metrics.get(outcome['metric_id'])
    check('canonical_metric', pm is not None and om is not None and pm['id'] == om['id'],
          'Canonical definition IDs must match; similar words or numeric values are insufficient.')
    for field in ('definition', 'unit', 'accounting_basis', 'scope', 'measurement_basis'):
        left, right = (pm or {}).get(field), (om or {}).get(field)
        check(field, left is not None and right is not None and bool(left.strip()) and left == right,
              f'Promise: {left!r}; outcome: {right!r}. No automatic conversions or inferred basis.')
    pp, op = promise['dates']['measurement_period'], outcome['dates']['measurement_period']
    check('measurement_period', pp is not None and op is not None
          and (pp['start'], pp['end']) == (op['start'], op['end']),
          'Both the start and end of the measurement period must match exactly.')
    check('entity', promise['actors']['outcome_entity'] == outcome['actors']['outcome_entity'],
          'Comparison is at the company/entity level; this is not an individual performance assessment.')
    statement, event = bounds(promise['dates']['statement']), bounds(outcome['dates']['completion'])
    check('chronology', statement is not None and op is not None and statement[1] < day(op['end'])
          and (event is None or statement[1] < event[0]),
          'The promise must unambiguously precede completion; a retrospective result is not delivery.')
    for label, entry in (('promise', promise), ('outcome', outcome)):
        disclosure = bounds(entry['dates']['first_disclosure'])
        check(label + '_available', disclosure is not None and disclosure[1] <= as_of,
              'First disclosure must be supported and fully on/before the assessment cutoff.')
    disclosed = bounds(outcome['dates']['first_disclosure'])
    check('reporting_chronology', disclosed is not None and op is not None and disclosed[0] >= day(op['end'])
          and (event is None or disclosed[0] >= event[1]),
          'An outcome must be disclosed after its measurement period and any asserted completion; earlier guidance is not a final result.')
    check('period_complete', op is not None and day(op['end']) <= as_of,
          'Partial periods cannot establish final delivery.')
    target, actual = promise['value'], outcome['value']
    check('numeric_value', target is not None and actual is not None and actual['operator'] == 'eq',
          'A normalized target and a point outcome are required.')
    check('approximation', target is not None and
          (target['operator'] != 'approximate' or target['tolerance'] is not None),
          'Approximately has no automatic tolerance; an explicit reviewed tolerance is required.')
    check('conditions', not promise['conditions'],
          'Conditional promises need a separate supported unconditional target before automatic comparison.')
    contrary = list(dict.fromkeys(promise['contrary_evidence_refs'] + outcome['contrary_evidence_refs']
                                 + match['contrary_evidence_refs']))
    check('contrary_evidence', not contrary,
          'Cited contrary evidence is unresolved; it must not be silently outvoted by a matching result.')
    result = dict(match_id=match['id'], promise_id=promise['id'], outcome_id=outcome['id'],
                  rationale=match['rationale'], checks=checks, contrary_evidence_refs=contrary,
                  review_status=review_status(match), limitations=match['limitations'])
    if not all(item['aligned'] for item in checks):
        failed = {item['field'] for item in checks if not item['aligned']}
        status = 'not_comparable'
        if failed == {'review'}:
            status = 'needs_review'
        elif failed <= {'review', 'contrary_evidence'} and 'contrary_evidence' in failed:
            status = 'unresolved'
        return dict(result, status=status, variance=None, elapsed_days=None)
    expected, observed = decimal(target['amount']), decimal(actual['amount'])
    operator = target['operator']
    met = {'eq': observed == expected, 'gte': observed >= expected, 'lte': observed <= expected}
    if operator == 'range':
        achieved = expected <= observed <= decimal(target['upper'])
    elif operator == 'approximate':
        achieved = abs(observed - expected) <= decimal(target['tolerance'])
    else:
        achieved = met[operator]
    deadline = bounds(promise['dates']['target_deadline'])
    status = 'achieved' if achieved else 'missed'
    if deadline:
        # Neither a generic event (e.g. first payment) nor period end is completion.
        if event is None:
            status = 'unresolved'
            checks.append(dict(field='deadline', aligned=False, rationale='Completion date is unknown.'))
        elif event[0] > deadline[1]:
            status = 'achieved_late' if achieved else 'missed'
        elif event[1] > deadline[0]:
            status = 'unresolved'
            checks.append(dict(field='deadline', aligned=False, rationale='Date precision cannot establish timeliness.'))
        if not achieved and as_of < deadline[0]:
            status = 'not_yet_due'
        elif not achieved and as_of < deadline[1]:
            status = 'unresolved'
    elapsed = None
    if event and statement and event[0] == event[1] and statement[0] == statement[1]:
        elapsed = (event[0] - statement[0]).days
    return dict(result, status=status, variance=str(observed - expected), elapsed_days=elapsed)


def assessment(entry, comparisons, as_of):
    disclosure = bounds(entry['dates']['first_disclosure'])
    if disclosure and disclosure[0] > as_of:
        return 'not_available_as_of'
    if review_status(entry) == 'rejected':
        return 'needs_review'
    if entry['change'] == 'withdrawal':
        return 'withdrawn' if review_status(entry) == 'reviewed' else 'needs_review'
    if entry['kind'] != 'promise':
        return 'not_a_delivery_promise'
    if comparisons:
        results = {x['status'] for x in comparisons}
        if len(results) > 1:
            return 'unresolved'
        return next(iter(results))
    if entry['contrary_evidence_refs']:
        return 'unresolved'
    deadline = bounds(entry['dates']['target_deadline'])
    period = entry['dates']['measurement_period']
    due = deadline[0] if deadline else day(period['end']) if period else None
    if due and as_of < due and disclosure and disclosure[1] <= as_of:
        return 'not_yet_due'
    return 'outcome_not_found'


def possibly_available(entry, cutoff):
    disclosure = bounds(entry['dates']['first_disclosure'])
    return disclosure is None or disclosure[0] <= cutoff


def check_previous(previous, current):
    """Continuations may add records/reviews, but cannot silently rewrite history."""
    require(previous['schema_version'] == 1 and previous['company'] == current['company'],
            'Previous ledger has incompatible version/company')
    old = previous['curation']
    for key in ('sources', 'metrics', 'entries', 'matches'):
        new_items = {x['id']: x for x in current[key]}
        for item in old[key]:
            require(item['id'] in new_items, f'Cannot remove historical {key}: {item["id"]}')
            updated = copy.deepcopy(new_items[item['id']])
            original = copy.deepcopy(item)
            if key in ('entries', 'matches'):
                history = original.pop('review_history')
                new_history = updated.pop('review_history')
                require(new_history[:len(history)] == history, 'Review history must be append-only')
            require(original == updated, f'Cannot rewrite historical {key}: {item["id"]}; append a version')


def build_ledger(curation_path, as_of, previous_path=None):
    curation_path = Path(curation_path).resolve()
    raw = curation_path.read_bytes()
    curation = json.loads(raw)
    validate(curation, CURATION)
    require(curation['schema_version'] == 1, 'Unsupported curation schema')
    unique(curation['sources'], 'source')
    require(bool(curation['sources']), 'At least one pinned evidence source is required')
    cutoff = day(as_of)
    prior_hash = None
    if previous_path:
        prior_raw = Path(previous_path).read_bytes()
        prior = json.loads(prior_raw)
        require(cutoff >= day(prior['as_of']), 'Continuation cannot move cutoff backwards')
        check_previous(prior, curation)
        prior_hash = digest(prior_raw)
    evidence, documents, pages, sources = load_evidence(curation, curation_path.parent)
    if previous_path:
        for key, page in prior['source_pages'].items():
            require(key in pages and pages[key] == page, 'Historical source snapshot changed; preserve its original version')
    entries, metrics = validate_curation(curation, evidence)
    comparisons = []
    for match in curation['matches']:
        comparison = compare(entries[match['promise_id']], entries[match['outcome_id']], match, metrics, cutoff)
        # A restated outcome is retained but cannot continue to establish delivery silently.
        successors = [e for e in entries.values() if e['supersedes'] == match['outcome_id']
                      and possibly_available(e, cutoff)]
        if successors:
            comparison.update(status='unresolved', variance=None, elapsed_days=None)
            comparison['checks'].append(dict(field='outcome_revision', aligned=False,
                                              rationale='Outcome has a later version; review both citations.'))
        comparisons.append(comparison)
    groups = defaultdict(list)
    covered = set()
    derived = []
    for entry in entries.values():
        related = [c for c in comparisons if c['promise_id'] == entry['id']]
        covered.update(entry['evidence_refs'])
        groups[entry['economic_id']].append(entry['id'])
        status = assessment(entry, related, cutoff)
        assessment_notes = []
        comparable = [c for c in related if c['status'] in ('achieved', 'achieved_late', 'missed')]
        if len({decimal(entries[c['outcome_id']]['value']['amount']) for c in comparable}) > 1:
            status = 'unresolved'
            assessment_notes.append('Comparable outcome values conflict; no result was selected or averaged.')
        elif len({c['status'] for c in related}) > 1:
            assessment_notes.append('Candidate comparisons disagree in status; inspect every retained matching gate.')
        successors = [e for e in entries.values() if e['supersedes'] == entry['id'] and possibly_available(e, cutoff)]
        lifecycle = 'withdrawn' if entry['change'] == 'withdrawal' else 'changed' if successors else entry['change']
        derived.append(dict(entry, assessment=status, assessment_notes=assessment_notes, lifecycle=lifecycle,
                            review_status=review_status(entry), comparison_ids=[c['match_id'] for c in related],
                            successor_ids=[e['id'] for e in entries.values() if e['supersedes'] == entry['id']]))
    used_refs = defaultdict(list)
    for entry in entries.values():
        for ref in entry['evidence_refs']:
            used_refs[ref].append(entry['id'])
    return dict(schema_version=1, methodology_version='ledger-v1', company=curation['company'], as_of=as_of,
                curation_sha256=digest(raw), previous_ledger_sha256=prior_hash,
                curation=curation, sources=sources, documents=documents, evidence=evidence, source_pages=pages,
                entries=derived, comparisons=comparisons,
                economic_groups=dict(groups), dimensions={d: [e['id'] for e in derived if e['dimension'] == d] for d in DIMENSIONS},
                coverage=dict(extraction_records=len(evidence), normalized_entries=len(derived),
                              economic_groups=len(groups), uncurated_refs=sorted(set(evidence) - covered),
                              shared_claim_refs={r: ids for r, ids in used_refs.items() if len(ids) > 1}),
                limitations=curation['limitations'] + [
                    'Curation is explicit interpretation, not new source evidence or independent corroboration.',
                    'Quote presence is verified; semantic review status is a recorded assertion, not proof of truth.',
                    'Uncurated claims and archive gaps remain unresolved. No aggregate score or delivery rate is calculated.',
                    'Company delivery does not establish returns on capital, personal honesty, or individual causation.',
                    'Partial achievement and qualitative resolution require further structured evidence; they are not inferred.'])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--curation', type=Path, required=True)
    parser.add_argument('--as-of', default=date.today().isoformat(), help='Assessment cutoff (YYYY-MM-DD)')
    parser.add_argument('--previous', type=Path, help='Prior ledger.json to enforce append-only continuation')
    parser.add_argument('--output', type=Path, required=True, help='New output directory; existing directories are refused')
    args = parser.parse_args(argv)
    try:
        require(not args.output.exists(), 'Output directory already exists; use a new version directory')
        ledger = build_ledger(args.curation, args.as_of, args.previous)
        from .ledger_report import render_html, render_markdown
        markdown, html = render_markdown(ledger), render_html(ledger)
        args.output.mkdir(parents=True, exist_ok=False)
        (args.output / 'ledger.json').write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + '\n')
        (args.output / 'ledger.md').write_text(markdown)
        (args.output / 'ledger.html').write_text(html)
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(2, f'Ledger not built: {exc}\n')
    print(f'{len(ledger["entries"])} normalized entries; {len(ledger["coverage"]["uncurated_refs"])} uncurated claims. '
          f'Review {args.output / "ledger.html"}')


if __name__ == '__main__':
    main()
