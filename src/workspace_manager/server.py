"""Local, read-only workspace explorer. Python standard library only."""
import argparse
import codecs
import csv
import io
import itertools
import json
import os
import re
import time
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

APP = Path(__file__).resolve().parent
ROOT = Path.cwd().resolve()
LIMIT = 512 * 1024
TITLE = "Public Workspace Manager"
POLL_SECONDS = 2.0
EXTRA_EXCLUDES = set()
SEARCH_RESULTS = 100
SEARCH_BYTES = 64 * 1024 * 1024
SEARCH_SECONDS = 6.0
SEARCH_FILES = 100000


def excluded(parts):
    return any(p.startswith('.') or p.casefold() in EXTRA_EXCLUDES or p.lower() in {'node_modules', '__pycache__', 'narration', 'audio'}
               or p.lower().startswith('credentials') or 'private-key' in p.lower()
               or p.lower().endswith(('.pem', '.key')) for p in parts)


def resolve_path(raw):
    path = Path(raw)
    if path.is_absolute() or '..' in path.parts or excluded(path.parts):
        raise PermissionError('This path is not available in the explorer.')
    target = (ROOT / path).resolve()
    if os.path.commonpath((str(ROOT), str(target))) != str(ROOT) or excluded(Path(os.path.relpath(target, ROOT)).parts):
        raise PermissionError('Links outside the workspace are not accessible.')
    return target


def listing(raw):
    folder = resolve_path(raw)
    if not folder.is_dir():
        raise FileNotFoundError('Folder no longer exists.')
    entries = []
    for item in folder.iterdir():
        if excluded((item.name,)):
            continue
        rel = str(Path(raw) / item.name)
        try:
            target = resolve_path(rel)
            stat = target.stat()
            if not (target.is_file() or target.is_dir()):
                continue
            entries.append(dict(name=item.name, path=rel, directory=target.is_dir(),
                                link=item.is_symlink(), size=stat.st_size,
                                modified=stat.st_mtime_ns))
        except (OSError, ValueError):
            continue
    entries.sort(key=lambda e: (not e['directory'], e['name'].casefold()))
    return dict(path=raw, entries=entries)


def preview(raw):
    file = resolve_path(raw)
    if not file.is_file():
        raise FileNotFoundError('File no longer exists.')
    with file.open('rb') as stream:
        data = stream.read(LIMIT + 1)
    try:
        if b'\0' in data:
            raise UnicodeError()
        content = codecs.getincrementaldecoder('utf-8')().decode(data[:LIMIT], final=len(data) <= LIMIT)
    except UnicodeError:
        return dict(path=raw, content='Preview unavailable for this binary or non-UTF-8 file.', truncated=False)
    result = dict(path=raw, content=content, truncated=len(data) > LIMIT)
    if file.suffix.lower() == '.csv':
        try:
            rows = list(itertools.islice(csv.reader(io.StringIO(content.lstrip('\ufeff')), strict=True), 2002))
            # A byte-limited final record may be incomplete; keep only complete input.
            if result['truncated'] and rows:
                rows.pop()
            result['rows'] = rows[:2001]
            result['tableLimited'] = len(rows) > 2001 or result['truncated']
        except csv.Error:
            result['csvError'] = 'CSV could not be parsed completely; showing source text.'
    return result


def search_contents(query, raw='', offset=0):
    """Bounded literal UTF-8 content search; no index or source-file writes."""
    query = query.strip()
    if not query or len(query) > 200:
        raise ValueError('Search requires 1–200 characters.')
    if offset < 0:
        raise ValueError('Invalid search offset.')
    start = resolve_path(raw)
    if not start.is_dir():
        raise FileNotFoundError()
    needle = query.casefold()
    word_pattern = re.compile(r'(?<![\w])' + re.escape(needle) + r'(?![\w])')

    def filename_rank(name):
        folded = name.casefold()
        if needle in {folded, Path(name).stem.casefold()}:
            return 4
        if folded.startswith(needle):
            return 3
        if word_pattern.search(folded):
            return 2
        return 1 if needle in folded else 0

    # Rank names across the entire scope before reading contents, so a filename
    # match is never buried behind earlier directories' content-only matches.
    candidates, seen = [], set()
    inventory_capped = False
    for folder, dirs, files in os.walk(start, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not excluded((d,)) and not (Path(folder) / d).is_symlink())
        for name in sorted(files):
            if excluded((name,)):
                continue
            try:
                file = Path(folder) / name
                # os.walk does not follow directory links. Resolve file links
                # here, and revalidate every selected file immediately before reading.
                if file.is_symlink():
                    file = resolve_path(os.path.relpath(file, ROOT))
                if file in seen or not file.is_file():
                    continue
                seen.add(file)
                candidates.append((filename_rank(file.name), file))
                if len(candidates) >= SEARCH_FILES:
                    inventory_capped = True
                    break
            except (OSError, ValueError):
                continue
        if inventory_capped:
            break
    candidates.sort(key=lambda item: (-item[0], item[1].name.casefold(), str(item[1])))
    matches = []
    scanned = skipped = partial = bytes_read = 0
    position_in_walk = offset
    deadline = time.monotonic() + SEARCH_SECONDS
    for rank, file in candidates[offset:]:
        if time.monotonic() > deadline or bytes_read >= SEARCH_BYTES or len(matches) >= SEARCH_RESULTS:
            break
        position_in_walk += 1
        match = dict(path=str(file.relative_to(ROOT)), name=file.name, line=None,
                     snippet='Filename match', filenameRank=rank, contentHits=0)
        try:
            file = resolve_path(os.path.relpath(file, ROOT))
            with file.open('rb') as stream:
                data = stream.read(LIMIT + 1)
            bytes_read += len(data)
            if b'\0' in data:
                raise UnicodeError()
            text = codecs.getincrementaldecoder('utf-8')().decode(data[:LIMIT], final=len(data) <= LIMIT)
            partial += int(len(data) > LIMIT)
            scanned += 1
            match['contentHits'] = text.casefold().count(needle)
            if match['contentHits']:
                for number, line in enumerate(text.splitlines(), 1):
                    position = line.casefold().find(needle)
                    if position >= 0:
                        snippet_offset = max(0, position - 65)
                        match['line'] = number
                        match['snippet'] = ('…' if snippet_offset else '') + line[snippet_offset:snippet_offset + 220] + ('…' if len(line) > snippet_offset + 220 else '')
                        break
        except (OSError, UnicodeError):
            skipped += 1
            match['snippet'] = 'Filename match · contents unavailable for text search'
        if rank or match['contentHits']:
            matches.append(match)
    matches.sort(key=lambda m: (-m['filenameRank'], -m['contentHits'], m['name'].casefold(), m['path']))
    stopped = position_in_walk < len(candidates)
    return dict(query=query, matches=matches, scanned=scanned, skipped=skipped,
                partialFiles=partial, inventoryCapped=inventory_capped, limited=stopped, nextOffset=position_in_walk if stopped else None)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        port = self.server.server_port
        hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
        origins = {f'http://{h}' for h in hosts}
        trusted_origin = getattr(self.server, 'trusted_origin', None)
        if trusted_origin:
            hosts.add(urlsplit(trusted_origin).netloc)
            origins.add(trusted_origin)
        if self.headers.get('Host') not in hosts or (
            self.headers.get('Origin') and self.headers['Origin'] not in origins
        ) or self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.send_error(403)
            return
        url = urlsplit(self.path)
        raw = parse_qs(url.query).get('path', [''])[0]
        try:
            if url.path == '/api/config':
                body = json.dumps(dict(title=TITLE, pollSeconds=POLL_SECONDS, previewBytes=LIMIT, searchSeconds=SEARCH_SECONDS)).encode()
                mime = 'application/json'
            elif url.path == '/api/list':
                body = json.dumps(listing(raw)).encode()
                mime = 'application/json'
            elif url.path == '/api/preview':
                body = json.dumps(preview(raw)).encode()
                mime = 'application/json'
            elif url.path == '/api/search':
                query = parse_qs(url.query).get('q', [''])[0]
                offset = int(parse_qs(url.query).get('offset', ['0'])[0])
                body = json.dumps(search_contents(query, raw, offset)).encode()
                mime = 'application/json'
            elif url.path in {'/', '/app.js', '/style.css', '/markdown-preview.js', '/vendor/markdown-it.min.js', '/vendor/highlight.min.js'}:
                name = 'index.html' if url.path == '/' else url.path.lstrip('/')
                body = (APP / 'static' / name).read_bytes()
                mime = 'text/html' if url.path == '/' else 'text/css' if url.path == '/style.css' else 'text/javascript'
            else:
                self.send_error(404)
                return
        except (OSError, ValueError) as exc:
            self.send_response(403 if isinstance(exc, PermissionError) else 404)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Path is unavailable. It may have moved, been removed, or be restricted.'}).encode())
            return
        self.send_response(200)
        self.send_header('Content-Type', mime + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    global ROOT, LIMIT, TITLE, POLL_SECONDS, EXTRA_EXCLUDES
    global SEARCH_RESULTS, SEARCH_BYTES, SEARCH_SECONDS, SEARCH_FILES
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True, help='Directory to browse (required)')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--title', default='Public Workspace Manager')
    parser.add_argument('--poll-interval', type=float, default=2, metavar='SECONDS')
    parser.add_argument('--exclude', action='append', default=[], metavar='NAME', help='Additional excluded filename or directory name; repeatable')
    parser.add_argument('--max-preview-bytes', type=int, default=512 * 1024)
    parser.add_argument('--search-max-results', type=int, default=100)
    parser.add_argument('--search-max-bytes', type=int, default=64 * 1024 * 1024)
    parser.add_argument('--search-seconds', type=float, default=6)
    parser.add_argument('--search-max-files', type=int, default=100000)
    parser.add_argument('--trusted-origin', help='Exact HTTPS origin of an access-controlled reverse proxy')
    args = parser.parse_args()
    if not args.root.is_dir():
        parser.error('--root must be an existing directory')
    if not 0 <= args.port <= 65535:
        parser.error('--port must be between 0 and 65535')
    if not 0.5 <= args.poll_interval <= 3600 or not 0.1 <= args.search_seconds <= 60:
        parser.error('Polling must be 0.5–3600 seconds; search time must be 0.1–60 seconds')
    if min(args.max_preview_bytes, args.search_max_results, args.search_max_bytes, args.search_max_files) < 1:
        parser.error('Read and search limits must be positive')
    if args.trusted_origin:
        origin = urlsplit(args.trusted_origin)
        if origin.scheme != 'https' or not origin.hostname or origin.path or origin.query or origin.fragment or origin.username:
            parser.error('--trusted-origin must be an HTTPS origin without a path')
    ROOT = args.root.resolve()
    LIMIT, TITLE, POLL_SECONDS = args.max_preview_bytes, args.title, args.poll_interval
    EXTRA_EXCLUDES = {name.casefold() for name in args.exclude}
    SEARCH_RESULTS, SEARCH_BYTES = args.search_max_results, args.search_max_bytes
    SEARCH_SECONDS, SEARCH_FILES = args.search_seconds, args.search_max_files
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.trusted_origin = args.trusted_origin
    print(f'Workspace Manager: http://127.0.0.1:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
