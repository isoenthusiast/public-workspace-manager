import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('launcher', Path(__file__).resolve().parents[1] / 'launch.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def test_remembers_folder_and_passes_paths_without_shell_interpretation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'Workspace with spaces & symbols'
            root.mkdir()
            with patch.dict(os.environ, {'LOCALAPPDATA': directory}), patch.object(launcher.sys, 'argv', ['launch.py']), patch('builtins.input', return_value=str(root)), patch.object(launcher.subprocess, 'call', return_value=0) as call:
                self.assertEqual(launcher.main(), 0)
                self.assertEqual(call.call_args.args[0][-5:], ['--root', str(root), '--port', '0', '--open-browser'])
            with patch.dict(os.environ, {'LOCALAPPDATA': directory}), patch.object(launcher.sys, 'argv', ['launch.py']), patch('builtins.input', side_effect=AssertionError('Should remember folder')), patch.object(launcher.subprocess, 'call', return_value=0):
                self.assertEqual(launcher.main(), 0)

    def test_choose_folder_replaces_remembered_path(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'PublicWorkspaceManager' / 'launcher.json'
            config.parent.mkdir()
            config.write_text(json.dumps({'root': directory}))
            new = Path(directory) / 'new'
            new.mkdir()
            with patch.dict(os.environ, {'LOCALAPPDATA': directory}), patch.object(launcher.sys, 'argv', ['launch.py', '--choose-folder']), patch('builtins.input', return_value=str(new)), patch.object(launcher.subprocess, 'call', return_value=0):
                self.assertEqual(launcher.main(), 0)
            self.assertEqual(json.loads(config.read_text())['root'], str(new))

    def test_cancel_does_not_start_server(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {'LOCALAPPDATA': directory}), patch.object(launcher.sys, 'argv', ['launch.py']), patch('builtins.input', return_value=''), patch.object(launcher.subprocess, 'call') as call:
                self.assertEqual(launcher.main(), 0)
                call.assert_not_called()
