# Public Workspace Manager

A local, read-only file browser with live previews and filename-first text search.
"Public" describes the intended open-source project, not access to your files.
This repository is a private release candidate; publication and the project licence remain pending review.

## Run

Requires Python 3.10 or newer. No runtime Python dependencies or CDN access.

```sh
python3 run.py --root ./examples/workspace
```

Open http://127.0.0.1:8765. Use `--root /path/to/your/folder` to browse another directory.
Alternatively install with `python3 -m pip install .` and run `workspace-manager --root /path/to/folder`.

## Features

- Automatically refreshed folder tree, file lists and previews.
- Collapsible navigation and draggable, keyboard-accessible pane dividers.
- Side-by-side previews when space permits; scrollable, viewport-aware panels.
- Minimal Markdown, CSV tables with sticky headers, syntax-highlighted code and copy.
- Literal, case-insensitive filename/content search with filename relevance first.
- Bounded previews and paginated search with visible truncation notices.

## Configuration

Run `python3 run.py --help` for all options. Defaults: port 8765, polling every
2 seconds, previews up to 512 KiB, 100 results per search batch, 64 MiB of text
reads and a 6-second content-search budget. Inventory is capped at 100,000 files;
its traversal occurs before that content-search budget. Large or slow filesystems
can therefore take longer. Search is not an indexed database.

Use `--title "My workspace"`, repeatable `--exclude NAME`, and the preview/search
limit options to customize. Exclusions match exact path-component names.
Hidden paths, common credential names, dependency folders and out-of-root symlinks
are excluded. Exclusions are convenience controls, not a secret scanner.

The server binds only to loopback. For remote access, use an authenticated private
reverse proxy such as Tailscale Serve and pass its exact HTTPS origin through
`--trusted-origin`. That option validates requests; it does not authenticate users.
Anyone allowed through the proxy can read the selected workspace. Never expose
this service through an unauthenticated public proxy.

## Development

```sh
python3 -m unittest discover -s tests -v
npm ci
npx playwright install chromium
npm test
```

Browser tests use a temporary fictional workspace and their own local server.
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` only if using an existing Chromium binary.
Linux is the currently verified platform. See SECURITY.md and LICENSING.md.
