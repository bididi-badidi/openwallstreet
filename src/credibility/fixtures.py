"""Deterministic fictional data. Never represented as live model research."""
import hashlib
from .schema import DISCOVERY
TEXT = 'Management Discussion and Analysis\nWe commit to open 12 stores by December 2027.\nSupply delays remain a challenge.\nRevenue was USD 40 million in the reporting period.'
class FixtureRuntime:
    mode = 'fixture'
    provider = 'fixture'
    model = 'fixture-no-model-execution'
    def execute(self, request):
        from .engine import EngineResult
        return EngineResult(self.run(request.prompt, request.response_schema, request.directories.work), 'fixture', self.model)
    def run(self, prompt, schema, workdir):
        if schema == DISCOVERY:
            import json
            request = json.loads(prompt.split('\n')[-1])
            return {'documents': [dict(title='FICTIONAL Example report', url='https://reports.example.invalid/report', company=request['company'], identity='FICTIONAL-001', publication_date=None, fiscal_year=int(request['report']['period_end'][:4]), **request['report'])], 'gaps': []}
        return {'mda_sections': ['Management Discussion and Analysis'], 'gaps': [], 'claims': [
            dict(category='measurable_promise', summary='Open 12 stores', excerpt='We commit to open 12 stores by December 2027.', page=1,
                 section='Management Discussion and Analysis', target_date='December 2027', numeric_target='12', unit='stores',
                 attribution=None, uncertainties=['Individual speaker not identified'], is_highlight=True),
            dict(category='challenge', summary='Supply delays', excerpt='Supply delays remain a challenge.', page=1,
                 section='Management Discussion and Analysis', target_date=None, numeric_target=None, unit=None,
                 attribution=None, uncertainties=[], is_highlight=False)]}
def fixture_fetch(url, hosts, user_agent):
    raw = TEXT.encode()
    return {'url': url, 'pages': [TEXT], 'sha256': hashlib.sha256(raw).hexdigest()}, raw
