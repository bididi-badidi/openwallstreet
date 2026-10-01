"""Self-contained, accessible review artifacts; no UI framework or live data feed."""
from html import escape
import json
from urllib.parse import urlsplit


def label(value):
    return value.replace('_', ' ').capitalize()


def date_label(value):
    if value is None:
        return 'Unknown'
    if 'value' in value:
        return f'{value["value"]} ({value["precision"]} precision)'
    return f'{value["label"]}: {value["start"]} through {value["end"]}'


def source_url(claim):
    url = claim['source_url']
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname:
        return None
    if '.pdf' in parsed.path.lower():
        url = url.split('#')[0] + f'#page={claim["page"]}'
    return url


def render_markdown(ledger):
    lines = [f'# {ledger["company"]}: promise-to-outcome ledger', '',
             f'Assessment cutoff: {ledger["as_of"]}. Method: {ledger["methodology_version"]}.', '',
             'Historical evidence only. Review statuses describe curation, not verification of factual truth.', '',
             f'{ledger["coverage"]["extraction_records"]} extraction records; '
             f'{ledger["coverage"]["economic_groups"]} curated economic groups; '
             f'{len(ledger["coverage"]["uncurated_refs"])} uncurated records. Counts are coverage, not quality scores.', '',
             'Open ledger.html for every original quotation, source-page context, matching gate and review history. '
             'ledger.json contains the complete machine-readable record.', '']
    for entry in ledger['entries']:
        lines += [f'## {entry["summary"]}', '',
                  f'ID: `{entry["id"]}`. Economic group: `{entry["economic_id"]}`.',
                  f'{label(entry["kind"])}; {label(entry["dimension"])}; '
                  f'**{label(entry["assessment"])}**; review: **{entry["review_status"]}**.',
                  f'Change: {entry["change"]}; predecessor: {entry["supersedes"] or "none"}; '
                  f'successors: {", ".join(entry["successor_ids"]) or "none"}.', '']
        lines += [f'- {label(key)}: {date_label(value)}' for key, value in entry['dates'].items()]
        lines += ['', 'Grouping rationale: ' + entry['grouping_rationale'], '']
        for ref in entry['evidence_refs']:
            claim = ledger['evidence'][ref]['claim']
            lines += [f'- `{ref}`: physical page {claim["page"]}; original classification {claim["category"]}.']
        lines += [''] + ['- ' + text for text in entry['limitations']] + ['']
    lines += ['## Comparison rationale', '']
    for comparison in ledger['comparisons']:
        lines += [f'### {comparison["promise_id"]} → {comparison["outcome_id"]}', '',
                  f'**{label(comparison["status"])}**. {comparison["rationale"]}', '']
        lines += [f'- {check["field"]}: {"aligned" if check["aligned"] else "unresolved / mismatch"}. '
                  + check['rationale'] for check in comparison['checks']]
        lines += ['']
    lines += ['## Limits', ''] + ['- ' + text for text in ledger['limitations']]
    return '\n'.join(lines) + '\n'


def render_html(ledger):
    e = lambda value: escape(str(value), quote=True)
    citation_ids = {ref: f'citation-{i}' for i, ref in enumerate(ledger['evidence'])}

    def refs(values):
        return ', '.join(f'<a href="#{citation_ids[ref]}">{e(ref)}</a>' for ref in values) or 'None recorded'

    def structured(value):
        return '<pre>' + e(json.dumps(value, indent=2, ensure_ascii=False)) + '</pre>'

    def items(values):
        return '<ul>' + ''.join('<li>' + e(value) + '</li>' for value in values) + '</ul>'

    body = [f'<header><p>WALLSTREET · HISTORICAL EVIDENCE</p><h1>{e(ledger["company"])}<br>Promise-to-outcome ledger</h1>',
            f'<p>Assessment cutoff: <strong>{e(ledger["as_of"])}</strong> · {e(ledger["methodology_version"])}</p>',
            '<p>Company results, management statements and board decisions retain separate attribution. '
            'This record does not rate personal honesty or individual directors.</p></header>',
            '<nav aria-label="Ledger sections"><a href="#entries">Economic statements</a> · '
            '<a href="#comparisons">Outcome comparisons</a> · <a href="#evidence">Original evidence</a> · '
            '<a href="#coverage">Coverage &amp; limits</a></nav>',
            '<main><section id="entries"><h2>Economic statements and versions</h2>',
            '<p>Repeated quotations are evidence references within one economic statement. '
            'Original classifications remain visible. A revision does not replace the original target.</p>']
    for dimension, ids in ledger['dimensions'].items():
        body += [f'<h3>{e(label(dimension))}</h3>']
        if not ids:
            body += ['<p>No curated evidence in this dimension.</p>']
        for entry in (x for x in ledger['entries'] if x['id'] in ids):
            body += [f'<article id="entry-{e(entry["id"])}"><h4>{e(entry["summary"])}</h4>',
                     f'<p><strong>{e(label(entry["assessment"]))}</strong> · {e(label(entry["kind"]))} · '
                     f'Review: {e(entry["review_status"])}</p>',
                     f'<p>Economic ID: {e(entry["economic_id"])} · Version: {e(entry["id"])} '
                     f'({e(entry["change"])})</p>',
                     f'<p>Predecessor: {e(entry["supersedes"] or "none")}. '
                     f'Successors: {e(", ".join(entry["successor_ids"]) or "none")}. '
                     f'Lifecycle: {e(entry.get("lifecycle", "original"))}.</p>',
                     '<dl>' + ''.join(f'<dt>{e(label(key))}</dt><dd>{e(date_label(value))}</dd>'
                                     for key, value in entry['dates'].items()) + '</dl>',
                     f'<p>{e(entry["grouping_rationale"])}</p><p>Evidence: {refs(entry["evidence_refs"])}</p>',
                     f'<p>Contrary evidence: {refs(entry["contrary_evidence_refs"])}</p>', items(entry['limitations']),
                     items(entry['assessment_notes']),
                     '<details><summary>Metric, conditions, date basis, attribution and review history</summary>',
                     structured({key: entry[key] for key in ('metric_id', 'value', 'conditions', 'dates', 'actors', 'review_history')}),
                     '</details></article>']
    body += ['</section><section id="comparisons"><h2>Outcome comparisons</h2>',
             '<p>Every gate must align before a numeric delivery assessment. Rejected candidates stay visible.</p>']
    if not ledger['comparisons']:
        body += ['<p>No outcome matches proposed.</p>']
    for comparison in ledger['comparisons']:
        body += [f'<article><h3>{e(comparison["promise_id"])} → {e(comparison["outcome_id"])}</h3>',
                 f'<p><strong>{e(label(comparison["status"]))}</strong>. {e(comparison["rationale"])}</p>',
                 '<div class="table-scroll"><table><thead><tr><th>Gate</th><th>Result</th><th>Reason</th></tr></thead><tbody>']
        body += [f'<tr><th>{e(label(c["field"]))}</th><td>{"Aligned" if c["aligned"] else "Unresolved / mismatch"}</td>'
                 f'<td>{e(c["rationale"])}</td></tr>' for c in comparison['checks']]
        body += ['</tbody></table></div>', f'<p>Contrary evidence: {refs(comparison["contrary_evidence_refs"])}</p>',
                 '<details><summary>Full comparison record</summary>' + structured(comparison) + '</details></article>']
    body += ['</section><section id="evidence"><h2>Original evidence</h2>',
             '<p>Raw summaries, classifications and mixed date fields are preserved below as extraction output, '
             'not endorsed interpretations. Full page context preserves table headers and source layout.</p>']
    for ref, citation in ledger['evidence'].items():
        claim = citation['claim']
        doc = ledger['documents'][citation['document_ref']]
        page = ledger['source_pages'][citation['source_page_ref']]
        url = source_url(claim)
        source = f'<a href="{e(url)}" rel="noreferrer">Original source, physical page {claim["page"]}</a>' if url else 'Source URL unavailable'
        body += [f'<details id="{citation_ids[ref]}"><summary>{e(claim["summary"])}</summary>',
                 f'<p>{e(ref)} · {e(claim["category"])}</p><p>{source}</p>',
                 '<blockquote><pre>' + e(claim['excerpt']) + '</pre></blockquote>',
                 f'<p>{e(doc["title"])}. Container publication metadata: {e(doc.get("publication_date"))} '
                 '(not a statement date). Metadata review: ' + e(doc.get('metadata_verification', 'unknown')) + '.</p>',
                 f'<p>Snapshot: {e(page["snapshot"])}. Method: {e(page["extraction_method"])}. '
                 f'Snapshot SHA-256: {e(page["snapshot_sha256"])}.</p>',
                 '<details><summary>Full saved page including headers</summary><pre>' + e(page['text']) + '</pre></details>',
                 '<details><summary>Unchanged extraction record</summary>' + structured(claim) + '</details></details>']
    body += ['</section><section id="coverage"><h2>Coverage and limits</h2>', items(ledger['limitations']),
             '<details><summary>Uncurated records, shared citations and source gaps</summary>',
             structured(ledger['coverage']), structured(ledger['sources']), '</details>',
             '<details><summary>Canonical metric definitions</summary>' + structured(ledger['curation']['metrics']) + '</details>',
             f'<p>Curation SHA-256: {e(ledger["curation_sha256"])}. '
             f'Prior ledger SHA-256: {e(ledger["previous_ledger_sha256"] or "none")}</p></section></main>']
    style = '''body{font:16px/1.55 system-ui,sans-serif;color:#192c2c;background:#f4f5f0;margin:0 auto;padding:24px;max-width:1040px}h1{font-size:clamp(28px,5vw,48px);line-height:1.15}h2{margin-top:48px}h3{margin-top:32px}h4{font-size:20px;margin:0}a{color:#145c60;overflow-wrap:anywhere}article{background:white;padding:24px;margin:18px 0;border:1px solid #cbd5d1;border-radius:12px}p,li,dd{overflow-wrap:anywhere}details{background:#fff;padding:12px;margin:10px 0;border:1px solid #cbd5d1;border-radius:6px}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}blockquote{margin:12px 0;padding:0 12px;border-left:3px solid #689a8c}dl{display:grid;grid-template-columns:minmax(110px,1fr) 3fr;gap:6px}dt{font-weight:600}dd{margin:0}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #cbd5d1}th{white-space:nowrap}:target{outline:2px solid #145c60}:focus-visible{outline:3px solid #145c60;outline-offset:3px}@media(max-width:600px){body{padding:12px}article{padding:15px}dl{display:block}dd{margin-bottom:8px}}'''
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' \
           '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'">' \
           '<title>Wallstreet evidence ledger</title><style>' + style + '</style><body>' + ''.join(body) + '</body></html>'
