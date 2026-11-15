const { pause, until, createLogger, prepareOfflineWindow, loadApp } = require('./lib/smoke.cjs');
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const report = path.join(os.tmpdir(), 'MathPad-polish-smoke.log');
fs.writeFileSync(report, 'Math Pad window and layout checks\n');
const log = createLogger(report);
app.setName('MathPad layout verification');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'MathPad-polish-profile-')));
let main, probe;
const guard = setTimeout(() => { log('FAIL timeout'); app.exit(1); }, 120000);
app.on('browser-window-created', (_, win) => {
  if (main) return;
  main = win;
  win.on('focus', () => log('FOCUS EVENT', { focused: win.isFocused(), topmost: win.isAlwaysOnTop() }));
  win.on('blur', () => setImmediate(() => log('BLUR EVENT', { focused: win.isFocused(), topmost: win.isAlwaysOnTop() })));
  prepareOfflineWindow(win);
  win.webContents.on('console-message', details => { if (details.level === 'error') log('BROWSER', details.message.slice(0, 800)); });
  win.webContents.once('did-finish-load', () => verify(win).then(() => { clearTimeout(guard); log('ALL CHECKS PASSED'); app.exit(0); }).catch(async error => {
    clearTimeout(guard); log('FAIL', error.message, error.stack);
    try { fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-polish-failure.png'), (await win.webContents.capturePage()).toPNG()); } catch {}
    probe?.destroy(); app.exit(1);
  }));
});

async function verify(win) {
  const js = code => win.webContents.executeJavaScript(code);
  const click = id => js(`document.getElementById(${JSON.stringify(id)}).click()`);
  const wait = (code, label, timeout) => until(() => js(code), label, timeout);
  const painted = () => js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await wait("document.querySelector('#graph-state').dataset.state==='ready'", 'Graph did not load', 60000);
  app.emit('second-instance', {}, [], process.cwd());
  await until(() => win.isFocused(), 'Main window did not focus');
  probe = new BrowserWindow({ show: false, width: 320, height: 200, title: 'Math Pad focus probe' });
  await probe.loadURL('data:text/html,<title>Math Pad focus probe</title><p>Focus verification</p>');
  probe.show(); probe.focus();
  await until(() => probe.isFocused() && !win.isFocused(), 'Could not move focus to a different native window');
  await until(() => !win.isAlwaysOnTop(), 'Topmost was not released after native blur', 2500);
  assert.equal(win.isAlwaysOnTop(), false, 'Math Pad must release topmost after blur');
  app.emit('second-instance', {}, [], process.cwd());
  await until(() => win.isFocused(), 'Invoking the existing panel did not regain focus');
  probe.destroy(); probe = undefined;
  log('FOCUS: TOPMOST RELEASED FOR OTHER WINDOW; NORMAL REFOCUS WORKS');

  async function fills(label) {
    await until(() => js(`(() => { const host=document.querySelector('#graph').getBoundingClientRect(); const frame=document.querySelector('.GeoGebraFrame')?.getBoundingClientRect(); return frame && Math.abs(host.width-frame.width)<3 && Math.abs(host.height-frame.height)<3 && Math.abs(host.left-frame.left)<2 && Math.abs(host.top-frame.top)<2; })()`), label);
    const info = await js("(() => { const host=document.querySelector('#graph').getBoundingClientRect(), frame=document.querySelector('.GeoGebraFrame').getBoundingClientRect(), view=JSON.parse(window.ggbApplet.getViewProperties(1)); const canvas=Array.from(document.querySelectorAll('#graph canvas'),canvas=>canvas.getBoundingClientRect()).sort((a,b)=>b.width*b.height-a.width*a.height)[0]; return {host:[host.width,host.height],frame:[frame.width,frame.height],canvas:canvas&&[canvas.width,canvas.height],scaleRatio:view.invXscale/view.invYscale}; })()");
    assert.ok(Math.abs(info.scaleRatio - 1) < 1e-6, 'Coordinate units must stay equal on both axes');
    assert.ok(info.canvas && Math.abs(info.canvas[0]-info.host[0])<5 && Math.abs(info.canvas[1]-info.host[1])<5, 'The actual drawing canvas must fill the frame');
    log('FILL', label, info);
  }
  for (const [width, height] of [[1000, 700], [680, 620], [480, 600], [1000, 700]]) {
    win.setContentSize(width, height); await painted(); await fills(`${width}x${height}`);
  }
  win.maximize(); await painted(); await fills('maximized');
  win.unmaximize(); await painted(); await fills('restored');
  win.setContentSize(1000, 700); await painted();
  const initial = await js("document.querySelector('#input-sidebar').getBoundingClientRect().width");
  const handle = await js("document.querySelector('#sidebar-resizer').getBoundingClientRect().toJSON()");
  const x = Math.round(handle.left + handle.width / 2), y = Math.round(handle.top + 80);
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
  win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseMove', x: x + 95, y, button: 'left' });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: x + 95, y, button: 'left', clickCount: 1 });
  await wait(`document.querySelector('#input-sidebar').getBoundingClientRect().width>${initial + 70}`, 'Dragging the divider did not resize the sidebar');
  await fills('sidebar dragged');
  const preferred = Number(await js("localStorage.getItem('mathpad.sidebarWidth')"));
  assert.ok(preferred > initial + 70);
  const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.webContents.reload(); await loaded;
  await wait("document.querySelector('#graph-state').dataset.state==='ready'", 'Graph did not reload');
  assert.ok(Math.abs(await js("document.querySelector('#input-sidebar').getBoundingClientRect().width") - preferred) < 2);
  await js("document.querySelector('#sidebar-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
  assert.equal(Number(await js("document.querySelector('#sidebar-resizer').getAttribute('aria-valuenow')")), Math.round(preferred) - 16);
  await fills('sidebar keyboard adjustment');
  log('SIDEBAR POINTER, KEYBOARD AND PREFERENCE RESTORE PASSED');

  async function add(formula) {
    await click('open-formula'); await click('mode-keyboard');
    await js(`(() => { const input=document.querySelector('#formula-text'); input.value=${JSON.stringify(formula)}; input.dispatchEvent(new Event('input')); })()`);
    await click('submit-formula'); await wait("!document.querySelector('#formula-dialog').open", 'Formula did not plot');
  }
  await add('x^2+y^2=1'); await fills('circle plotted without deformation');
  await js("document.querySelector('.curve-row button:last-child').click()");
  await js("document.querySelector('[data-panel=derivative-workspace]').click(); document.querySelector('[data-lesson-example=quadratic]').click()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope==='2'", 'Teaching did not open');
  win.setContentSize(1280, 760); await painted();
  await fills('teaching expanded');
  const arrangement = await js("(() => { const read=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {left:read('input-sidebar'),plot:document.querySelector('.plot').getBoundingClientRect().toJSON(),right:read('derivative-teaching'),graph:read('graph')}; })()");
  assert.ok(arrangement.right.left > arrangement.plot.right, 'Teaching controls must sit to the right of the coordinate system');
  assert.ok(Math.abs(arrangement.right.top-arrangement.left.top)<2 && Math.abs(arrangement.right.height-arrangement.left.height)<2, 'Both sidebars must use the full workspace height');
  assert.ok(arrangement.graph.height > arrangement.plot.height - 90, 'Teaching sidebar must not take height from the plot');
  const rightHandle = await js("document.querySelector('#lesson-resizer').getBoundingClientRect().toJSON()");
  const rx=Math.round(rightHandle.left+rightHandle.width/2), ry=Math.round(rightHandle.top+80);
  win.webContents.sendInputEvent({type:'mouseMove',x:rx,y:ry});
  win.webContents.sendInputEvent({type:'mouseDown',x:rx,y:ry,button:'left',clickCount:1});
  win.webContents.sendInputEvent({type:'mouseMove',x:rx-72,y:ry,button:'left'});
  win.webContents.sendInputEvent({type:'mouseUp',x:rx-72,y:ry,button:'left',clickCount:1});
  await wait(`document.querySelector('#derivative-teaching').getBoundingClientRect().width>${arrangement.right.width+50}`, 'Right divider drag must resize teaching controls');
  const lessonPreferred = Number(await js("localStorage.getItem('mathpad.lessonWidth')"));
  await fills('right sidebar dragged');
  const graphHeight = await js("document.querySelector('#graph').clientHeight");
  await js("document.querySelector('.lesson-definition').open=true; document.querySelector('#derivative-teaching').scrollTop=10000");
  assert.equal(await js("document.querySelector('#graph').clientHeight"), graphHeight);
  assert.ok(await js("document.querySelector('#derivative-teaching').scrollTop>0"), 'Teaching definitions must scroll independently');
  await js("document.querySelector('.lesson-definition').open=false; document.querySelector('#derivative-teaching').scrollTop=0");
  for (const [width,height] of [[860,700],[821,620],[820,620],[680,620],[480,600],[1280,760]]) {
    win.setContentSize(width,height); await painted(); await fills(`active teaching ${width}x${height}`);
    assert.equal(await js("document.documentElement.scrollWidth<=window.innerWidth"),true,'Responsive layout must not overflow horizontally');
  }
  assert.equal(await js("document.querySelector('#derivative-teaching').getBoundingClientRect().width"), lessonPreferred);
  await js("document.querySelector('#sidebar-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));document.querySelector('#lesson-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))");
  await fills('sidebars restored to default widths'); await painted(); await pause(200);
  fs.writeFileSync(path.join(os.tmpdir(),'MathPad-derivative-sidebars.png'),(await win.webContents.capturePage()).toPNG());
  log('RIGHT TEACHING SIDEBAR: FULL HEIGHT, POINTER RESIZE, INDEPENDENT SCROLL, RESPONSIVE SIZES AND RESTORED WIDTH');
  await click('lesson-clear'); await fills('teaching collapsed');
  await js("document.querySelector('[data-workspace=sequence-workspace]').click(); document.querySelector('[data-sequence-example=squares]').click(); document.querySelector('#sequence-form').requestSubmit()");
  await wait("document.querySelector('#sequence-output .formula-card') && !document.querySelector('#sequence-form [type=submit]').disabled", 'Sequence did not finish');
  await js("document.querySelector('[data-workspace=graph-workspace]').click(); document.querySelector('[data-lesson-example=quadratic]').click()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope==='2'", 'Teaching did not recover');
  await click('lesson-play');
  await js("document.querySelector('#derivative-form').requestSubmit(); document.querySelector('#clear-all').click()");
  await pause(400);
  assert.equal(await js("window.ggbApplet.getAllObjectNames().length"), 0);
  assert.equal(await js("document.querySelectorAll('.curve-row,#results>li,.formula-card').length"), 0);
  assert.equal(await js("document.querySelector('#derivative-teaching').hidden"), true);
  assert.equal(await js("Array.from(document.querySelectorAll('#derivative-form input,#sequence-form input,#formula-text')).every(input=>input.value==='')"), true);
  assert.equal(await js("document.querySelector('#lesson-play').getAttribute('aria-pressed')"), 'false');
  await fills('cleared while animation and calculation were pending');
  await add('y=x+1'); assert.equal(await js("window.ggbApplet.exists('mp1')"), true);
  await js("document.querySelector('[data-panel=curves-panel]').click()");
  await painted();
  await pause(180);
  fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-polished-layout.png'), (await win.webContents.capturePage()).toPNG());
  log('CLEAR ALL CANCELS PENDING JOBS, CLEANS INPUTS AND REUSES SAME GRAPH');
}

loadApp();
