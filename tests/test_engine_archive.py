import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from credibility.archive import collect, initialize, record_existing_run
from credibility.engine import AgentDirectories, EngineRequest
from credibility.runtime import CodexRuntime, CodexRuntimeError

class EngineArchiveTests(unittest.TestCase):
    def test_live_engine_fails_closed(self):
        failed_verification = {'verified':False,'status':'sandbox_launch_failed'}
        with tempfile.TemporaryDirectory() as temp, \
             patch('credibility.runtime.verify', return_value=failed_verification) as verify_mock, \
             patch('credibility.runtime.subprocess.run') as dispatch_mock:
            root = Path(temp)
            directories = AgentDirectories(root/'inputs', root/'work', root/'outputs')
            request = EngineRequest('test', {}, directories)
            with self.assertRaises(CodexRuntimeError) as failure: CodexRuntime().execute(request)
            self.assertEqual(failure.exception.code, 'sandbox_verification_failed')
            verify_mock.assert_called_once_with(directories, 'codex')
            dispatch_mock.assert_not_called()
            self.assertEqual(json.loads((directories.outputs/'sandbox-verification.json').read_text()), failed_verification)
    def test_archive_resume_and_prelisting(self):
        config = {'start_year':2000,'end_fiscal_year':2002,'issuers':[{'id':'test','listing_date':'2001-05-01'}]}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            result = collect(config, root, execute=False)
            self.assertEqual(result['status_counts'], {'pre_listing':2,'pending':4})
            state = initialize(config, root); state['jobs'][2]['status'] = 'collected_needs_coverage_review'
            (root/'archive.json').write_text(json.dumps(state))
            self.assertEqual(collect(config, root, execute=False)['status_counts']['collected_needs_coverage_review'], 1)
            with self.assertRaises(ValueError): initialize(dict(config, start_year=1999), root)
    def test_blocked_engine_does_not_dispatch(self):
        class Blocked:
            def probe(self): return {'available':False,'collection_allowed':False}
            def execute(self, request): raise AssertionError('Must not dispatch')
        config = {'start_year':2000,'end_fiscal_year':2000,'issuers':[{'id':'test','listing_date':'1999-01-01'}]}
        with tempfile.TemporaryDirectory() as temp:
            result = collect(config, temp, runtime=Blocked())
            self.assertEqual(result['status_counts'], {'pending':2})
            self.assertIsNotNone(result['runtime_blocker'])

    def test_record_nebius_collection_with_model_provenance(self):
        config = {'start_year':2024, 'end_fiscal_year':2024,
                  'issuers':[{'id':'test', 'company':'Test Inc.', 'listing_date':'2001-01-01'}]}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'run'; source.mkdir()
            (source / 'evidence.json').write_text(json.dumps({
                'mode':'live', 'model':'nvidia/test', 'provider':'nebius', 'company':'Test Inc.',
                'status':'complete', 'claims':[],
                'documents':[{'id':'doc', 'report_type':'annual', 'fiscal_year':2024}],
            }))
            result = record_existing_run(config, root / 'archive', source)
            self.assertEqual(result['status_counts']['collected_needs_coverage_review'], 1)

if __name__ == '__main__': unittest.main()
