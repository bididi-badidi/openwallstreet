"""Readable evidence output, without credibility scores or resolution judgments."""
import argparse
from collections import Counter
import json
from pathlib import Path

def write_report(result, output):
    output=Path(output)
    lines=[f'# {result["company"]}: management evidence', '',
           f'Mode: **{result["mode"]}**. Collection status: **{result["status"]}**.',
           f'Model: `{result["model"]}`. Reasoning: `{result["reasoning_effort"]}`.', '',
           f'{len(result["documents"])} source report(s), {len(result["claims"])} accepted claim(s).', '',
           'Exact quotations were checked against saved source text. Classifications and document metadata need analyst review. No promise-delivery or challenge-resolution judgments are made.', '',
           '## Sources', '']
    for doc in result['documents']:
        lines += [f'- [{doc["title"]}]({doc["source_url"] if "source_url" in doc else doc["url"]})',
                  f'  - Period end: {doc["period_end"]}; publication: {doc["publication_date"] or "unknown"}; identity: {doc["identity"]}',
                  f'  - MD&A: {"; ".join(doc["mda_sections"]) or "not located"}',
                  f'  - [Saved numbered source text]({doc["snapshot"]})',
                  f'  - SHA-256: `{doc["sha256"]}`', '']
    lines += ['## Highlights', '']
    for claim in [c for c in result['claims'] if c['is_highlight']][:8]:
        lines.append(f'- {claim["summary"]} (physical page {claim["page"]})')
    lines += ['', '## Evidence', '']
    for index, claim in enumerate(result['claims'],1):
        target='; '.join(f'{key.replace("_"," ")}: {claim[key]}' for key in ('numeric_target','unit','target_date','attribution') if claim[key] is not None)
        url=claim['source_url']; url += f'#page={claim["page"]}' if '.pdf' in url.lower() else ''
        lines += [f'### {index}. {claim["summary"]}', '',f'Classification: **{claim["category"]}**. [Physical page {claim["page"]}]({url}), {claim["section"]}.', '']
        if target: lines += [target, '']
        if claim.get('quote_snapshot'): lines += [f'[Exact source text snapshot]({claim["quote_snapshot"]})', '']
        if claim.get('model_page') is not None: lines += [f'Page reference corrected from model page {claim["model_page"]} by a unique source-text match.', '']
        lines += ['> '+claim['excerpt'].replace('\n','\n> '), '']
        if claim['uncertainties']: lines += ['Uncertainty: '+'; '.join(claim['uncertainties']), '']
    lines += ['## Extraction notes', '']
    for doc in result['documents']:
        for note in doc.get('extraction_notes',[]): lines.append(f'- Chunk {note["chunk"]}: {note["note"]}')
    lines += ['', '## Gaps and coverage', '']
    gaps=[gap for job in result['jobs'] for gap in job['gaps']]
    lines += ['- '+gap for gap in gaps] if gaps else ['No collection gaps were reported. This does not establish exhaustive claim coverage.']
    (output/'findings.md').write_text('\n'.join(lines)+'\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('evidence',type=Path);args=parser.parse_args()
    write_report(json.loads(args.evidence.read_text()),args.evidence.parent)
