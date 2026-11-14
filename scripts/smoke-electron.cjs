const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const report = path.join(os.tmpdir(), 'MathPad-calculator-smoke.log');
const log = (...items) => fs.appendFileSync(report, items.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ') + '\n');
fs.writeFileSync(report, 'Math Pad integration checks\n');
app.setName('MathPad integration test');
app.setPath('userData', path.join(os.tmpdir(), 'MathPad-calculator-smoke-profile'));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const guard = setTimeout(() => { log('FAIL overall timeout'); app.exit(1); }, 120000);

app.on('browser-window-created', (_, win) => {
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['https://*/*'] }, (_, callback) => callback({ cancel: true }));
  win.webContents.on('console-message', (details) => { if (details.level === 'error' || details.level === 'warning') log('BROWSER', details.message); });
  win.webContents.session.webRequest.onErrorOccurred((details) => log('NETWORK', new URL(details.url).hostname, details.error));
  win.webContents.session.webRequest.onCompleted((details) => { if (details.url.startsWith('https:')) log('HTTP', new URL(details.url).hostname, new URL(details.url).pathname, details.statusCode); });
  win.webContents.once('did-finish-load', () => verify(win).then(() => { clearTimeout(guard); log('ALL CHECKS PASSED'); app.exit(0); }).catch((error) => { clearTimeout(guard); log('FAIL', error.message, error.stack); app.exit(1); }));
});

async function verify(win) {
  const js = (code) => win.webContents.executeJavaScript(code);
  const click = (id) => js(`document.getElementById(${JSON.stringify(id)}).click()`);
  const fill = (kind, values) => js(`Object.entries(${JSON.stringify(values)}).forEach(([key,value]) => document.getElementById('${kind}-form').elements.namedItem(key).value=value)`);
  const run = (kind) => js(`document.getElementById('${kind}-form').requestSubmit()`);
  async function wait(code, label, timeout = 15000) {
    const end = Date.now() + timeout;
    do { if (await js(code)) return; await pause(80); } while (Date.now() < end);
    throw new Error(`${label}: ${await js("JSON.stringify({text:document.body.innerText,scripts:Array.from(document.scripts,s=>s.src),graph:document.getElementById('graph').innerHTML.slice(0,1500)})")}`);
  }
  const complete = (kind) => wait(`!document.querySelector('#${kind}-form [type="submit"]').disabled && document.querySelector('#${kind}-output .formula-card')`, `${kind} did not finish`);
  const values = (kind) => js(`Array.from(document.querySelectorAll('#${kind}-output .formula-math[data-expression]'), item => item.dataset.expression)`);
  assert.equal(await js('typeof window.nativeMath'), 'undefined');
  assert.equal(await js("document.querySelector('#mode-native')"), null);
  await js("document.querySelector('[data-workspace=derivative-workspace]').click()");
  await run('derivative'); await complete('derivative');
  assert.ok((await values('derivative')).includes('-16+9*x'));
  assert.ok(await js("document.querySelector('#derivative-output .katex') !== null"));
  log('OFFLINE DERIVATIVE AND LOCAL MATH RENDER', await values('derivative'));
  await fill('derivative', { formula: 'x/x', point: '0' }); await run('derivative');
  await wait("document.querySelector('#derivative-output').innerText.includes('未给出该点')", 'Original domain hole was lost');
  await fill('derivative', { formula: 'sin(x^2)', point: '1' }); await run('derivative'); await complete('derivative');
  assert.ok((await values('derivative')).includes('2*x*cos(x^2)'));
  fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-derivative.png'), (await win.webContents.capturePage()).toPNG());

  await js("document.querySelector('[data-workspace=sequence-workspace]').click()");
  await click('sequence-mode');
  await fill('sequence', { mode: 'general', term: 'n*2^n', count: '10' });
  await js("document.querySelector('#sequence-mode').dispatchEvent(new Event('change'))");
  await run('sequence'); await complete('sequence');
  assert.ok((await values('sequence')).includes('18434'));
  log('OFFLINE WEIGHTED GEOMETRIC SUM', await values('sequence'));
  await fill('sequence', { term: '(n-2)/(n-2)', count: '3' }); await run('sequence');
  await wait("document.querySelector('#sequence-status').innerText.includes('第 2 项')", 'Sequence domain hole was lost');
  assert.ok((await values('sequence')).includes('18434'));
  await fill('sequence', { term: 'n^2', count: '10' }); await run('sequence');
  await js("document.querySelector('[data-cancel-calculation=sequence]').click()");
  assert.match(await js("document.querySelector('#sequence-status').innerText"), /取消/);
  log('ERROR PRESERVES RESULTS AND CANCELLATION PASSED');

  win.webContents.session.webRequest.onBeforeRequest(null);
  await js("document.querySelector('[data-workspace=graph-workspace]').click()");
  await wait("document.querySelector('#graph-state').dataset.state === 'error'", 'Expected offline graph message');
  await click('retry-graph');
  await wait("document.querySelector('#graph-state').dataset.state === 'ready'", 'Graph did not recover online', 80000);
  await js("document.querySelector('[data-workspace=derivative-workspace]').click()");
  await js("Array.from(document.querySelectorAll('#derivative-output button')).find(button => button.textContent === '绘制导函数').click()");
  assert.equal(await js("document.querySelectorAll('.curve-row').length"), 1);
  assert.equal(await js("document.querySelector('#graph-workspace').hidden"), false);
  assert.equal(win.isAlwaysOnTop(), true);
  log('DERIVATIVE PLOTTED IN EXISTING GRAPH');
  await click('open-formula');
  await wait("!document.querySelector('#clear-hand').disabled", 'Handwriting did not open', 20000);
  await wait("Array.from(document.querySelectorAll('#hand-canvas canvas')).some(canvas => canvas.getBoundingClientRect().width >= 650 && canvas.getBoundingClientRect().height >= 290)", 'Handwriting canvas did not finish layout', 12000);
  const size = await js("Array.from(document.querySelectorAll('#hand-canvas canvas')).find(canvas => canvas.getBoundingClientRect().width >= 650).getBoundingClientRect().toJSON()");
  assert.ok(size.width >= 650 && size.height >= 290, JSON.stringify(size));
  assert.equal(await js("document.querySelector('#mode-hand').getAttribute('aria-pressed')"), 'true');
  fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-large-handwriting.png'), (await win.webContents.capturePage()).toPNG());
  await click('cancel-formula');
  log('LARGE IN-APP HANDWRITING', size);
}

require(process.env.MATHPAD_TEST_APP_ROOT
  ? path.join(process.env.MATHPAD_TEST_APP_ROOT, 'src', 'main.cjs')
  : '../src/main.cjs');
