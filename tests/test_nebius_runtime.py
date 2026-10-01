import copy
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from credibility.api_transport import ApiRuntimeError, JsonTransport
from credibility.engine import AgentDirectories, EngineRequest
from credibility.engine_factory import create_engine, read_environment
from credibility.fixtures import FixtureRuntime, fixture_fetch
from credibility.nebius_runtime import NebiusRuntime
from credibility.pipeline import Coordinator

MODEL = 'nvidia/test-model'
SCHEMA = {'type': 'object', 'properties': {'ok': {'type': 'boolean'}},
          'required': ['ok'], 'additionalProperties': False}


def completion(content=None, calls=None, finish='stop'):
    return {'choices': [{'finish_reason': finish, 'message': {
        'role': 'assistant', 'content': content, 'tool_calls': calls,
    }}], 'usage': {'prompt_tokens': 30, 'completion_tokens': 10}}


def search_call(ident='search-1', query='issuer annual report', name='web_search'):
    return {'id': ident, 'type': 'function', 'function': {
        'name': name, 'arguments': json.dumps({'query': query}),
    }}


class ScriptedTransport:
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []

    def request(self, url, api_key, payload, **kwargs):
        self.calls.append((url, api_key, copy.deepcopy(payload), kwargs))
        result = self.responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class NebiusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.dirs = AgentDirectories(root / 'inputs', root / 'work', root / 'outputs')

    def runtime(self, transport, **kwargs):
        return NebiusRuntime(api_key='nebius-secret', tavily_api_key='tavily-secret',
                             model=MODEL, transport=transport, **kwargs)

    def request(self, search=False):
        return EngineRequest('Find evidence', SCHEMA, self.dirs, search, ('issuer.example',))

    def test_search_round_trip_and_secret_free_provenance(self):
        transport = ScriptedTransport(
            completion(calls=[search_call()]),
            {'results': [{'url': 'https://issuer.example/report', 'title': 'Annual', 'content': 'Report text'}]},
            completion('Ready'), completion('{"ok":true}'),
        )
        result = self.runtime(transport).execute(self.request(True))
        self.assertEqual(result.data, {'ok': True})
        self.assertEqual(result.provider, 'nebius')
        search = transport.calls[1]
        self.assertEqual(search[0], 'https://api.tavily.com/search')
        self.assertEqual(search[1], 'tavily-secret')
        self.assertEqual(search[2]['include_domains'], ['issuer.example'])
        self.assertFalse(search[2]['include_raw_content'])
        final = transport.calls[-1][2]
        self.assertNotIn('tools', final)
        self.assertEqual(final['response_format']['json_schema']['schema'], SCHEMA)
        tool = next(m for m in final['messages'] if m['role'] == 'tool')
        self.assertEqual(tool['tool_call_id'], 'search-1')
        self.assertIn('https://issuer.example/report', tool['content'])
        self.assertEqual(len({c[3]['deadline'] for c in transport.calls}), 1)
        saved = ''.join(p.read_text() for p in Path(self.temp.name).rglob('*') if p.is_file())
        for secret in ('nebius-secret', 'tavily-secret'):
            self.assertNotIn(secret, saved)
            self.assertNotIn(secret, json.dumps([c[2] for c in transport.calls]))
        execution = json.loads(next(self.dirs.outputs.glob('*.execution.json')).read_text())
        self.assertEqual(execution['reasoning_effort'], 'provider_default')
        self.assertFalse(execution['filesystem_tools'])

    def test_extraction_has_no_tools_or_cli_dependency(self):
        transport = ScriptedTransport(completion('{"ok":true}'))
        with patch('subprocess.run', side_effect=AssertionError('No CLI calls allowed')):
            self.runtime(transport).execute(self.request())
        self.assertEqual(len(transport.calls), 1)
        self.assertNotIn('tools', transport.calls[0][2])

    def test_invalid_outputs_fail_without_saving_a_success(self):
        cases = [(completion('not JSON'), 'invalid_response'),
                 (completion('{"ok":"true"}'), 'invalid_response'),
                 (completion('{"ok":true}', finish='length'), 'output_truncated'),
                 (completion('{"ok":true}', calls=[search_call()]), 'unexpected_tool_call'),
                 ({'choices': []}, 'invalid_response')]
        for response, code in cases:
            with self.subTest(code=code):
                with self.assertRaises(ApiRuntimeError) as error:
                    self.runtime(ScriptedTransport(response)).execute(self.request())
                self.assertEqual(error.exception.code, code)
        self.assertEqual(list(self.dirs.outputs.glob('*.response.json')), [])

    def test_unknown_tool_and_bad_arguments_never_dispatch(self):
        bad = search_call()
        bad['function']['arguments'] = '{"query":"test","command":"cat .env"}'
        for call in (search_call(name='shell'), bad, search_call(query='')):
            transport = ScriptedTransport(completion(calls=[call]))
            with self.assertRaises(ApiRuntimeError) as error:
                self.runtime(transport).execute(self.request(True))
            self.assertEqual(error.exception.code, 'invalid_tool_call')
            self.assertEqual(len(transport.calls), 1)

    def test_discovery_requires_actual_search(self):
        with self.assertRaises(ApiRuntimeError) as error:
            self.runtime(ScriptedTransport(completion('{"ok":true}'))).execute(self.request(True))
        self.assertEqual(error.exception.code, 'search_not_called')

    def test_call_cap_stops_repeated_searches_and_finalizes(self):
        transport = ScriptedTransport(completion(calls=[search_call()]), {'results': []},
                                      completion('{"ok":true}'))
        self.runtime(transport, max_search_calls=1).execute(self.request(True))
        self.assertEqual(len(transport.calls), 3)
        self.assertNotIn('tools', transport.calls[-1][2])

    def test_oversized_tool_batch_fails_before_search(self):
        transport = ScriptedTransport(completion(calls=[search_call('1'), search_call('2')]))
        with self.assertRaises(ApiRuntimeError) as error:
            self.runtime(transport, max_search_calls=1).execute(self.request(True))
        self.assertEqual(error.exception.code, 'search_limit')
        self.assertEqual(len(transport.calls), 1)

    def test_search_failure_is_not_silently_replaced_with_model_memory(self):
        transport = ScriptedTransport(completion(calls=[search_call()]),
                                      ApiRuntimeError('authentication_failed', 'Tavily failed'))
        with self.assertRaises(ApiRuntimeError):
            self.runtime(transport).execute(self.request(True))
        self.assertEqual(len(transport.calls), 2)

    def test_missing_configuration_fails_before_any_network(self):
        for options, code in (({}, 'missing_credentials'), ({'api_key': 'key'}, 'missing_credentials'),
                              ({'api_key': 'key', 'tavily_api_key': 'key'}, 'missing_model')):
            transport = ScriptedTransport()
            runtime = NebiusRuntime(transport=transport, **options)
            self.assertEqual(runtime.probe()['execution'], code)
            self.assertEqual(transport.calls, [])

    def test_probe_model_check_and_full_search_path(self):
        missing = self.runtime(ScriptedTransport({'data': [{'id': 'different-model'}]})).probe()
        self.assertFalse(missing['collection_allowed'])
        self.assertEqual(missing['execution'], 'model_unavailable')
        transport = ScriptedTransport({'data': [{'id': MODEL}]},
                                      completion(calls=[search_call()]), {'results': []},
                                      completion('Ready'), completion('{"ok":true}'))
        result = self.runtime(transport).probe()
        self.assertTrue(result['collection_allowed'])
        self.assertEqual(result['execution'], 'success')

    def test_no_execute_probe_does_not_claim_collection_ready(self):
        result = self.runtime(ScriptedTransport({'data': [{'id': MODEL}]})).probe(execute=False)
        self.assertTrue(result['model_verified'])
        self.assertFalse(result['collection_allowed'])

    def test_listing_needs_only_nebius_key(self):
        runtime = NebiusRuntime(api_key='key', transport=ScriptedTransport({'data': [{'id': MODEL}]}))
        self.assertEqual(runtime.list_models(), [MODEL])

    def test_reject_unsafe_endpoint_and_invalid_limits(self):
        for options in ({'base_url': 'http://example.com/v1'}, {'base_url': 'https://key@example.com/v1'},
                        {'base_url': 'https://example.com/v1?key=secret'}, {'max_search_calls': 0},
                        {'timeout_s': 0}, {'max_tokens': 20}):
            with self.assertRaises(ValueError):
                NebiusRuntime(**options)

    def test_concurrent_pipeline_uses_independent_conversations(self):
        barrier = threading.Barrier(2)
        class PipelineTransport:
            def request(self, url, key, payload, **kwargs):
                if url.endswith('/search'):
                    return {'results': []}
                if 'tools' in payload:
                    barrier.wait(timeout=5)
                    return completion(calls=[search_call()])
                schema = payload['response_format']['json_schema']['schema']
                prompt = payload['messages'][1]['content']
                data = FixtureRuntime().run(prompt, schema, None)
                return completion(json.dumps(data))
        config = json.loads((Path(__file__).parents[1] / 'src/credibility/examples/fictional.json').read_text())
        result = Coordinator(config, self.runtime(PipelineTransport(), max_search_calls=1),
                             Path(self.temp.name) / 'run', fetcher=fixture_fetch).run()
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(len(result['claims']), 4)
        self.assertEqual(result['provider'], 'nebius')
        self.assertEqual(result['reasoning_effort'], 'provider_default')


class ConfigurationTests(unittest.TestCase):
    def test_dotenv_quotes_comments_precedence_and_no_shell_expansion(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'NEBIUS_API_KEY': 'environment-key'}, clear=True):
            env = Path(temp) / '.env'
            env.write_text('export NEBIUS_API_KEY="file-key" # comment\nTAVILY_API_KEY=search-key\n'
                           'NEBIUS_MODEL="nvidia/test"\nCREDIBILITY_ENGINE=nebius\nLITERAL="$(touch nope)"\n')
            values = read_environment(env)
            self.assertEqual(values['NEBIUS_API_KEY'], 'environment-key')
            self.assertEqual(values['LITERAL'], '$(touch nope)')
            engine = create_engine(env_file=env)
            self.assertIsInstance(engine, NebiusRuntime)
            self.assertEqual(engine.model, 'nvidia/test')
            self.assertNotIn('TAVILY_API_KEY', os.environ)
            self.assertEqual(create_engine('codex', env).provider, 'codex-cli')

    def test_dotenv_errors_do_not_echo_secrets(self):
        with tempfile.TemporaryDirectory() as temp:
            env = Path(temp) / '.env'
            for line in ('NEBIUS_API_KEY="private-secret', 'private-secret'):
                env.write_text(line)
                with self.assertRaises(ValueError) as error:
                    read_environment(env)
                self.assertNotIn('private-secret', str(error.exception))
            with self.assertRaises(ValueError):
                read_environment(Path(temp) / 'missing')

    def test_cli_missing_model_is_actionable_and_does_not_create_output(self):
        with tempfile.TemporaryDirectory() as temp:
            env = Path(temp) / '.env'
            env.write_text('NEBIUS_API_KEY=key\nTAVILY_API_KEY=key\nNEBIUS_MODEL=\n')
            output = Path(temp) / 'output'
            result = subprocess.run([sys.executable, '-m', 'credibility', '--engine', 'nebius',
                '--env-file', str(env), '--config', 'src/credibility/examples/fictional.json',
                '--output', str(output)], capture_output=True, text=True,
                env={'PATH': os.environ.get('PATH', ''), 'PYTHONPATH': 'src'})
            self.assertEqual(result.returncode, 2)
            self.assertIn('NEBIUS_MODEL', result.stderr)
            self.assertFalse(output.exists())

    def test_archive_plan_does_not_read_credentials(self):
        from credibility.archive import main
        with tempfile.TemporaryDirectory() as temp:
            config = Path(temp) / 'config.json'
            config.write_text(json.dumps({'start_year':2024, 'end_fiscal_year':2024,
                'issuers':[{'id':'test', 'listing_date':'2001-01-01'}]}))
            with patch('sys.argv', ['archive', '--engine', 'nebius', '--plan-only',
                '--env-file', str(Path(temp) / 'missing'), '--config', str(config),
                '--output', str(Path(temp) / 'archive')]), patch('sys.stdout', new_callable=io.StringIO):
                main()
            self.assertTrue((Path(temp) / 'archive' / 'coverage.json').exists())


class TransportTests(unittest.TestCase):
    def request(self):
        return JsonTransport().request('https://api.example/v1', 'private-secret', {'test': True},
                                        deadline=time.monotonic() + 30, provider='Nebius')

    def test_retry_transient_status_and_do_not_log_provider_errors(self):
        error = HTTPError('https://api.example/v1', 429, 'private-secret', {}, io.BytesIO(b'private-secret'))
        with patch('credibility.api_transport.build_opener') as opener, patch('credibility.api_transport.time.sleep'):
            success = opener.return_value.open.return_value
            success.__enter__.return_value.read.return_value = b'{"ok":true}'
            opener.return_value.open.side_effect = [error, success]
            self.assertEqual(self.request(), {'ok': True})
            self.assertEqual(opener.return_value.open.call_count, 2)
        error = HTTPError('https://api.example/v1', 401, 'private-secret', {}, io.BytesIO(b'private-secret'))
        with patch('credibility.api_transport.build_opener') as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaises(ApiRuntimeError) as caught:
                self.request()
            self.assertEqual(caught.exception.code, 'authentication_failed')
            self.assertNotIn('private-secret', str(caught.exception))
            self.assertEqual(opener.return_value.open.call_count, 1)

    def test_network_errors_and_invalid_bodies_are_sanitized(self):
        with patch('credibility.api_transport.build_opener') as opener:
            opener.return_value.open.side_effect = URLError('private-secret')
            with self.assertRaises(ApiRuntimeError) as caught:
                self.request()
            self.assertNotIn('private-secret', str(caught.exception))
        for body, code in ((b'private-secret', 'invalid_response'), (b'x' * 4_000_001, 'response_too_large')):
            with patch('credibility.api_transport.build_opener') as opener:
                opener.return_value.open.return_value.__enter__.return_value.read.return_value = body
                with self.assertRaises(ApiRuntimeError) as caught:
                    self.request()
                self.assertEqual(caught.exception.code, code)

    def test_expired_deadline_does_not_dispatch(self):
        with patch('credibility.api_transport.build_opener') as opener:
            with self.assertRaises(ApiRuntimeError) as caught:
                JsonTransport().request('https://example.com', 'key', {}, deadline=0, provider='Nebius')
            self.assertEqual(caught.exception.code, 'timeout')
            opener.assert_not_called()

    def test_retries_are_bounded_and_redirects_fail(self):
        for status, count in ((503, 3), (302, 1)):
            with patch('credibility.api_transport.build_opener') as opener, \
                 patch('credibility.api_transport.time.sleep'):
                opener.return_value.open.side_effect = [
                    HTTPError('https://api.example/v1', status, 'private-secret', {}, io.BytesIO())
                    for _ in range(count)]
                with self.assertRaises(ApiRuntimeError) as caught:
                    self.request()
                self.assertEqual(caught.exception.code, 'http_error')
                self.assertEqual(opener.return_value.open.call_count, count)
                self.assertNotIn('private-secret', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
