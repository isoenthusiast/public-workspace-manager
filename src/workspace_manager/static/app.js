const $ = id => document.getElementById(id);
let previewLimitLabel = '512 KB', searchTimeout = 15000;
function setNavigationCollapsed(collapsed) {
  document.body.classList.toggle('navigation-collapsed', collapsed);
  $('workspace-navigation').hidden = collapsed;
  const toggle = $('nav-toggle');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
  toggle.title = collapsed ? 'Expand navigation' : 'Collapse navigation';
  toggle.textContent = collapsed ? '»' : '«';
  try { localStorage.setItem('public-workspace-manager-navigation-collapsed', String(collapsed)); } catch {}
}
let navigationCollapsed = false;
try { navigationCollapsed = localStorage.getItem('public-workspace-manager-navigation-collapsed') === 'true'; } catch {}
setNavigationCollapsed(navigationCollapsed);
$('nav-toggle').onclick = () => setNavigationCollapsed(!$('workspace-navigation').hidden);
let current = '', selected = '', entries = [], signature = '', busy = false, generation = 0;
let previewSignature = '';
let codeToCopy = '';
const codeLanguages = {py:'python', pyw:'python', json:'json', php:'php', sql:'sql', js:'javascript', mjs:'javascript', cjs:'javascript', ts:'typescript', tsx:'typescript', jsx:'javascript', css:'css', html:'xml', htm:'xml', xml:'xml', sh:'bash', bash:'bash', yml:'yaml', yaml:'yaml', toml:'ini', ini:'ini', c:'c', h:'c', cpp:'cpp', cs:'csharp', java:'java', go:'go', rs:'rust', rb:'ruby'};
const expanded = new Set(['']), folders = new Map();
let treeBusy = false, treeSignature = '';
function visibleBranch(path) {
  if (path === '') return true;
  const parts = path.split('/'); parts.pop();
  while (parts.length) {
    if (!expanded.has(parts.join('/'))) return false;
    parts.pop();
  }
  return expanded.has('');
}
function renderTree() {
  const model = JSON.stringify([current, [...expanded], [...folders]]);
  if (model === treeSignature) return;
  treeSignature = model;
  const focus = document.activeElement?.dataset.treeKey;
  function branch(path, name, link = false) {
    const li = document.createElement('li'), row = document.createElement('div');
    row.className = 'tree-row';
    const toggle = button(expanded.has(path) ? '▾' : '▸', () => {
      if (expanded.has(path)) expanded.delete(path); else expanded.add(path);
      renderTree(); refreshTree();
    });
    toggle.className = 'tree-toggle'; toggle.dataset.treeKey = `toggle:${path}`;
    toggle.setAttribute('aria-label', `${expanded.has(path) ? 'Collapse' : 'Expand'} ${name}`);
    toggle.setAttribute('aria-expanded', String(expanded.has(path)));
    const label = button(`${name}${link ? ' ↗' : ''}`, () => navigate(path));
    label.className = 'tree-label'; label.title = path || 'Workspace';
    label.dataset.treeKey = `folder:${path}`;
    if (path === current) { label.setAttribute('aria-current', 'location'); row.classList.add('active'); }
    row.append(toggle, label); li.append(row);
    if (expanded.has(path)) {
      const children = document.createElement('ul');
      const data = folders.get(path);
      if (data?.length) for (const item of data) children.append(branch(item.path, item.name, item.link));
      else { const hint = document.createElement('li'); hint.className = 'tree-hint'; hint.textContent = data ? 'No subfolders' : 'Loading…'; children.append(hint); }
      li.append(children);
    }
    return li;
  }
  const list = document.createElement('ul'); list.append(branch('', 'Workspace'));
  $('folder-tree').replaceChildren(list);
  if (focus) for (const el of $('folder-tree').querySelectorAll('button')) {
    if (el.dataset.treeKey === focus) { el.focus({preventScroll: true}); break; }
  }
}
async function refreshTree() {
  if (treeBusy) return;
  treeBusy = true;
  try {
    const paths = [...expanded].filter(visibleBranch);
    const results = await Promise.allSettled(paths.map(async path => {
      const data = await api('list', path);
      folders.set(path, data.entries.filter(e => e.directory));
    }));
    $('tree-status').textContent = results.some(r => r.status === 'rejected') ? 'Some folders unavailable. Retrying…' : '';
    renderTree();
  } finally { treeBusy = false; }
}
const size = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
async function api(route, path) {
  const response = await fetch(`/api/${route}?path=${encodeURIComponent(path)}`, {signal: AbortSignal.timeout(10000)});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to read workspace');
  return body;
}
function button(text, action) { const b = document.createElement('button'); b.textContent = text; b.onclick = action; return b; }
function render() {
  const query = $('filter').value.toLowerCase();
  const visible = entries.filter(e => e.name.toLowerCase().includes(query));
  $('files').replaceChildren();
  for (const e of visible) {
    const row = document.createElement('tr');
    if (e.path === selected) row.classList.add('selected-file');
    const name = document.createElement('td');
    name.append(button(`${e.directory ? '▰' : '▤'}  ${e.name}${e.link ? ' ↗' : ''}`, () => e.directory ? navigate(e.path) : openFile(e.path)));
    row.append(name);
    for (const text of [e.directory ? '—' : size(e.size), new Date(e.modified / 1e6).toLocaleString()]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    $('files').append(row);
  }
  $('count').textContent = `${visible.length} of ${entries.length} items`;
  $('empty').hidden = visible.length !== 0;
  $('empty').textContent = query ? 'No matching files in this folder.' : 'This folder is empty.';
}
function breadcrumbs() {
  $('crumbs').replaceChildren(button('Workspace', () => navigate('')));
  let path = '';
  for (const part of current.split('/').filter(Boolean)) {
    path += (path ? '/' : '') + part; const target = path;
    $('crumbs').append(' / ', button(part, () => navigate(target)));
  }
}
function navigate(path) {
  current = path; generation++; selected = ''; signature = ''; entries = [];
  expanded.add('');
  let ancestor = '';
  for (const part of path.split('/').filter(Boolean)) {
    ancestor += (ancestor ? '/' : '') + part; expanded.add(ancestor);
  }
  renderTree(); refreshTree();
  $('filter').value = ''; $('preview').hidden = true; $('error').hidden = true;
  breadcrumbs(); render(); history.replaceState(null, '', `#${encodeURIComponent(path)}`); refresh();
}
async function openFile(path) {
  codeToCopy = ''; $('copy-code').hidden = true; $('copy-status').hidden = true;
  previewSignature = '';
  $('content').className = '';
  selected = path; $('preview').hidden = false; $('filename').textContent = path.split('/').pop();
  render();
  requestAnimationFrame(() => $('preview').scrollIntoView({block: 'nearest', behavior: 'smooth'}));
  $('content').textContent = 'Loading…'; $('preview-note').textContent = '';
  await updatePreview();
}
async function updatePreview() {
  const path = selected;
  if (!path) return;
  try {
    const data = await api('preview', path);
    if (selected !== path) return;
    const markdown = /\.md$/i.test(path);
    const csv = Array.isArray(data.rows);
    const language = codeLanguages[path.split('.').pop().toLowerCase()];
    const nextSignature = JSON.stringify([path, data.content]);
    if (previewSignature !== nextSignature) {
      $('content').className = csv ? 'csv-body' : markdown ? 'markdown-body' : language ? 'code-body' : '';
      $('copy-code').hidden = !language;
      $('copy-code').textContent = data.truncated ? 'Copy preview' : 'Copy code';
      $('copy-status').hidden = true;
      if (csv) {
        const table = document.createElement('table');
        table.setAttribute('aria-label', path.split('/').pop());
        const head = document.createElement('thead'), body = document.createElement('tbody');
        const columns = data.rows.reduce((max, row) => Math.max(max, row.length), 0);
        data.rows.forEach((values, index) => {
          const row = document.createElement('tr');
          for (let col = 0; col < columns; col++) {
            const cell = document.createElement(index === 0 ? 'th' : 'td');
            cell.textContent = values[col] ?? '';
            if (index === 0) cell.scope = 'col';
            row.append(cell);
          }
          (index === 0 ? head : body).append(row);
        });
        table.append(head, body);
        $('content').replaceChildren(data.rows.length ? table : document.createTextNode('This CSV file is empty.'));
        $('content').tabIndex = 0;
        $('content').setAttribute('aria-label', 'CSV table, scroll to see more rows and columns');
      }
      else if (markdown) $('content').innerHTML = renderMarkdownPreview(data.content);
      else if (language) {
        codeToCopy = data.content;
        const pre = document.createElement('pre'), code = document.createElement('code');
        code.className = `hljs language-${language}`;
        try { code.innerHTML = hljs.highlight(data.content, {language, ignoreIllegals: true}).value; }
        catch { code.textContent = data.content; }
        pre.append(code); $('content').replaceChildren(pre);
      }
      else $('content').textContent = data.content;
      if (!csv) { $('content').removeAttribute('tabindex'); $('content').removeAttribute('aria-label'); }
      previewSignature = nextSignature;
    }
    $('preview-note').textContent = data.csvError || (csv
      ? `CSV table · ${Math.max(0, data.rows.length - 1)} rows${data.tableLimited ? ` · Partial preview (2,000 rows / ${previewLimitLabel} limit)` : ''} · Automatically updated`
      : data.truncated ? `Showing the first ${previewLimitLabel}. Copy includes only this preview.` : `${markdown ? 'Formatted Markdown' : language ? `${language} · Original indentation` : 'Text preview'} · Automatically updated`);
  } catch (err) { if (selected === path) { previewSignature = ''; codeToCopy = ''; $('copy-code').hidden = true; $('content').className = ''; $('content').textContent = err.message; } }
}
$('copy-code').onclick = async () => {
  const path = selected, text = codeToCopy;
  try {
    await navigator.clipboard.writeText(text);
    if (selected !== path) return;
    $('copy-status').textContent = 'Copied to clipboard.';
  } catch {
    if (selected !== path) return;
    $('copy-status').textContent = 'Clipboard access was blocked. Select the code and copy it manually.';
  }
  $('copy-status').hidden = false;
};
async function refresh() {
  if (busy) return;
  busy = true; const version = generation;
  try {
    const data = await api('list', current);
    if (version !== generation) return;
    const next = JSON.stringify(data.entries);
    if (signature !== next) { entries = data.entries; signature = next; render(); }
    $('error').hidden = true; $('connection').textContent = '● Live · Auto-refresh';
    $('checked').textContent = `Checked ${new Date().toLocaleTimeString()}`;
    await updatePreview();
  } catch (err) {
    if (version !== generation) return;
    $('error').textContent = err.message + ' Use Workspace above to return to the root.';
    $('error').hidden = false; $('connection').textContent = '○ Unavailable · Retrying';
    entries = []; signature = ''; render();
  } finally { busy = false; if (version !== generation) refresh(); }
}
document.querySelectorAll('[data-path]').forEach(b => b.onclick = () => navigate(b.dataset.path));
$('filter').oninput = render; $('refresh').onclick = () => { refresh(); refreshTree(); };
$('close').onclick = () => { selected = ''; $('preview').hidden = true; render(); };
document.querySelector('.brand').onclick = e => { e.preventDefault(); navigate(''); };
let initial = ''; try { initial = decodeURIComponent(location.hash.slice(1)); } catch {}
async function initialize() {
  let pollSeconds = 2;
  try {
    const config = await (await fetch('/api/config')).json();
    document.title = config.title;
    document.querySelector('.brand-name').textContent = config.title;
    document.querySelector('header>span').textContent = config.title;
    previewLimitLabel = size(config.previewBytes);
    pollSeconds = config.pollSeconds;
    searchTimeout = (config.searchSeconds + 15) * 1000;
    document.getElementById('refresh-label').textContent = `Automatically checks every ${pollSeconds} seconds`;
  } catch { /* The app remains usable with documented defaults. */ }
  navigate(initial);
  setInterval(() => { refresh(); refreshTree(); }, pollSeconds * 1000);
}
initialize();

// Dragging uses pointer capture, so mouse, touch and pen share the same behavior.
let navigationWidth = 264, fileShare = 43;
try {
  const saved = JSON.parse(localStorage.getItem('public-workspace-manager-pane-sizes') || '{}');
  if (Number.isFinite(saved.navigationWidth)) navigationWidth = saved.navigationWidth;
  if (Number.isFinite(saved.fileShare)) fileShare = saved.fileShare;
} catch {}
function applyPaneSizes() {
  const maxNavigation = Math.max(200, Math.min(520, window.innerWidth - 600));
  const effectiveNavigation = Math.max(200, Math.min(maxNavigation, navigationWidth));
  const panes = document.querySelector('.browser-panes');
  const width = panes.clientWidth;
  const minimum = width >= 1000 ? 320 / width * 100 : 30;
  const maximum = width >= 1000 ? (width - 330) / width * 100 : 70;
  const effectiveShare = Math.max(minimum, Math.min(maximum, fileShare));
  document.documentElement.style.setProperty('--navigation-width', `${effectiveNavigation}px`);
  document.documentElement.style.setProperty('--file-share', `${effectiveShare}%`);
  for (const [id, value, min, max] of [
    ['nav-resizer', effectiveNavigation, 200, maxNavigation],
    ['preview-resizer', effectiveShare, minimum, maximum]
  ]) {
    const el = $(id);
    el.setAttribute('aria-valuenow', String(Math.round(value)));
    el.setAttribute('aria-valuemin', String(Math.round(min)));
    el.setAttribute('aria-valuemax', String(Math.round(max)));
    el.setAttribute('aria-valuetext', id === 'nav-resizer' ? `${Math.round(value)} pixels` : `File list ${Math.round(value)} percent`);
  }
}
function savePaneSizes() {
  try { localStorage.setItem('public-workspace-manager-pane-sizes', JSON.stringify({navigationWidth, fileShare})); } catch {}
}
for (const id of ['nav-resizer', 'preview-resizer']) {
  const handle = $(id);
  let dragging = false;
  function move(event) {
    if (!dragging) return;
    if (id === 'nav-resizer') navigationWidth = Math.max(200, Math.min(520, window.innerWidth - 600, event.clientX));
    else {
      const rect = document.querySelector('.browser-panes').getBoundingClientRect();
      fileShare = Math.max(320, Math.min(rect.width - 330, event.clientX - rect.left)) / rect.width * 100;
    }
    applyPaneSizes();
  }
  function finish() {
    dragging = false; handle.classList.remove('dragging'); document.body.classList.remove('resizing'); savePaneSizes();
  }
  handle.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault(); handle.focus(); dragging = true;
    handle.setPointerCapture(event.pointerId); handle.classList.add('dragging'); document.body.classList.add('resizing');
  };
  handle.onpointermove = move;
  handle.onpointerup = finish; handle.onpointercancel = finish; handle.onlostpointercapture = finish;
  handle.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const min = Number(handle.getAttribute('aria-valuemin')), max = Number(handle.getAttribute('aria-valuemax'));
    let value = Number(handle.getAttribute('aria-valuenow'));
    value = event.key === 'Home' ? min : event.key === 'End' ? max : value + (event.key === 'ArrowRight' ? 1 : -1) * (id === 'nav-resizer' ? 20 : 2);
    value = Math.max(min, Math.min(max, value));
    if (id === 'nav-resizer') navigationWidth = value; else fileShare = value;
    applyPaneSizes(); savePaneSizes();
  };
  handle.ondblclick = () => { if (id === 'nav-resizer') navigationWidth = 264; else fileShare = 43; applyPaneSizes(); savePaneSizes(); };
}
new ResizeObserver(applyPaneSizes).observe(document.querySelector('.browser-panes'));
window.addEventListener('resize', applyPaneSizes);
applyPaneSizes();

let searchTimer, searchRequest, searchVersion = 0;
const rankedSearchMatches = new Map();
async function searchWorkspace(offset = 0, originalScope = null) {
  clearTimeout(searchTimer);
  const version = ++searchVersion;
  searchRequest?.abort();
  const query = $('search-text').value.trim();
  if (!offset) { $('search-results').replaceChildren(); rankedSearchMatches.clear(); }
  $('search-more')?.remove();
  $('search-results').hidden = !query;
  $('search-status').hidden = !query;
  $('folder-tree').hidden = !!query;
  $('folders-label').hidden = !!query;
  if (!query) return;
  const scope = originalScope ?? ($('search-scope').value === 'folder' ? current : '');
  $('search-status').textContent = 'Searching filenames and contents…';
  searchRequest = new AbortController();
  const timeout = setTimeout(() => { if (version === searchVersion) searchRequest.abort(); }, searchTimeout);
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&path=${encodeURIComponent(scope)}&offset=${offset}`, {signal: searchRequest.signal});
    if (!response.ok) throw new Error('Search is unavailable. Try again.');
    const data = await response.json();
    if (version !== searchVersion) return;
    for (const match of data.matches) rankedSearchMatches.set(match.path, match);
    const ranked = [...rankedSearchMatches.values()].sort((a, b) => b.filenameRank - a.filenameRank || b.contentHits - a.contentHits || a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
    $('search-status').textContent = `${ranked.length} matching files · Filename relevance first, then content matches` +
      (data.limited ? ' · More files remain; continue below.' : ' · Scan complete.') +
      (data.inventoryCapped ? ' · File inventory limit reached; narrow the folder scope.' : '') +
      (data.partialFiles ? ` · ${data.partialFiles} large files searched only in the first ${previewLimitLabel}.` : '') +
      (data.skipped ? ` · ${data.skipped} binary, unreadable or unsupported files skipped.` : '') +
      (!ranked.length ? ' · No matching filenames or text found in checked files.' : '');
    $('search-results').replaceChildren();
    for (const match of ranked) {
      const item = button('', () => {
        const slash = match.path.lastIndexOf('/');
        navigate(slash < 0 ? '' : match.path.slice(0, slash));
        openFile(match.path);
      });
      item.className = 'search-result';
      const title = document.createElement('strong'); title.textContent = match.name;
      const location = document.createElement('small'); location.textContent = `${match.path}${match.line ? ` · line ${match.line}` : ''} · ${match.filenameRank ? 'Filename' : 'Contents'}${match.filenameRank && match.contentHits ? ' + contents' : ''}`;
      const snippet = document.createElement('span'); snippet.textContent = match.snippet;
      item.append(title, location, snippet); $('search-results').append(item);
    }
    if (data.nextOffset !== null) {
      const more = button('Continue search', () => searchWorkspace(data.nextOffset, scope));
      more.id = 'search-more'; $('search-results').append(more);
    }
  } catch (error) {
    if (version === searchVersion) $('search-status').textContent = error.name === 'AbortError' ? 'Search timed out. Narrow the folder or try again.' : error.message;
  } finally { clearTimeout(timeout); }
}
$('workspace-search').onsubmit = event => { event.preventDefault(); searchWorkspace(); };
$('search-text').oninput = () => {
  ++searchVersion; searchRequest?.abort(); clearTimeout(searchTimer);
  if (!$('search-text').value.trim()) searchWorkspace();
  else searchTimer = setTimeout(searchWorkspace, 450);
};
$('search-scope').onchange = () => searchWorkspace();
