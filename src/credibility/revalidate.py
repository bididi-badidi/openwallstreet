"""Revalidate saved PDF extraction responses after a parser correction, without new model calls."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from .citations import verify_claim, source_span
from .pipeline import save
from .reporting import write_report

def revalidate(root):
    root=Path(root)
    result=json.loads((root/'evidence.json').read_text())
    original=root/'evidence.before-parser-correction.json'
    if original.exists(): raise ValueError('Parser correction already recorded for this run')
    save(original,result)
    accepted=[]; rejected=0
    for job in result['jobs']:
        claims=[]; job_rejected=0
        for doc in job['documents']:
            snapshot_path=root/doc['snapshot']; raw_path=snapshot_path.with_name(doc['id']+'.source')
            raw=raw_path.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=doc['sha256']: raise ValueError('Saved source hash mismatch')
            if not raw.startswith(b'%PDF'): raise ValueError('This correction tool supports PDFs only')
            text=subprocess.run(['pdftotext',str(raw_path),'-'],capture_output=True,check=True,timeout=60).stdout.decode('utf-8')
            snapshot=json.loads(snapshot_path.read_text())
            layout_pages=snapshot['pages']
            layout_path=snapshot_path.with_name(doc['id']+'.supplied-layout.text.json')
            save(layout_path,snapshot)
            snapshot['pages']=text.split('\f');snapshot['extraction_method']='pdftotext reading-order'
            save(snapshot_path,snapshot)
            outputs=snapshot_path.parent.parent/'outputs'
            doc['extraction_notes']=[]
            model_notes=[]
            for extraction in sorted(outputs.glob(doc['id']+'.chunk-*.extraction.json')):
                response=json.loads(extraction.read_text())
                chunk_number=int(extraction.name.split('.chunk-')[1].split('.')[0])+1
                model_notes.extend(response['gaps'])
                doc['extraction_notes'].extend({'chunk':chunk_number,'note':note} for note in response['gaps'])
                for candidate in response['claims']:
                    claim=verify_claim(candidate,snapshot['pages'])
                    if claim is None:
                        claim=verify_claim(candidate,layout_pages)
                        if claim is not None: claim['quote_snapshot']=str(layout_path.relative_to(root))
                    if claim is None:
                        matches=[(n,source_span(candidate['excerpt'],page)) for n,page in enumerate(snapshot['pages'],1) if source_span(candidate['excerpt'],page)]
                        if len(matches)==1:
                            number,span=matches[0]
                            claim=dict(candidate,excerpt=span,page=number,model_page=candidate['page'],model_excerpt=candidate['excerpt'],quote_alignment='unique_source_span; cited_page_corrected')
                    if claim is None: rejected+=1;job_rejected+=1;continue
                    claim.update(document_id=doc['id'],source_url=doc['url'],job=job['job'],
                                 quote_verification='exact_substring_of_source_page',semantic_verification='requires_review')
                    claims.append(claim)
            job['gaps']=[g for g in job['gaps'] if g not in model_notes and g != f'{doc["title"]}: rejected claim with unsupported exact excerpt or page']
            doc['parser_correction']='Reading-order text replaces interleaved layout text; original supplied snapshot retained'
        job['claims']=claims;accepted.extend(claims)
        if job_rejected:job['gaps'].append(f'{job_rejected} candidate quotes could not be verified after parser correction')
        job['status']='partial' if job['gaps'] else 'complete'
        save(root/f'job-{job["job"]}.json',job)
    dedup={}
    for claim in accepted:
        key=hashlib.sha256(json.dumps({k:v for k,v in claim.items() if k!='job'},sort_keys=True).encode()).hexdigest()
        dedup.setdefault(key,dict(id=key,**claim))
    result['claims']=list(dedup.values())
    result['documents']=[d for j in result['jobs'] for d in j['documents']]
    result['status']='partial' if any(j['gaps'] for j in result['jobs']) else 'complete'
    result['parser_correction']={'method':'reading-order PDF text plus whitespace-only source-span matching','accepted':len(dedup),'rejected':rejected,'new_model_calls':0}
    save(root/'evidence.json',result);write_report(result,root)
    return result['parser_correction']

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('run',type=Path);args=parser.parse_args()
    print(json.dumps(revalidate(args.run),indent=2))
