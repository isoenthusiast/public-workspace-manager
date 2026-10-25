import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from workspace_manager import server


class ExplorerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous = server.ROOT
        server.ROOT = Path(self.temp.name)
        self.root = server.ROOT

    def tearDown(self):
        server.ROOT = self.previous
        self.temp.cleanup()

    def test_changes_are_visible(self):
        self.assertEqual(server.listing('')['entries'], [])
        folder = self.root / 'New folder'
        folder.mkdir()
        doc = folder / 'Document.md'
        doc.write_text('first')
        self.assertEqual(server.listing('')['entries'][0]['name'], 'New folder')
        self.assertEqual(server.preview('New folder/Document.md')['content'], 'first')
        doc.write_text('changed')
        self.assertEqual(server.preview('New folder/Document.md')['content'], 'changed')
        doc.rename(folder / 'Renamed.md')
        self.assertEqual(server.listing('New folder')['entries'][0]['name'], 'Renamed.md')
        (folder / 'Renamed.md').unlink()
        self.assertEqual(server.listing('New folder')['entries'], [])
        folder.rmdir()
        self.assertEqual(server.listing('')['entries'], [])

    def test_boundaries_and_links(self):
        (self.root / '.env').write_text('secret')
        (self.root / 'credentials.json').write_text('secret')
        (self.root / 'outside').symlink_to('/etc')
        (self.root / 'hidden-link').symlink_to(self.root / '.env')
        (self.root / 'allowed').mkdir()
        (self.root / 'alias').symlink_to(self.root / 'allowed')
        self.assertEqual({e['name'] for e in server.listing('')['entries']}, {'allowed', 'alias'})
        for path in ['../README.md', '/etc/passwd', '.env', 'credentials.json', 'outside/passwd', 'hidden-link']:
            with self.assertRaises(PermissionError):
                server.resolve_path(path)
        self.assertEqual(server.listing('alias')['entries'], [])

    def test_preview_limits_and_literal_html(self):
        (self.root / 'page.html').write_text('<script>alert(1)</script>')
        self.assertEqual(server.preview('page.html')['content'], '<script>alert(1)</script>')
        (self.root / 'large.txt').write_text('a' * (server.LIMIT + 2))
        self.assertTrue(server.preview('large.txt')['truncated'])
        (self.root / 'binary.bin').write_bytes(b'\x00\xff')
        self.assertIn('unavailable', server.preview('binary.bin')['content'])

    def test_content_search(self):
        (self.root / 'folder').mkdir()
        (self.root / 'folder' / 'one.md').write_text('first\nNeedle [literal] match\n')
        (self.root / 'two.txt').write_text('NEEDLE here')
        (self.root / '.env').write_text('needle secret')
        (self.root / 'binary').write_bytes(b'needle\0\xff')
        (self.root / 'outside').symlink_to('/etc')
        (self.root / 'alias').symlink_to(self.root / 'folder' / 'one.md')
        result = server.search_contents('needle')
        self.assertEqual({m['path'] for m in result['matches']}, {'folder/one.md', 'two.txt'})
        scoped = server.search_contents('[literal]', 'folder')['matches']
        self.assertEqual(len(scoped), 1)
        self.assertEqual(scoped[0]['line'], 2)
        self.assertFalse(server.search_contents('missing')['matches'])
        with self.assertRaises(PermissionError):
            server.search_contents('needle', '../')
        with self.assertRaises(ValueError):
            server.search_contents('')
        for number in range(105):
            (self.root / f'page-{number:03}.txt').write_text('pagination-marker')
        first = server.search_contents('pagination-marker')
        self.assertEqual(len(first['matches']), 100)
        self.assertIsNotNone(first['nextOffset'])
        second = server.search_contents('pagination-marker', offset=first['nextOffset'])
        self.assertEqual(len(second['matches']), 5)
        self.assertFalse(second['limited'])

    def test_search_relevance(self):
        for name, content in {
            'needle.md': 'unrelated',
            'needle-guide.md': 'unrelated',
            'guide-needle.txt': 'unrelated',
            'prenedlesuffix.txt': 'unrelated',
            'preneedlesuffix.txt': 'unrelated',
            'body-many.md': 'needle needle needle',
            'body-once.md': 'needle',
        }.items():
            (self.root / name).write_text(content)
        results = server.search_contents('NEEDLE')['matches']
        self.assertEqual([m['name'] for m in results], [
            'needle.md', 'needle-guide.md', 'guide-needle.txt',
            'preneedlesuffix.txt', 'body-many.md', 'body-once.md'])
        self.assertIsNone(results[0]['line'])
        (self.root / 'needle.bin').write_bytes(b'\0\xff')
        self.assertIn('needle.bin', {m['name'] for m in server.search_contents('needle')['matches']})

    def test_csv_preview(self):
        doc = self.root / 'records.csv'
        doc.write_text('\ufeffName,Notes\r\n"A, B","Line one\nLine two"\r\nC,"He said ""Hello"""\r\n')
        self.assertEqual(server.preview('records.csv')['rows'], [
            ['Name', 'Notes'], ['A, B', 'Line one\nLine two'], ['C', 'He said "Hello"']])
        doc.write_text('')
        self.assertEqual(server.preview('records.csv')['rows'], [])
        doc.write_text('Name\n' + 'row\n' * 2002)
        result = server.preview('records.csv')
        self.assertEqual(len(result['rows']), 2001)
        self.assertTrue(result['tableLimited'])
        doc.write_text('Name\n"unterminated')
        self.assertIn('csvError', server.preview('records.csv'))

    def test_http_access(self):
        http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{http.server_port}'
        try:
            for route in ['/', '/app.js', '/style.css', '/api/list']:
                with urlopen(base + route) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.headers['Cache-Control'], 'no-store')
            for headers in [{'Host': 'attacker.example'}, {'Origin': 'https://attacker.example'}, {'Sec-Fetch-Site': 'cross-site'}]:
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(base + '/api/list', headers=headers))
                self.assertEqual(error.exception.code, 403)
            http.trusted_origin = 'https://test-tailnet.ts.net:8466'
            with urlopen(Request(base + '/api/list', headers={
                'Host': 'test-tailnet.ts.net:8466', 'Origin': http.trusted_origin
            })) as response:
                self.assertEqual(response.status, 200)
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base + '/api/list', headers={
                    'Host': 'test-tailnet.ts.net:8466', 'Origin': 'https://attacker.example'
                }))
            self.assertEqual(error.exception.code, 403)
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base + '/api/list', data=b'{}', method='POST'))
            self.assertEqual(error.exception.code, 501)
        finally:
            http.shutdown()
            http.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
