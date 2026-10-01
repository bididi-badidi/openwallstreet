"""Resumable historical collection. One durable job per issuer/fiscal-year/type."""
import argparse
from collections import Counter
from datetime import date
import hashlib
import json
import os
from pathlib import Path
import uuid
from .pipeline import Coordinator, save
from .engine import Engine
from .api_transport import ApiRuntimeError
from .engine_factory import add_engine_arguments, create_engine


def initialize(config, root):
    root.mkdir(parents=True, exist_ok=True)
    fingerprint = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    manifest = root / 'archive.json'
    if manifest.exists():
        state = json.loads(manifest.read_text())
        if state['config_hash'] != fingerprint: raise ValueError('Archive config changed; use a new archive directory')
        return state
    jobs = []
    for issuer in config['issuers']:
        for year in range(config['start_year'], config['end_fiscal_year'] + 1):
            for kind in ('annual', 'quarterly'):
                prelisting = year < int(issuer['listing_date'][:4])
                jobs.append({'id': f'{issuer["id"]}-{year}-{kind}', 'issuer': issuer['id'], 'fiscal_year': year,
                             'report_type': kind, 'status': 'pre_listing' if prelisting else 'pending',
                             'note': 'No listed-company periodic reporting expected; retrospective information may exist in later filings' if prelisting else 'Availability and expected filing periods require source verification',
                             'attempts': []})
    state = {'config_hash': fingerprint, 'config': config, 'jobs': jobs}
    save(manifest, state)
    return state


def collect(config, root, batch_size=4, retry_partial=False, execute=True, runtime: Engine | None = None):
    if not 1 <= batch_size <= 40: raise ValueError('batch_size must be 1 to 40')
    root = Path(root); root.mkdir(parents=True, exist_ok=True)
    # Atomic lock prevents two invocations from racing checkpoint updates.
    lock = root / '.collector.lock'
    with lock.open('a') as handle:
        import fcntl
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state = initialize(config, root)
        if execute:
            if runtime is None: raise ValueError('An engine must be supplied for execution')
            probe = runtime.probe(); save(root / 'runtime-probe.json', probe)
            if not probe.get('collection_allowed', probe['available']) or not probe['available']:
                state['runtime_blocker'] = probe; save(root / 'archive.json', state)
                save(root / 'coverage.json', summary(state))
                return summary(state)
            state.pop('runtime_blocker', None)
            eligible = {'pending', 'running'} | ({'partial', 'failed'} if retry_partial else set())
            selected = [job for job in state['jobs'] if job['status'] in eligible][:batch_size]
            for job in selected:
                issuer = next(x for x in config['issuers'] if x['id'] == job['issuer'])
                job['status'] = 'running'; save(root / 'archive.json', state)
                run_path = root / 'runs' / (job['id'] + '-' + uuid.uuid4().hex[:8])
                run_config = dict(company=issuer['company'], aliases=issuer['aliases'], as_of=config['as_of'],
                                  primary_hosts=issuer['primary_hosts'], parallelism=config.get('parallelism', 2),
                                  max_documents_per_report=5, reports=[{k:job[k] for k in ('report_type', 'fiscal_year')}])
                result = Coordinator(run_config, runtime, run_path).run()
                job['status'] = result['status']
                # Fiscal-year inventory requires human coverage validation even if extraction succeeds.
                if job['status'] == 'complete': job['status'] = 'collected_needs_coverage_review'
                job['attempts'].append({'path': str(run_path.relative_to(root)), 'documents': len(result['documents']), 'claims': len(result['claims'])})
                save(root / 'archive.json', state)
        result = summary(state); save(root / 'coverage.json', result)
        return result


def record_existing_run(config, root, source):
    """Record a verified local smoke run without repeating model work."""
    root=Path(root).resolve(); source=Path(source).resolve()
    result=json.loads((source/'evidence.json').read_text())
    if result.get('mode') != 'live' or not result.get('model'):
        raise ValueError('Only a live collection with model provenance can be recorded in this archive')
    root.mkdir(parents=True,exist_ok=True)
    with (root/'.collector.lock').open('a') as handle:
        import fcntl
        fcntl.flock(handle,fcntl.LOCK_EX | fcntl.LOCK_NB)
        state=initialize(config,root)
        issuer=next((x for x in config['issuers'] if x['company']==result['company']),None)
        if issuer is None: raise ValueError('Run company is outside archive scope')
        relative=os.path.relpath(source,root)
        for job in state['jobs']:
            matching=[d for d in result['documents'] if d['report_type']==job['report_type'] and d['fiscal_year']==job['fiscal_year']]
            if job['issuer']!=issuer['id'] or not matching: continue
            if any(a['path']==relative for a in job['attempts']): continue
            job['attempts'].append({'path':relative,'documents':len(matching),'claims':sum(c['document_id'] in {d['id'] for d in matching} for c in result['claims'])})
            job['status']='collected_needs_coverage_review' if result['status']=='complete' else 'partial'
        state.pop('runtime_blocker',None)
        save(root/'archive.json',state); save(root/'coverage.json',summary(state))
        return summary(state)


def summary(state):
    return {'status_counts': dict(Counter(j['status'] for j in state['jobs'])), 'total_jobs': len(state['jobs']),
            'runtime_blocker': state.get('runtime_blocker'), 'scope': 'issuer fiscal year and report type; quarterly jobs cover all available quarters',
            'coverage_warning': 'Collected evidence does not prove exhaustive archive coverage. Pre-listing years are not missing expected reports.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, default=Path(__file__).parent / 'examples/magnificent-seven.json')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--batch-size', type=int, default=4)
    parser.add_argument('--plan-only', action='store_true')
    parser.add_argument('--retry-partial', action='store_true')
    parser.add_argument('--record-run', type=Path, help='Record an existing live collection without model calls')
    add_engine_arguments(parser)
    args = parser.parse_args()
    if args.record_run:
        print(json.dumps(record_existing_run(json.loads(args.config.read_text()),args.output,args.record_run),indent=2)); return
    try:
        runtime = None if args.plan_only else create_engine(args.engine, args.env_file)
    except (ValueError, ApiRuntimeError) as exc:
        parser.error(str(exc))
    result = collect(json.loads(args.config.read_text()), args.output, args.batch_size, args.retry_partial, not args.plan_only, runtime=runtime)
    print(json.dumps(result, indent=2))
    if result.get('runtime_blocker'): raise SystemExit(2)

if __name__ == '__main__': main()
