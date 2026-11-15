const { pause, until, createLogger, prepareOfflineWindow, loadApp } = require('./lib/smoke.cjs');
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const report = path.join(os.tmpdir(), 'MathPad-python-smoke.log');
fs.writeFileSync(report, 'Math Pad Python mathematical input checks\n');
const log = createLogger(report);
app.setName('MathPad Python verification');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'MathPad-python-profile-')));
const guard = setTimeout(()=>{log('FAIL overall timeout');app.exit(1);},120000);
app.on('browser-window-created',(_,win)=>{
  if(win.getTitle()!=='Math Pad · 函数面板')return;
  prepareOfflineWindow(win);
  win.webContents.once('did-finish-load',()=>verify(win).then(()=>{clearTimeout(guard);log('ALL CHECKS PASSED');app.quit();}).catch(async error=>{
    clearTimeout(guard);log('FAIL',error.stack);
    try{fs.writeFileSync(path.join(os.tmpdir(),'MathPad-python-failure.png'),(await win.webContents.capturePage()).toPNG());}catch{}
    app.exit(1);
  }));
});
async function verify(win){
  app.emit('second-instance',{},[],process.cwd());
  const js=code=>win.webContents.executeJavaScript(code);
  const click=id=>js(`document.getElementById(${JSON.stringify(id)}).click()`);
  const wait=(code,label,timeout)=>until(()=>js(code),label,timeout);
  const fill=text=>js(`(()=>{const input=document.querySelector('#formula-text');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input'));})()`);
  const row=index=>js(`document.querySelectorAll('.curve-row')[${index}].dataset.name`);
  async function add(text,mode='python'){await click('open-formula');await click(`mode-${mode}`);await fill(text);await click('submit-formula');await wait("!document.querySelector('#formula-dialog').open",'Could not plot '+text);}
  async function edit(text){await js("document.querySelector('.curve-row [data-edit]').click()");assert.equal(await js("document.querySelector('#mode-python').getAttribute('aria-pressed')"),'true');await fill(text);await click('submit-formula');await wait("!document.querySelector('#formula-dialog').open",'Could not save '+text);}
  const value=async(name,x)=>js(`(()=>{const api=window.ggbApplet;api.evalCommand('PythonCheck=('+${JSON.stringify(x)}+','+${JSON.stringify(name)}+'('+${JSON.stringify(x)}+'))');const value=api.getYcoord('PythonCheck');api.deleteObject('PythonCheck');return value;})()`);
  await wait("document.querySelector('#graph-state').dataset.state==='ready'",'Offline graph did not load',60000);
  await add('x**2');await add('y=x+2','keyboard');
  await js("document.querySelectorAll('.curve-row input').forEach(input=>input.click())");await click('intersect');
  assert.match(await js("document.querySelector('#results').innerText"),/-1,\s*1/);assert.match(await js("document.querySelector('#results').innerText"),/2,\s*4/);
  const original=await row(0);await js("document.querySelector('.curve-row [data-edit]').click()");
  assert.equal(await js("document.querySelector('#formula-text').value"),'x**2');
  assert.equal(await js("document.querySelector('#mode-python').getAttribute('aria-pressed')"),'true');
  assert.equal(await js("document.querySelector('#python-reference').hidden"),false);
  await fill('x^2');await click('submit-formula');
  assert.match(await js("document.querySelector('#formula-error').textContent"),/乘方使用 \*\*/);assert.equal(await row(0),original);
  await fill('__import__("os")');await click('submit-formula');assert.equal(await row(0),original);await click('cancel-formula');
  await edit('x**2+1');assert.notEqual(await row(0),original);
  assert.equal(await js("document.querySelector('.curve-row').dataset.syntax"),'python');
  assert.match(await js("document.querySelector('#results').innerText"),/-0\.618034/);
  log('PYTHON AND KEYBOARD SHARE ONE GRAPH; INTERSECTIONS, RE-EDIT AND INVALID-INPUT PRESERVATION');
  await click('clear-all');await add('x**2');
  for(const [text,x,expected] of [
    ['-x**2',2,-4],['(-x)**2',2,4],['2**-x',2,.25],['2**3**2',0,512],
    ['math.log(x)',Math.E,1],['math.log(x, 2)',8,3],['math.log10(x)',100,2],
    ['math.sqrt(x)+abs(x)',4,6],['lambda x: math.sin(x)+math.pi',0,Math.PI],['1e-3*x',1000,1],
  ]){await edit(text);const actual=await value(await row(0),x);assert.ok(Math.abs(actual-expected)<1e-7,`${text}: ${actual} != ${expected}`);}
  log('ACTUAL GEOGEBRA VALUES MATCH PYTHON POWER PRECEDENCE, LOG BASES, FUNCTIONS AND CONSTANTS');
  await edit('math.log(x, 2)');await js("document.querySelector('.curve-row input').click()");await click('differentiate-selected');
  await wait("document.querySelector('#derivative-teaching').dataset.slope && !document.querySelector('#derivative-teaching').hidden",'Python curve did not enter derivative teaching');
  assert.ok(Math.abs(Number(await js("document.querySelector('#derivative-teaching').dataset.slope"))-1/Math.log(2))<1e-6);
  await click('clear-all');await add('x**2/25+y**2/9 == 1');await js("document.querySelector('.curve-row input').click();document.querySelector('#property').value='Focus';document.querySelector('#property').dispatchEvent(new Event('change'))");await click('analyze');
  assert.match(await js("document.querySelector('#results').innerText"),/-4,\s*0/);assert.match(await js("document.querySelector('#results').innerText"),/\(4,\s*0/);
  log('PYTHON CURVES SUPPORT DERIVATIVE TEACHING AND CONIC FOCI');
  await click('clear-all');await click('open-formula');await click('mode-python');
  await fill('x');await js("document.querySelector('#formula-text').setSelectionRange(1,1);document.querySelector('[data-symbol=\"^2\"]').click()");
  assert.equal(await js("document.querySelector('#formula-text').value"),'x**2');
  await click('mode-keyboard');assert.equal(await js("document.querySelector('#python-reference').hidden"),true);await click('mode-python');
  await js("document.querySelector('[data-python-example=\"math.log(x, 2)\"]').click()");assert.equal(await js("document.querySelector('#formula-text').value"),'math.log(x, 2)');
  win.setContentSize(700,720);await pause(200);
  await wait("(()=>{const input=document.querySelector('#formula-text').getBoundingClientRect(),help=document.querySelector('#python-reference').getBoundingClientRect(),dialog=document.querySelector('#formula-dialog');return help.top>=input.bottom && help.width>0 && dialog.scrollWidth<=dialog.clientWidth+1;})()",'Syntax details must sit below the input without horizontal overflow');
  await fill('x**2 + math.sin(x)');
  await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await pause(80);
  fs.writeFileSync(path.join(os.tmpdir(),'MathPad-python-input.png'),(await win.webContents.capturePage()).toPNG());
  log('VISIBLE SYNTAX REFERENCE BELOW INPUT; PYTHON SYMBOL BUTTONS AND EXAMPLE FILLING');
  await click('cancel-formula');await click('clear-all');
  assert.equal(await js("document.querySelector('#formula-text').value"),'');assert.equal(await js("document.querySelectorAll('.curve-row').length"),0);
}
loadApp();
