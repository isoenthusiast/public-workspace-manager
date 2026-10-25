const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-manager-'));
  fs.writeFileSync(path.join(fixture, 'solar.md'), '# Solar plan\n\n**Readable** content.');
  fs.writeFileSync(path.join(fixture, 'data.csv'), 'Name,Value\n' + Array.from({length:100}, (_,i)=>`Item ${i},${i}`).join('\n'));
  const code = 'def solar():\n    return "sunshine"\n';
  fs.writeFileSync(path.join(fixture, 'example.py'), code);
  fs.writeFileSync(path.join(fixture, '.secret'), 'solar');
  const server = spawn(process.env.PYTHON || 'python3', ['run.py', '--root', fixture, '--port', '0', '--poll-interval', '0.5'], {cwd:path.resolve(__dirname, '..')});
  let browser;
  try {
    const url = await new Promise((resolve,reject) => {
      const timeout=setTimeout(()=>reject(new Error('Server startup timed out')),10000);
      server.once('error',reject);
      server.stdout.on('data', data=>{const match=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});
    });
    browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined});
    const context = await browser.newContext({viewport:{width:1600,height:900}, permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    await page.locator('#files').getByText('solar.md', {exact:false}).click();
    await page.locator('#content h1').waitFor();
    assert.equal(await page.locator('#content h1').innerText(), 'Solar plan');
    await page.locator('#files').getByText('example.py', {exact:false}).click();
    await page.locator('#content .hljs-keyword').first().waitFor();
    await page.locator('#copy-code').click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()), code);
    await page.locator('#files').getByText('data.csv', {exact:false}).click();
    await page.locator('#content th').first().waitFor();
    assert.equal(await page.locator('#content th').first().evaluate(e=>getComputedStyle(e).position), 'sticky');
    assert(await page.locator('#content').evaluate(e=>e.scrollHeight>e.clientHeight));
    const before=await page.locator('#workspace-navigation').boundingBox();
    const divider=await page.locator('#nav-resizer').boundingBox();
    await page.mouse.move(divider.x+divider.width/2,divider.y+50);
    await page.mouse.down();await page.mouse.move(divider.x+70,divider.y+50);await page.mouse.up();
    assert((await page.locator('#workspace-navigation').boundingBox()).width>before.width+30);
    const previewBefore=await page.locator('#preview').boundingBox();
    await page.locator('#preview-resizer').focus();await page.keyboard.press('ArrowLeft');
    assert.notEqual((await page.locator('#preview').boundingBox()).width,previewBefore.width);
    await page.locator('#search-text').fill('solar');
    await page.locator('#workspace-search button').click();
    await page.locator('.search-result').first().waitFor();
    assert.match(await page.locator('.search-result').first().innerText(), /solar.md/);
    assert.equal(await page.locator('.search-result').count(),2);
    await page.locator('#search-text').fill('');await page.locator('#workspace-search button').click();
    fs.writeFileSync(path.join(fixture,'new.txt'),'New file');
    await page.locator('#files').getByText('new.txt', {exact:false}).waitFor();
    for(const width of [1600,850,390]) {
      await page.setViewportSize({width,height:700});
      await page.waitForTimeout(300);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), `overflow at ${width}`);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: Markdown, highlighting/copy, sticky scrollable CSV, both resizers, filename relevance, hidden-file exclusion, live refresh, responsive widths, no browser errors.');
  } finally {
    if(browser) await browser.close();
    server.kill();
    await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));
    fs.rmSync(fixture,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
