import copy
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from credibility.fixtures import FixtureRuntime, fixture_fetch
from credibility.pipeline import Coordinator
from credibility.schema import EXTRACTION

CONFIG = json.loads((Path(__file__).parents[1] / 'src/credibility/examples/fictional.json').read_text())
class Tests(unittest.TestCase):
    def run_pipeline(self, runtime=None, config=None, fetcher=fixture_fetch):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / 'run'
            result = Coordinator(config or CONFIG, runtime or FixtureRuntime(), out, fetcher=fetcher).run()
            self.assertEqual(result, json.loads((out / 'evidence.json').read_text()))
            return result
    def test_fixture_and_provenance(self):
        result = self.run_pipeline()
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(len(result['documents']), 2)
        self.assertEqual(len(result['claims']), 4)
        self.assertEqual(result['claims'][0]['target_date'], 'December 2027')
        self.assertEqual(result['mode'], 'fixture')
    def test_reject_hallucinated_quote(self):
        class Bad(FixtureRuntime):
            def run(self, prompt, schema, workdir):
                value = super().run(prompt, schema, workdir)
                if schema == EXTRACTION: value['claims'][0]['excerpt'] = 'A fabricated promise'
                return value
        result = self.run_pipeline(Bad())
        self.assertEqual(len(result['claims']), 2)
        self.assertEqual(result['status'], 'partial')
    def test_partial_failure_retains_other_report(self):
        class Failing(FixtureRuntime):
            def run(self, prompt, schema, workdir):
                if '2026-03-31' in prompt: raise TimeoutError('private detail')
                return super().run(prompt, schema, workdir)
        result = self.run_pipeline(Failing())
        self.assertEqual(len(result['documents']), 1)
        self.assertNotIn('private detail', json.dumps(result))
    def test_duplicate_report_dedup(self):
        config = copy.deepcopy(CONFIG); config['reports'] *= 2
        result = self.run_pipeline(config=config)
        self.assertEqual(len(result['documents']), 2)
        self.assertEqual(len(result['claims']), 4)
    def test_bounded_parallelism(self):
        class Counting(FixtureRuntime):
            active = 0; maximum = 0; lock = threading.Lock()
            def run(self, prompt, schema, workdir):
                with self.lock:
                    self.active += 1; self.maximum = max(self.maximum, self.active)
                try:
                    time.sleep(.01)
                    return super().run(prompt, schema, workdir)
                finally:
                    with self.lock: self.active -= 1
        runtime = Counting(); config = copy.deepcopy(CONFIG); config['reports'] *= 3
        self.run_pipeline(runtime, config)
        self.assertEqual(runtime.maximum, 2)
    def test_network_failure_is_gap(self):
        def fail(*args): raise ValueError('network blocked')
        result = self.run_pipeline(fetcher=fail)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['claims'], [])

if __name__ == '__main__': unittest.main()
