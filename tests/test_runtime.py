import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from credibility import permissions
from credibility.engine import AgentDirectories
from credibility.runtime import CodexRuntime


class RuntimeTests(unittest.TestCase):
    def test_model_and_reasoning_substitution_is_rejected(self):
        with self.assertRaises(ValueError):
            CodexRuntime(model='gpt-6-luna')
        with self.assertRaises(ValueError):
            CodexRuntime(reasoning_effort='high')

    def test_exec_command_has_exact_model_and_no_legacy_sandbox_flags(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            directories = AgentDirectories(root/'inputs', root/'work', root/'outputs')
            command = CodexRuntime()._command(directories, root/'schema.json', root/'response.json')

            self.assertIn('--ignore-user-config', command)
            self.assertIn('--ignore-rules', command)
            self.assertIn('--ephemeral', command)
            self.assertIn('--search', command)
            self.assertEqual(command[command.index('--model') + 1], 'gpt-5.6-luna')
            self.assertIn('model_reasoning_effort="xhigh"', command)
            self.assertNotIn('--sandbox', command)
            self.assertNotIn('-s', command)

    def test_sandbox_and_exec_use_the_same_profile_arguments(self):
        expected = {
            'input_read':'allowed',
            'work_write':'allowed',
            'output_write':'allowed',
            'input_write':'denied',
            'sibling_read':'denied',
            'sibling_write':'denied',
            'symlink_read':'denied',
        }
        stdout = ''.join(f'{key}={value}\n' for key, value in expected.items())
        completed = subprocess.CompletedProcess(
            ['codex'], 0, stdout=stdout, stderr='',
        )
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            directories = AgentDirectories(root/'inputs', root/'work', root/'outputs')
            with patch('credibility.permissions.subprocess.run', return_value=completed) as sandbox_run:
                result = permissions.verify(directories)

            self.assertTrue(result['verified'])
            sandbox_command = sandbox_run.call_args.args[0]
            exec_command = CodexRuntime(enable_search=False)._command(
                directories, root/'schema.json', root/'response.json',
            )
            profile_args = permissions.profile_arguments(directories)
            self.assertEqual(sandbox_command[1:1 + len(profile_args)], profile_args)
            self.assertEqual(exec_command[1:1 + len(profile_args)], profile_args)
            self.assertIn('-P', sandbox_command)
            self.assertIn(permissions.PROFILE, sandbox_command)
            self.assertIn('default_permissions="management-research"', profile_args)

    def test_probe_stops_after_failed_sandbox_verification(self):
        failed = {'verified':False,'status':'sandbox_launch_failed'}
        version = subprocess.CompletedProcess(
            ['codex', '--version'], 0, stdout='codex 0.146.0\n', stderr='',
        )
        with patch('credibility.runtime.subprocess.run', return_value=version) as run_mock, \
             patch('credibility.runtime.verify', return_value=failed) as verify_mock:
            result = CodexRuntime().probe(execute=True)

        self.assertFalse(result['available'])
        self.assertFalse(result['collection_allowed'])
        self.assertEqual(result['sandbox'], failed)
        verify_mock.assert_called_once()
        self.assertEqual(run_mock.call_count, 1)
        self.assertEqual(run_mock.call_args.args[0], ['codex', '--version'])


if __name__ == '__main__':
    unittest.main()
