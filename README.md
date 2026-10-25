# Public Workspace Manager

**Your files already have a home. Give them a window.** Public Workspace Manager
turns a folder into a live, readable workspace in your browser—so you can find a
document, understand its contents, and keep your place as the work changes.

## The problem: finding a file is only half the job

A workspace can hold Markdown notes, CSV registers, scripts and nested folders.
Finding the right document often means opening several applications, reading raw
text, and switching back to the folder list to find the next file. When documents
change, an old preview can leave you looking at yesterday's work.

## The root cause: navigation and understanding are separated

Folder listings show where files live, but a filename alone rarely tells the whole
story. Editors and viewers reveal the contents, yet switching between them breaks
the connection to the surrounding workspace. A search that treats every text
match equally can also bury the file whose name matches exactly what you asked for.

The missing piece is a shared view of the folder structure, relevant search
results and readable document contents, kept in step with the files on disk.

## The solution: browse, find and read in one place

Point Public Workspace Manager at an existing folder. It provides a local,
read-only browser interface without importing your documents or requiring a new
folder structure. Each feature addresses a part of that browsing workflow:

| What gets in the way | How the workspace manager helps |
| --- | --- |
| Losing your place while opening documents | A folder tree, file list and preview sit side by side when screen space permits. |
| Raw document syntax obscuring the content | Markdown renders as readable text, CSV becomes a scrollable table with sticky headers, and code gets syntax highlighting with exact-text copying. |
| Remembering a filename or a phrase, but not its location | Literal, case-insensitive search checks filenames and contents, ranks filename matches first, and can stay within the current folder and its subfolders. |
| Looking at an outdated listing or preview | Automatic polling refreshes the tree, file list and selected document as files change. |
| Panels competing for limited screen space | Collapsible navigation, draggable and keyboard-accessible dividers, and responsive scrolling let you adjust the view. |
| Large files or searches producing too much to display | Bounded previews and paginated search show limit notices so you know when results are incomplete. |

"Public" describes the intended open-source project, not access to your files.
The application is available under the [Apache-2.0 licence](LICENSE).
Vendored libraries retain their own licences; see [LICENSING.md](LICENSING.md).

## Run

Requires Python 3.10 or newer. No runtime Python dependencies or CDN access.

### Windows: launch from your desktop

1. Clone the repository or download and extract its ZIP into a permanent folder.
2. Double-click **Create Desktop Shortcuts.bat** once.
3. Open **Public Workspace Manager** from your desktop. On first launch, paste
   the full path of the folder you want to browse (for example `C:\Users\You\Documents`).

The launcher remembers that folder, selects an available port, and opens your
default browser. Keep its terminal window open while browsing; close it or press
Ctrl+C to stop the server. Use the **Choose workspace folder** shortcut to switch
folders. You can also double-click **Start Workspace Manager.bat** directly.

Python 3.10+ must already be installed. If Python cannot be found, install it with
the PATH option enabled. Keep the extracted application folder in place: desktop
shortcuts point to it. If you move it, rerun the shortcut setup. The remembered
path is stored in `%LOCALAPPDATA%\PublicWorkspaceManager\launcher.json`.

These launchers run the app on the Windows computer itself. For an app already
running on a headless server, bookmark its private browser URL instead; the server
still needs its own running process. Desktop launchers use a changing local port,
so use the fixed-port command below for a reverse proxy.

### Command line

```sh
python3 run.py --root ./examples/workspace
```

Open http://127.0.0.1:8765. Use `--root /path/to/your/folder` to browse another directory.
Alternatively install with `python3 -m pip install .` and run `workspace-manager --root /path/to/folder`.

### Choosing a port and avoiding conflicts

Port **8765 is a configurable default**, not a required standard. If another
application is already using it, the manager cannot start on that address and
currently reports an "address already in use" error. The existing application
continues running; the manager does not automatically try another port.

**For local browsing, especially if you are unsure which ports are available,**
let the operating system select an available port:

```sh
python3 run.py --root ./examples/workspace --port 0
```

Open the actual `http://127.0.0.1:...` address printed in the terminal. Do not open
port 0 itself. The selected port may change each time you start the manager;
keep the terminal running while you browse.

**For a predictable address,** choose an available fixed port instead:

```sh
python3 run.py --root ./examples/workspace --port 9000
```

Then open http://127.0.0.1:9000. Port 9000 is only an example and could also be
occupied. If it is, choose another port or use `--port 0`; there is no need to
stop an unfamiliar application just to free the default port.

**For Tailscale or another reverse proxy,** use a fixed local port and configure
the proxy to forward to that same address. If you change the manager's port,
update the proxy's forwarding destination too. An automatically selected port is
not suitable for a static forwarding configuration. The browser-facing HTTPS
port may differ from the manager's local port.

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
