"""Interactive desktop launcher; remembers only the chosen workspace path."""
import json
import os
from pathlib import Path
import subprocess
import sys

APP = Path(__file__).resolve().parent


def main():
    config = Path(os.environ.get('LOCALAPPDATA') or Path.home() / '.config') / 'PublicWorkspaceManager' / 'launcher.json'
    folder = None
    if '--choose-folder' not in sys.argv:
        try:
            folder = Path(json.loads(config.read_text(encoding='utf-8'))['root'])
        except (OSError, ValueError, KeyError, TypeError):
            pass
    if folder is None or not folder.is_dir():
        print('Public Workspace Manager\nChoose the folder you want to browse.')
        entered = input('Full folder path (or Enter to cancel): ').strip().strip('"')
        if not entered:
            return 0
        folder = Path(entered).expanduser().resolve()
        if not folder.is_dir():
            print('That folder does not exist. Please start the launcher again.')
            return 1
        try:
            config.parent.mkdir(parents=True, exist_ok=True)
            config.write_text(json.dumps({'root': str(folder)}), encoding='utf-8')
        except OSError as exc:
            print(f'Could not remember the folder: {exc}. Continuing for this session.')
    print(f'Browsing: {folder}\nKeep this window open. Close it or press Ctrl+C to stop.\n'
          'To change folders, use the Choose Workspace Folder launcher or shortcut.', flush=True)
    try:
        return subprocess.call([sys.executable, str(APP / 'run.py'), '--root', str(folder), '--port', '0', '--open-browser'])
    except KeyboardInterrupt:
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
