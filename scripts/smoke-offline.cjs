const { pause, until, createLogger, clickFloatingBall, loadApp } = require('./lib/smoke.cjs');
const { app } = require('electron');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const secondary = process.argv.includes('--relaunch');
const report = path.join(os.tmpdir(), 'MathPad-offline-smoke.log');
const log = createLogger(report);
if (!secondary) fs.writeFileSync(report, 'Math Pad offline integration checks\n');
app.setName('MathPad offline integration test');
process.env.MATHPAD_SMOKE_PROFILE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'MathPad-offline-profile-'));
app.setPath('userData', process.env.MATHPAD_SMOKE_PROFILE);
app.commandLine.appendSwitch('disable-http-cache');
const externalRequests = [];
const localResources = new Map();
let missingLoader = process.env.MATHPAD_TEST_MISSING_GEOGEBRA === '1';
const started = Date.now();
const guard = !secondary && setTimeout(() => { log('FAIL overall timeout'); app.exit(1); }, 150000);

if (!secondary) app.on('browser-window-created', (_, win) => {
  if (win.getTitle() === 'Math Pad · 悬浮球') return;
  // The native desktop can be occluded by the editor or a CI service window.
  // Keep animation timing deterministic without changing production behavior.
  win.webContents.setBackgroundThrottling(false);
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (/^https?:/.test(details.url)) {
      externalRequests.push(details.url);
      callback({ cancel: true });
    } else callback({ cancel: missingLoader && details.url === 'mathpad://app/geogebra/deployggb.js' });
  });
  win.webContents.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 'warning') log('BROWSER', details.message.slice(0, 1800));
  });
  win.webContents.session.webRequest.onCompleted((details) => {
    if (details.url.startsWith('mathpad://app/geogebra/')) localResources.set(new URL(details.url).pathname, details.statusCode);
  });
  win.webContents.once('did-finish-load', () => verify(win).then(() => {
    clearTimeout(guard); log('ALL CHECKS PASSED'); app.exit(0);
  }).catch(async (error) => {
    clearTimeout(guard); log('FAIL', error.message, error.stack);
    try { fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-offline-failure.png'), (await win.webContents.capturePage()).toPNG()); } catch {}
    app.exit(1);
  }));
});

async function verify(win) {
  await clickFloatingBall();
  await until(() => win.isVisible(), 'Could not show the workbench from the floating ball');
  const js = (code) => win.webContents.executeJavaScript(code);
  const click = (id) => js(`document.getElementById(${JSON.stringify(id)}).click()`);
  const fill = (kind, values) => js(`Object.entries(${JSON.stringify(values)}).forEach(([key,value]) => document.getElementById('${kind}-form').elements.namedItem(key).value=value)`);
  const run = (kind) => js(`document.getElementById('${kind}-form').requestSubmit()`);
  async function wait(code, label, timeout = 15000) {
    const end = Date.now() + timeout;
    do { if (await js(code)) return; await pause(80); } while (Date.now() < end);
    throw new Error(`${label}: ${await js("JSON.stringify({text:document.body.innerText,scripts:Array.from(document.scripts,s=>s.src),graph:document.getElementById('graph').innerHTML.slice(0,1200)})")}`);
  }
  const complete = (kind) => wait(`!document.querySelector('#${kind}-form [type="submit"]').disabled && document.querySelector('#${kind}-output .formula-card')`, `${kind} did not finish`);
  const values = (kind) => js(`Array.from(document.querySelectorAll('#${kind}-output .formula-math[data-expression]'), item => item.dataset.expression)`);
  const count = () => js("document.querySelectorAll('.curve-row').length");
  const line = (kind, scope = '#curves') => `document.querySelector('${scope} [data-lesson-line=${kind}]')`;
  const result = () => js("document.querySelector('#results').innerText");
  const select = (positions) => js(`Array.from(document.querySelectorAll('.curve-row input')).forEach((input,index) => { if (input.checked !== ${JSON.stringify(positions)}.includes(index)) input.click(); })`);
  async function property(command) {
    await js(`(() => { const field = document.querySelector('#property'); field.value=${JSON.stringify(command)}; field.dispatchEvent(new Event('change')); })()`);
    await click('analyze');
  }
  async function add(formula, success = true) {
    await click('open-formula'); await click('mode-keyboard');
    await js(`(() => { const field=document.querySelector('#formula-text'); field.value=${JSON.stringify(formula)}; field.dispatchEvent(new Event('input')); })()`);
    await click('submit-formula');
    if (success) await wait("!document.querySelector('#formula-dialog').open", `Could not plot ${formula}`);
    else {
      assert.equal(await js("document.querySelector('#formula-dialog').open"), true);
      assert.equal(await js("document.querySelector('#formula-text').value"), formula);
      assert.ok(await js("document.querySelector('#formula-error').innerText"));
      await click('cancel-formula');
    }
  }

  assert.equal(await js('typeof window.nativeMath'), 'undefined');
  assert.equal(await js("document.querySelector('#mode-native')"), null);
  if (missingLoader) {
    await wait("document.querySelector('#graph-state').dataset.state === 'error'", 'Missing local component was not reported');
    assert.match(await js("document.querySelector('#graph-message-detail').innerText"), /完整解压/);
    assert.equal(externalRequests.length, 0, 'Missing local assets must not fall back to a CDN');
    missingLoader = false; await click('retry-graph');
    log('MISSING LOCAL RESOURCE AND RETRY PASSED');
  }
  await wait("document.querySelector('#graph-state').dataset.state === 'ready'", 'Local GeoGebra did not start offline', 60000);
  log('COLD OFFLINE GRAPH READY', { elapsedMs: Date.now() - started, profile: process.env.MATHPAD_SMOKE_PROFILE });
  assert.equal(externalRequests.length, 0, 'Graph startup attempted to use the network');
  if (process.env.MATHPAD_TEST_NO_FOCUS_CHECKS !== '1') assert.equal(win.isAlwaysOnTop() && !win.isFocused(), false);

  await add('y=x²'); await add('y=x+2');
  await select([0, 1]); await click('intersect');
  assert.match(await result(), /[−-]1,\s*1/); assert.match(await result(), /2,\s*4/);
  log('OFFLINE INTERSECTIONS (-1,1) (2,4)');
  await add('x^2/25+y^2/9=1'); await select([2]); await property('Focus');
  assert.match(await result(), /[−-]4,\s*0/); assert.match(await result(), /\(4,\s*0/);
  log('OFFLINE ELLIPSE FOCI (-4,0) (4,0)');
  await add('x^2/4-y^2/9=1'); await select([3]); await property('Asymptote');
  assert.match(await result(), /渐近线/); assert.match(await result(), /1\.5|3\s*\/\s*2|3\s*x/);
  const asymptotes = await js("document.querySelector('#results').firstElementChild.innerText");
  assert.match(asymptotes, /1\.5|3\s*\/\s*2|3\s*x/);
  log('OFFLINE HYPERBOLA ASYMPTOTES', asymptotes);
  await select([0]); await property('Root'); await property('Extremum');
  assert.match(await result(), /零点/); assert.match(await result(), /局部极值/);
  assert.match(await js("document.querySelector('#results').firstElementChild.innerText"), /\(0,\s*0\)/);
  await add('y^2=4*x'); await select([4]); await property('Focus'); await property('Directrix');
  assert.match(await result(), /\(1,\s*0\)/); assert.match(await result(), /x\s*=\s*[−-]1/);
  log('OFFLINE FUNCTION EXTREMA AND PARABOLA FOCUS/DIRECTRIX');
  await add('y=sin(x)'); await add('y=0'); await select([5, 6]); await click('intersect');
  assert.match(await result(), /数值近似/);
  assert.match(await js("document.querySelector('#results').firstElementChild.innerText"), /\(0,\s*0\)/);
  log('OFFLINE NUMERICAL INTERSECTION IN VISIBLE INTERVAL');
  await add('y=-1'); await select([0, 7]); await click('intersect');
  assert.match(await js("document.querySelector('#analysis-message').innerText"), /未找到离散交点/);
  await add('y=x^', false); assert.equal(await count(), 8);
  log('INVALID FORMULA PRESERVED AND NO INTERSECTION HANDLED');

  const sourceName = await js("document.querySelector('.curve-row').dataset.name");
  await select([0]); await click('differentiate-selected');
  await wait("document.querySelector('#derivative-teaching').dataset.slope === '2'", 'Selected curve did not open the merged derivative lesson');
  assert.equal(await count(), 9, 'Only the derivative of an existing curve should be added');
  assert.equal(await js("document.querySelector('#curves > .derivative-group > .curve-row').dataset.name"), sourceName);
  assert.equal(await js("document.querySelectorAll('#curves .derivative-branch .curve-row').length"), 1);
  assert.match(await js(`${line('tangent')}.textContent`), /y − 1 = 2\(x − 1\)/);
  assert.match(await js(`${line('secant')}.textContent`), /y − 1 = 3\(x − 1\)/);
  assert.equal(await js(`${line('tangent')}.textContent === ${line('tangent', '#derivative-formulas')}.textContent`), true);
  await js("document.querySelector('[data-panel=curves-panel]').click()");
  await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await pause(180);
  fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-derivative-group.png'), (await win.webContents.capturePage()).toPNG());
  await js("document.querySelector('[data-panel=derivative-workspace]').click()");
  await click('lesson-show-tangent');
  assert.match(await js(`${line('tangent')}.textContent`), /图上已隐藏/);
  assert.equal(await js("window.ggbApplet.getAllObjectNames().filter(name => /^Lesson\\d+t$/.test(name)).some(name => window.ggbApplet.getVisible(name))"), false);
  await click('lesson-show-tangent');
  for (const [order, label] of [['3', '三阶导函数 f‴(x)'], ['4', '四阶导函数 f⁽⁴⁾(x)']]) {
    await fill('derivative', { order }); await run('derivative'); await complete('derivative');
    assert.equal(await count(), 10);
    assert.equal(await js("document.querySelector('#curves > .derivative-group > .curve-row').dataset.name"), sourceName);
    assert.deepEqual(await js("Array.from(document.querySelectorAll('#curves .derivative-branch .curve-role'), item => item.textContent)"), ['一阶导函数 f′(x)', label]);
  }
  await click('lesson-clear');
  assert.equal(await js(`${line('secant')}.hidden && ${line('tangent', '#derivative-formulas')}.hidden`), true);
  assert.equal(await count(), 10, 'Closing the interactive demonstration should preserve plotted curves');
  assert.equal(await js("document.querySelector('.GeoGebraFrame') !== null && document.querySelectorAll('.GeoGebraFrame').length === 1"), true);
  await fill('derivative', { formula: 'x^3-3*x', point: '2', order: '1' });
  await run('derivative'); await complete('derivative');
  assert.ok((await values('derivative')).includes('-16+9*x'));
  assert.ok(await js("document.querySelector('#derivative-output .katex') !== null"));
  await fill('derivative', { formula: 'x/x', point: '0' }); await run('derivative');
  await wait("document.querySelector('#derivative-output').innerText.includes('未给出该点')", 'Original domain hole was lost');
  assert.match(await js(`${line('tangent')}.textContent`), /此处切线未定义/);
  assert.match(await js(`${line('secant')}.textContent`), /当前割线未定义/);
  await fill('derivative', { formula: 'sin(x^2)', point: '1' }); await run('derivative'); await complete('derivative');
  assert.ok((await values('derivative')).includes('2*x*cos(x^2)'));
  await wait("!document.querySelector('#derivative-teaching').hidden", 'Derivative lesson did not open');
  assert.equal(await count(), 10);
  assert.equal(await js("document.querySelector('#graph-workspace').hidden"), false);
  log('OFFLINE DERIVATIVE, LOCAL KATEX AND DERIVATIVE PLOT');
  assert.equal(await js("document.querySelector('#derivative-form').closest('#graph-workspace') !== null"), true);
  await wait("(() => { const graph=document.querySelector('#graph').getBoundingClientRect(), form=document.querySelector('#derivative-form').getBoundingClientRect(), side=document.querySelector('#input-sidebar').getBoundingClientRect(); return graph.height>150 && form.width>=160 && form.left>=side.left && form.right<=side.right && Array.from(document.querySelectorAll('#derivative-form input,#derivative-form select')).every(field=>{const box=field.getBoundingClientRect();return box.width>=64 && box.left>=side.left && box.right<=side.right;}); })()", 'Derivative inputs must remain usable inside the resizable sidebar');
  await js("document.querySelector('[data-lesson-example=quadratic]').click()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope === '2'", 'Quadratic tangent slope should be 2');
  await js("document.querySelector('#lesson-h').value=-3; document.querySelector('#lesson-h').dispatchEvent(new Event('input'))");
  assert.ok(Math.abs(Number(await js("document.querySelector('#derivative-teaching').dataset.secant")) - 2) < 0.002);
  assert.match(await js(`${line('secant')}.textContent`), /2\.001.*数值近似/);
  await click('lesson-direction');
  assert.ok(Number(await js("document.querySelector('#derivative-teaching').dataset.h")) < 0);
  await js("document.querySelector('#lesson-a-slider').value=-1; document.querySelector('#lesson-a-slider').dispatchEvent(new Event('input'))");
  assert.equal(await js("document.querySelector('#derivative-teaching').dataset.slope"), '-2');
  await click('lesson-play');
  await wait("document.querySelector('#lesson-play').getAttribute('aria-pressed') === 'false'", 'Convergence animation did not finish', 8000);
  assert.equal(await js(`${line('secant')}.textContent === ${line('secant', '#derivative-formulas')}.textContent`), true);
  await js("document.querySelector('[data-lesson-example=stationary]').click()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope === '0'", 'Stationary example did not load');
  assert.match(await js(`${line('tangent')}.textContent`), /y = 0/);
  assert.match(await js("document.querySelector('#lesson-question').innerText"), /极值/);
  await js("document.querySelector('[data-lesson-example=corner]').click()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope === '未定义'", 'Corner must not get a tangent');
  assert.match(await js(`${line('tangent')}.textContent`), /此处切线未定义/);
  assert.match(await js(`${line('secant')}.textContent`), /y = x/);
  assert.match(await js("document.querySelector('#lesson-table').textContent"), /-1/);
  assert.equal(await count(), 10, 'Repeated lessons should replace their curves');
  await fill('derivative', { formula: 'x^3', point: '2', order: '2' }); await run('derivative'); await complete('derivative');
  await wait("document.querySelector('#derivative-teaching').dataset.slope === '12'", 'Higher order teaching must use first derivative tangent');
  assert.equal(await count(), 11);
  assert.match(await js(`${line('tangent')}.textContent`), /y − 8 = 12\(x − 2\)/);
  await js("document.querySelector('[data-lesson-example=quadratic]').click()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope === '2'", 'Quadratic lesson did not recover');
  const apiAvailable = await js("typeof window.ggbApplet?.getAllObjectNames === 'function'");
  assert.equal(apiAvailable, true);
  await js("(() => { const api=window.ggbApplet; const point=api.getAllObjectNames().find(name => /^Lesson[0-9]+p$/.test(name)); api.setCoords(point,-2,0); })()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope === '-4'", 'Moving the graph point did not update the lesson');
  assert.match(await js(`${line('tangent')}.textContent`), /y − 4 = −4\(x \+ 2\)/);
  await js("document.querySelector('#lesson-a-slider').value=1; document.querySelector('#lesson-a-slider').dispatchEvent(new Event('input'))");
  await js("Array.from(document.querySelectorAll('.curve-row')).slice(0,8).forEach(row => row.querySelector('[data-visibility]').click())");
  await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const lessonPoints = await js("(() => { const api=window.ggbApplet; const prefix=api.getAllObjectNames().find(name => /^Lesson[0-9]+p$/.test(name)).slice(0,-1); return ['a','b','d'].flatMap(key=>[api.getXcoord(prefix+key),api.getYcoord(prefix+key)]); })()");
  assert.deepEqual(lessonPoints, [1, 1, 2, 4, 1, 2], 'Graph points must match the numeric lesson, not initial placeholders');
  assert.equal(await js("window.ggbApplet.getAllObjectNames().filter(name=>/^Lesson/.test(name)).length"), 10, 'Previous teaching constructions were not cleaned up');
  await js("(() => { const api=window.ggbApplet; const prefix=api.getAllObjectNames().find(name=>/^Lesson[0-9]+p$/.test(name)).slice(0,-1); if(!api.getVisible(prefix+'t')) throw new Error('Tangent must be visible'); })()");
  fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-derivative-teaching.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(500, 650);
  await js("document.querySelector('[data-panel=curves-panel]').click()");
  await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.ok(await js("document.body.scrollWidth <= window.innerWidth && document.querySelector('#graph').getBoundingClientRect().height >= 150"), 'Narrow layout lost the graph or overflowed horizontally');
  assert.ok(await js("(() => { const group = document.querySelector('#curves > .derivative-group'); const parent = group.querySelector(':scope > .curve-row').getBoundingClientRect(); const child = group.querySelector('.derivative-branch .curve-row').getBoundingClientRect(); return child.left > parent.left && child.right <= parent.right; })()"), 'Indented curve controls must fit in a narrow sidebar');
  win.setSize(860, 730);
  await js("document.querySelector('[data-panel=derivative-workspace]').click()");
  await fill('derivative', { formula: 'a*x^2', point: '1', order: '1' }); await run('derivative'); await complete('derivative');
  assert.equal(await js("document.querySelector('#derivative-teaching').hidden"), true);
  assert.equal(await count(), 10, 'Symbolic parameters should preserve the existing curves');
  await js("document.querySelector('[data-lesson-example=quadratic]').click()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope === '2'", 'Teaching did not recover after symbolic parameters');
  await js("document.querySelector('#curves > .derivative-group > .curve-row button:last-child').click()");
  assert.equal(await js("document.querySelector('#derivative-teaching').hidden"), true);
  assert.equal(await js("document.querySelector('#curves .derivative-group')"), null);
  assert.equal(await js("window.ggbApplet.getAllObjectNames().filter(name=>/^Lesson/.test(name)).length"), 0);
  await js("document.querySelector('[data-lesson-example=quadratic]').click()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope === '2'", 'Teaching did not recover after deleting a source');
  log('MERGED DERIVATIVE WORKSPACE, SECANT LIMIT, SIGN, CORNER, STATIONARY POINT AND HIGHER ORDER PASSED');

  await js("document.querySelector('[data-workspace=sequence-workspace]').click()");
  await fill('sequence', { mode: 'general', term: 'n*2^n', count: '10' });
  await js("document.querySelector('#sequence-mode').dispatchEvent(new Event('change'))");
  await run('sequence'); await complete('sequence');
  assert.ok((await values('sequence')).includes('18434'));
  await fill('sequence', { term: '(n-2)/(n-2)', count: '3' }); await run('sequence');
  await wait("document.querySelector('#sequence-status').innerText.includes('第 2 项')", 'Sequence domain hole was lost');
  assert.ok((await values('sequence')).includes('18434'));
  await fill('sequence', { term: 'n^2', count: '10' }); await run('sequence');
  await js("document.querySelector('[data-cancel-calculation=sequence]').click()");
  assert.match(await js("document.querySelector('#sequence-status').innerText"), /取消/);
  log('OFFLINE SEQUENCE SUM, ERROR PRESERVATION AND CANCELLATION');

  await js("document.querySelector('[data-workspace=graph-workspace]').click()");
  await click('open-formula');
  await wait("!document.querySelector('#retry-hand').hidden", 'Offline hand service failure was not reported');
  await click('mode-keyboard');
  await js("(() => { const field=document.querySelector('#formula-text'); field.value='y=cos(x)'; field.dispatchEvent(new Event('input')); })()");
  assert.equal(await js("document.querySelector('#submit-formula').disabled"), false);
  await click('submit-formula'); await wait("!document.querySelector('#formula-dialog').open", 'Keyboard fallback failed');
  assert.equal(await count(), 11);
  log('HAND SERVICE OFFLINE: KEYBOARD AND EXISTING GRAPH REMAIN AVAILABLE');
  assert.ok(externalRequests.every((url) => new URL(url).hostname.endsWith('.wiris.net')), JSON.stringify(externalRequests));
  assert.ok(localResources.has('/geogebra/deployggb.js'));
  assert.ok([...localResources.keys()].some((name) => name.endsWith('.cache.js')));
  assert.ok([...localResources.values()].every((status) => status === 200), JSON.stringify([...localResources]));
  log('LOCAL GEOGEBRA RESOURCES', [...localResources]);
  log('ZERO GEOGEBRA NETWORK REQUESTS; ALL HTTP/HTTPS BLOCKED');
  fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-offline-graph.png'), (await win.webContents.capturePage()).toPNG());

  win.close(); assert.equal(win.isVisible(), false);
  let launchedAgain = false;
  app.once('second-instance', () => { launchedAgain = true; });
  const child = spawn(process.execPath, [__filename, '--relaunch'], { stdio: 'ignore' });
  assert.equal(await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }), 0);
  await until(() => launchedAgain, 'The running app did not receive the new launch');
  assert.equal(win.isVisible(), false);
  await clickFloatingBall();
  await until(() => win.isVisible(), 'The floating ball did not restore the existing workbench');
  await pause(200);
  assert.equal(win.isVisible(), true);
  if (process.env.MATHPAD_TEST_NO_FOCUS_CHECKS !== '1') assert.equal(win.isAlwaysOnTop() && !win.isFocused(), false);
  assert.equal(await count(), 11);
  log('RELAUNCH STAYS QUIET; FLOATING BALL RESTORES SAME WINDOW AND CURVES');
  await click('clear-all');
  assert.equal(await count(), 0);
  assert.equal(await js("document.querySelector('#derivative-formulas').hidden && document.querySelector('#curves').childNodes.length === 0"), true);
}

loadApp();
