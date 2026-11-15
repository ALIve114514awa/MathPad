const { pause, createLogger, prepareOfflineWindow, loadApp } = require('./lib/smoke.cjs');
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const report = path.join(os.tmpdir(), 'MathPad-curve-edit-smoke.log');
fs.writeFileSync(report, 'Math Pad formula editing checks\n');
const log = createLogger(report);
app.setName('MathPad curve editing verification');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'MathPad-edit-profile-')));
const guard = setTimeout(() => { log('FAIL timeout'); app.exit(1); }, 120000);
app.on('browser-window-created', (_, win) => {
  if (win.getTitle() === 'Math Pad · 悬浮球') return;
  prepareOfflineWindow(win);
  win.webContents.once('did-finish-load', () => verify(win).then(() => { clearTimeout(guard); log('ALL CHECKS PASSED'); app.exit(0); }).catch(async error => {
    clearTimeout(guard); log('FAIL', error.message, error.stack);
    try { fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-edit-failure.png'), (await win.webContents.capturePage()).toPNG()); } catch {}
    app.exit(1);
  }));
});

async function verify(win) {
  app.emit('second-instance', {}, [], process.cwd());
  const js = code => win.webContents.executeJavaScript(code);
  const click = id => js(`document.getElementById(${JSON.stringify(id)}).click()`);
  async function wait(code, label, timeout = 15000) {
    const end = Date.now() + timeout;
    do { if (await js(code)) return; await pause(60); } while (Date.now() < end);
    throw new Error(label + ': ' + await js("document.querySelector('#formula-error').textContent"));
  }
  async function fill(formula) {
    await js(`(() => { const field=document.querySelector('#formula-text'); field.value=${JSON.stringify(formula)}; field.dispatchEvent(new Event('input')); })()`);
  }
  async function add(formula) {
    await click('open-formula'); await click('mode-keyboard'); await fill(formula); await click('submit-formula');
    await wait("!document.querySelector('#formula-dialog').open", 'Could not add ' + formula);
  }
  const select = positions => js(`Array.from(document.querySelectorAll('.curve-row input')).forEach((input,index)=>{if(input.checked!==${JSON.stringify(positions)}.includes(index)) input.click();})`);
  const results = () => js("document.querySelector('#results').textContent");
  const rowName = index => js(`document.querySelectorAll('.curve-row')[${index}].dataset.name`);
  async function edit(index, formula) {
    await js(`document.querySelectorAll('.curve-row')[${index}].querySelector('[data-edit]').click()`);
    await fill(formula); await click('submit-formula');
    await wait("!document.querySelector('#formula-dialog').open", 'Could not save edit ' + formula);
  }
  await wait("document.querySelector('#graph-state').dataset.state==='ready'", 'Graph did not start', 60000);
  const recognized = await js("import('/mathml.mjs').then(({readMathML})=>readMathML('<math><mfrac><mn>2</mn><msup><mi>x</mi><mn>2</mn></msup></mfrac><mo>+</mo><mfrac><mn>4</mn><msup><mi>y</mi><mn>2</mn></msup></mfrac><mo>=</mo><mn>3</mn></math>'))");
  assert.equal(recognized, '((2)/((x)^(2)))+((4)/((y)^(2)))=3');
  await click('open-formula'); await click('mode-keyboard'); await fill(recognized); await click('submit-formula');
  assert.match(await js("document.querySelector('#formula-error').textContent"), /含变量分母的隐式方程/);
  assert.equal(await js("document.querySelector('#formula-text').value"), recognized);
  await click('cancel-formula');
  log('SCREENSHOT FORMULA: MATHML RECOGNIZED, PRECISE UNSUPPORTED-IMPLICIT MESSAGE');

  await add('y=x^2'); await add('y=x+2');
  await select([0, 1]); await click('intersect');
  assert.match(await results(), /-1,\s*1/); assert.match(await results(), /2,\s*4/);
  const original = await rowName(0);
  const color = await js("document.querySelector('.curve-row .curve-color').style.backgroundColor");
  const oldResult = await results();
  await js("document.querySelector('.curve-row [data-visibility]').click(); document.querySelector('.curve-row [data-edit]').click()");
  assert.equal(await js("document.querySelector('#formula-text').value"), 'y=x^2');
  assert.equal(await js("document.querySelector('#mode-keyboard').getAttribute('aria-pressed')"), 'true');
  await fill('y=x^'); await click('submit-formula');
  assert.equal(await js("document.querySelector('#formula-dialog').open"), true);
  assert.equal(await rowName(0), original);
  assert.equal(await results(), oldResult);
  await fill('x^2+y^2=-1'); await click('submit-formula');
  assert.equal(await js("document.querySelector('#formula-dialog').open"), true);
  assert.equal(await rowName(0), original);
  assert.equal(await results(), oldResult);
  await click('cancel-formula');
  assert.equal(await rowName(0), original);
  log('INVALID EDIT AND CANCEL PRESERVE ORIGINAL CURVE AND RESULTS');
  await edit(0, 'y=x^2+1');
  const replacement = await rowName(0);
  assert.notEqual(replacement, original);
  assert.equal(await js(`window.ggbApplet.exists(${JSON.stringify(original)})`), false);
  assert.equal(await js("document.querySelectorAll('.curve-row').length"), 2);
  assert.equal(await js("document.querySelector('.curve-row .curve-color').style.backgroundColor"), color);
  assert.equal(await js("document.querySelector('.curve-row').dataset.visible"), 'false');
  assert.equal(await js(`window.ggbApplet.getVisible(${JSON.stringify(replacement)})`), false);
  assert.equal(await js("document.querySelector('.curve-row input').checked"), true);
  const updated = await results();
  assert.match(updated, /y=x\^2\+1/); assert.match(updated, /-0\.618034/); assert.match(updated, /1\.618034/);
  assert.doesNotMatch(updated, /\(-1, 1\)/);
  assert.equal(await js("window.ggbApplet.getAllObjectNames('point').every(name=>!window.ggbApplet.getVisible(name))"), true);
  log('SUCCESSFUL EDIT PRESERVES ROW, COLOR, VISIBILITY AND SELECTION; INTERSECTIONS RECALCULATED');
  await edit(0, 'x^2/25+y^2/9=1'); await select([0]);
  await js("document.querySelector('#property').value='Focus'; document.querySelector('#property').dispatchEvent(new Event('change'))");
  await click('analyze'); assert.match(await results(), /-4,\s*0/);
  await edit(0, 'x^2/9+y^2/4=1');
  assert.match(await results(), /-2\.236068,\s*0/);
  assert.equal(await js("document.querySelector('#differentiate-selected').disabled"), true);
  log('CURVE TYPE AND FOCUS RESULTS UPDATE AFTER EDIT');

  await click('clear-all');
  await add('y=2*abs(x)/sqrt(3*x^2-2)'); await add('y=-2*abs(x)/sqrt(3*x^2-2)');
  const upper = await rowName(0), lower = await rowName(1);
  const domain = await js(`(() => { const api=window.ggbApplet;api.evalCommand('CheckOne=(1,${upper}(1))');api.evalCommand('CheckZero=(0,${upper}(0))');api.evalCommand('CheckGap=(0.5,${upper}(0.5))');api.evalCommand('CheckLower=(-1,${lower}(-1))');const result={upper:api.getYcoord('CheckOne'),lower:api.getYcoord('CheckLower'),zero:api.isDefined('CheckZero'),gap:api.isDefined('CheckGap')};for(const n of ['CheckOne','CheckZero','CheckGap','CheckLower'])api.deleteObject(n);return result;})()`);
  assert.deepEqual(domain, { upper: 2, lower: -2, zero: false, gap: false });
  log('RATIONAL EQUATION WORKAROUND: BOTH EXPLICIT BRANCHES PLOT WITH ORIGINAL DOMAIN', domain);
  await pause(180);
  fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-rational-branches.png'), (await win.webContents.capturePage()).toPNG());

  await js("document.querySelector('[data-panel=derivative-workspace]').click(); document.querySelector('[data-lesson-example=quadratic]').click()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope==='2'", 'Teaching did not start');
  await js("document.querySelector('[data-panel=curves-panel]').click(); document.querySelectorAll('.curve-row')[2].querySelector('[data-edit]').click()");
  await click('cancel-formula');
  assert.equal(await js("document.querySelector('#derivative-teaching').hidden"), false);
  await edit(2, 'y=x^3');
  assert.equal(await js("document.querySelector('#derivative-teaching').hidden"), true);
  assert.equal(await js("document.querySelector('#derivative-form').elements.namedItem('formula').value"), 'y=x^3');
  assert.equal(await js("document.querySelector('#derivative-output').dataset.stale"), 'true');
  await js("document.querySelector('[data-panel=derivative-workspace]').click();document.querySelector('#derivative-form').requestSubmit()");
  await wait("document.querySelector('#derivative-teaching').dataset.slope==='3'", 'Edited teaching source did not recalculate');
  assert.equal(await js("document.querySelectorAll('.curve-row').length"), 4);
  log('TEACHING CANCEL PRESERVES SCENE; SAVED SOURCE INVALIDATES AND RECALCULATES DERIVATIVE');
}

loadApp();
