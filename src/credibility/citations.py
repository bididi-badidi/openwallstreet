"""Locate a model quotation without changing source words or punctuation."""
import re

def source_span(excerpt, text):
    if not excerpt or not excerpt.strip(): return None
    if excerpt in text: return excerpt
    # PDF line wrapping and alignment may differ. Only whitespace can vary.
    pattern=r'\s+'.join(re.escape(token) for token in excerpt.split())
    match=re.search(pattern,text)
    return match.group(0) if match else None

def verify_claim(claim, pages):
    if not 1 <= claim['page'] <= len(pages): return None
    span=source_span(claim['excerpt'],pages[claim['page']-1])
    if span is None: return None
    result=dict(claim,excerpt=span)
    if span != claim['excerpt']:
        result['model_excerpt']=claim['excerpt']
        result['quote_alignment']='whitespace_only; exact_source_span_preserved'
    return result
