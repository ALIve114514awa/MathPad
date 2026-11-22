const { app, BrowserWindow, Tray, screen } = require('electron');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pause, until, createLogger, prepareOfflineWindow, loadApp } = require('./lib/smoke.cjs');

const phase = process.env.MATHPAD_SETTINGS_PHASE;
const report = path.join(os.tmpdir(), 'MathPad-settings-smoke.log');
const log = createLogger(report);
const nativeFocus = process.env.MATHPAD_TEST_NO_FOCUS_CHECKS !== '1';

if (!phase) {
  fs.writeFileSync(report, 'Math Pad settings checks\n');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'MathPad-settings-profile-'));
  fs.writeFileSync(path.join(profile, 'floating-window.json'), JSON.stringify({
    version: 2, visible: false, displayId: -1, xRatio: 0, yRatio: .34,
  }));
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ version: 1, lessonDuration: 3500, openAtStartup: true }));
  for (const stage of ['initial', 'restart', 'corrupt']) {
    if (stage === 'corrupt') fs.writeFileSync(path.join(profile, 'settings.json'), '{invalid');
    const child = spawnSync(process.execPath, [__filename], {
      windowsHide: true, timeout: 155000, stdio: 'ignore',
      env: { ...process.env, MATHPAD_SETTINGS_PHASE: stage, MATHPAD_SETTINGS_PROFILE: profile },
    });
    if (child.status !== 0) {
      log('FAIL', stage, child.status, child.error?.message || '');
      app.exit(1);
      return;
    }
  }
  log('ALL CHECKS PASSED');
  app.exit(0);
} else {
  const profile = process.env.MATHPAD_SETTINGS_PROFILE;
  const filename = path.join(profile, 'settings.json');
  app.setName('MathPad settings verification');
  app.setPath('userData', profile);
  let trayMenu;
  const setContextMenu = Tray.prototype.setContextMenu;
  Tray.prototype.setContextMenu = function (menu) {
    if (phase === 'corrupt') throw new Error('Test tray unavailable');
    trayMenu = menu;
    return setContextMenu.call(this, menu);
  };
  const guard = setTimeout(() => { log('FAIL timeout', phase); app.exit(1); }, 150000);
  app.on('browser-window-created', (_, win) => {
    if (win.getTitle() !== 'Math Pad · 函数面板') return;
    prepareOfflineWindow(win);
    win.webContents.on('console-message', details => {
      if (details.level === 'error' || details.message.startsWith('GeoGebra load failed')) log('BROWSER', details.message.slice(0, 500));
    });
    win.webContents.once('did-finish-load', () => {
      verify(win).catch(async error => {
        log('FAIL', phase, error.stack);
        try {
          const shot = await Promise.race([win.webContents.capturePage(), pause(1000)]);
          if (shot) fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-settings-failure.png'), shot.toPNG());
        } catch {}
        app.exit(1);
      });
    });
  });
  loadApp();

  async function verify(win) {
    const js = source => win.webContents.executeJavaScript(source);
    const click = id => js(`document.getElementById(${JSON.stringify(id)}).click()`);
    const awaitPage = (condition, label, timeout) => until(() => js(condition), label, timeout);
    const field = key => `document.querySelector('[data-setting="${key}"]')`;
    const checked = key => js(`${field(key)}.checked`);
    const value = key => js(`${field(key)}.value`);
    const ballWindow = () => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Math Pad · 悬浮球');
    const toggleBall = () => trayMenu.getMenuItemById('show-floating').click();
    const readSaved = () => JSON.parse(fs.readFileSync(filename, 'utf8'));
    const graphObjectNames = () => js('window.ggbApplet.getAllObjectNames()');
    const curveNames = () => js("Array.from(document.querySelectorAll('.curve-row'), row => row.dataset.name)");
    const mode = () => js("document.querySelector('.input-modes [aria-pressed=true]').id");
    const painted = () => js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    async function change(key, next) {
      await js(`(() => {
        const control = ${field(key)};
        if (control.type === 'checkbox') control.checked = ${JSON.stringify(next)};
        else control.value = ${JSON.stringify(String(next))};
        control.dispatchEvent(new Event('change'));
      })()`);
      await awaitPage("document.querySelector('#settings-status').textContent === '已保存。'", 'Did not save ' + key);
      assert.equal(readSaved()[key], next, key);
    }
    async function add(text) {
      await click('open-formula');
      await js(`document.querySelector('#formula-text').value=${JSON.stringify(text)};document.querySelector('#formula-text').dispatchEvent(new Event('input'))`);
      await click('submit-formula');
      await awaitPage("!document.querySelector('#formula-dialog').open", 'Could not plot ' + text);
    }
    async function reset() {
      await js("window.confirm=()=>true;document.querySelector('#reset-settings').click()");
      await awaitPage("document.querySelector('#settings-status').textContent === '已恢复默认设置。'", 'Default settings were not restored');
    }
    await awaitPage("document.querySelector('#graph-state').dataset.state === 'ready'", 'Graph did not start', 60000);
    await until(() => ballWindow() && !ballWindow().webContents.isLoadingMainFrame(), 'Floating window did not load');
    const ball = ballWindow();
    if (phase === 'corrupt') {
      await until(() => win.isVisible(), 'Panel must show when both tray and ball are unavailable');
      assert.equal(ball.isVisible(), false);
      assert.match(await js("document.querySelector('#settings-error').textContent"), /无法读取设置文件/);
      assert.equal(await value('inputMode'), 'hand');
      assert.equal(fs.readFileSync(filename, 'utf8'), '{invalid');
      await click('open-settings');
      await change('inputMode', 'keyboard');
      log('CORRUPT SETTINGS RECOVER ON SAVE; PANEL OPENS WITHOUT TRAY OR VISIBLE BALL');
      clearTimeout(guard); app.quit();
      return;
    }
    if (phase === 'restart') {
      assert.equal(win.isVisible(), false);
      assert.equal(ball.isVisible(), false);
      trayMenu.getMenuItemById('show-panel').click();
      await until(() => win.isVisible(), 'The tray could not open the workbench after restart');
      await click('open-settings');
      assert.equal(await value('inputMode'), 'python');
      assert.equal(await checked('showGrid'), false);
      assert.equal(await js('window.ggbApplet.getGridVisible()'), false);
      assert.equal(await value('sidebarWidth'), '376');
      assert.equal(await value('lessonDuration'), '1750');
      assert.equal(await value('lessonFormulaPlacement'), 'list');
      await click('back-to-workspace');
      await click('open-formula');
      assert.equal(await mode(), 'mode-python');
      await click('cancel-formula');
      clearTimeout(guard);
      app.once('quit', () => log('SETTINGS SURVIVE RESTART; TITLEBAR CLOSE QUITS'));
      win.close();
      return;
    }

    assert.equal(win.isVisible(), false);
    assert.equal(ball.isVisible(), false);
    assert.equal(trayMenu.getMenuItemById('show-floating').checked, false);
    const migratedPosition = ball.getContentBounds();
    const area = screen.getDisplayNearestPoint({ x: migratedPosition.x + 24, y: migratedPosition.y + 24 }).workArea;
    assert.equal(migratedPosition.y, Math.round(area.y + (area.height - 48) * .34));
    assert.equal(await ball.webContents.executeJavaScript('typeof window.mathPadSettings'), 'undefined');
    await js("localStorage.setItem('mathpad.sidebarWidth','365');localStorage.setItem('mathpad.lessonWidth','318')");
    const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload(); await loaded;
    await awaitPage("document.querySelector('#graph-state').dataset.state === 'ready'", 'Graph did not reload', 60000);
    assert.equal(await value('sidebarWidth'), '365');
    assert.equal(await value('lessonWidth'), '318');
    assert.equal(readSaved().showBall, false);
    assert.equal(readSaved().sidebarWidth, 365);
    assert.equal(Object.hasOwn(readSaved(), 'openAtStartup'), false);
    assert.equal(await value('inputMode'), 'hand');
    trayMenu.getMenuItemById('show-panel').click();
    await until(() => win.isVisible(), 'Could not show panel');
    win.setContentSize(1000, 720);
    await click('open-formula');
    assert.equal(await mode(), 'mode-hand');
    const normalHeight = await js("document.querySelector('#hand-canvas').clientHeight");
    await click('cancel-formula');
    await click('open-settings');
    await change('handHeight', 'tall');
    await click('back-to-workspace');
    await click('open-formula');
    assert.ok(await js("document.querySelector('#hand-canvas').clientHeight") > normalHeight + 20);
    await click('cancel-formula');
    log('LEGACY WIDTH, POSITION AND VISIBILITY MIGRATED; DEFAULT HAND MODE AND TALL CANVAS');

    await click('open-settings');
    await change('inputMode', 'python');
    await click('back-to-workspace');
    await add('x**2');
    await add('x+2');
    await js("document.querySelectorAll('.curve-row input').forEach(input=>input.click())");
    await click('intersect');
    const intersections = await js("document.querySelector('#results').textContent");
    assert.match(intersections, /-1,\s*1/);
    const objects = await graphObjectNames();
    const originalView = await js('window.ggbApplet.getViewProperties(1)');
    await click('open-settings');
    await change('inputMode', 'keyboard');
    await change('showGrid', false);
    await change('showAxes', false);
    await change('lineWidth', 6);
    await click('back-to-workspace'); await painted();
    assert.equal(await js('window.ggbApplet.getGridVisible()'), false);
    const axisVisible = () => js(`(() => {
      const xml = new DOMParser().parseFromString(window.ggbApplet.getXML(), 'application/xml');
      return Array.from(xml.querySelectorAll('euclidianView axis'), axis => axis.getAttribute('show'));
    })()`);
    assert.deepEqual((await axisVisible()).slice(0, 2), ['false', 'false']);
    assert.deepEqual(await graphObjectNames(), objects);
    assert.equal(await js("document.querySelector('#results').textContent"), intersections);
    assert.equal(await js('window.ggbApplet.getViewProperties(1)'), originalView);
    await add('y=x-3');
    for (const name of await curveNames()) assert.equal(await js(`window.ggbApplet.getLineThickness(${JSON.stringify(name)})`), 6);
    await js("document.querySelector('.curve-row [data-edit]').click()");
    assert.equal(await mode(), 'mode-python');
    assert.equal(await js("document.querySelector('#formula-text').value"), 'x**2');
    await click('cancel-formula');
    log('AXES, GRID AND EXISTING/NEW CURVE THICKNESS UPDATE; VIEW, INTERSECTIONS AND EDIT MODE PRESERVED');

    await js("document.querySelector('[data-workspace=sequence-workspace]').click();document.querySelector('#sequence-form [name=count]').value='17'");
    await click('open-settings'); await click('back-to-workspace');
    assert.equal(await js("document.querySelector('#sequence-workspace').hidden"), false);
    assert.equal(await js("document.querySelector('#sequence-form [name=count]').value"), '17');
    await js("document.querySelector('[data-panel=derivative-workspace]').click();document.querySelector('[data-lesson-example=quadratic]').click()");
    await awaitPage("document.querySelector('#derivative-teaching').dataset.slope==='2'", 'Derivative lesson did not start');
    assert.equal(await js("document.querySelector('#derivative-formulas').hidden"), false, 'Old preferences should default to placement A');
    const objectsBeforePlacementChange = await graphObjectNames();
    await click('open-settings');
    assert.equal(await value('lessonFormulaPlacement'), 'both');
    await change('lessonFormulaPlacement', 'list');
    await click('back-to-workspace');
    assert.equal(await js("document.querySelector('#derivative-formulas').hidden"), true);
    assert.equal(await js("document.querySelectorAll('#curves > .derivative-group').length"), 1);
    assert.deepEqual(await graphObjectNames(), objectsBeforePlacementChange);
    await click('open-settings');
    await change('lessonFormulaPlacement', 'both');
    await change('lessonDuration', 1750);
    await change('sidebarWidth', 360);
    await change('lessonWidth', 300);
    await click('back-to-workspace');
    assert.equal(await js("document.querySelector('#derivative-workspace').hidden"), false);
    assert.equal(await js("document.querySelector('#derivative-formulas').hidden"), false);
    const start = Date.now();
    await click('lesson-play');
    await awaitPage("document.querySelector('#lesson-play').getAttribute('aria-pressed')==='false'", 'Fast derivative lesson did not finish', 3000);
    assert.ok(Date.now() - start < 3300, 'Fast playback used the standard duration');
    assert.equal(await js("document.querySelector('#derivative-teaching').dataset.h"), '0.001');
    win.setContentSize(1280, 720); await painted();
    const effective = Number(await js("document.querySelector('#sidebar-resizer').getAttribute('aria-valuenow')"));
    await js("document.querySelector('#sidebar-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}))");
    await until(() => readSaved().sidebarWidth === effective + 16, 'Separator edit did not save');
    await click('open-settings');
    assert.equal(await value('sidebarWidth'), String(effective + 16));
    win.setContentSize(445, 470); await painted();
    assert.equal(await js(`(() => {
      const page = document.querySelector('.settings-scroll');
      page.scrollTop = page.scrollHeight;
      return page.scrollTop > 0 && page.scrollWidth <= page.clientWidth + 1
        && document.querySelector('#back-to-workspace').getBoundingClientRect().bottom <= page.getBoundingClientRect().top
        && document.querySelector('#reset-settings').getBoundingClientRect().top >= page.getBoundingClientRect().bottom;
    })()`), true);
    win.setContentSize(1080, 770); await painted();
    await js("document.querySelector('.settings-scroll').scrollTop=0"); await painted();
    fs.writeFileSync(path.join(os.tmpdir(), 'MathPad-settings.png'), (await win.webContents.capturePage()).toPNG());
    log('RETURNS TO SEQUENCE AND DERIVATIVE; ANIMATION SPEED, SEPARATOR SYNC AND NARROW SCROLL PASSED');

    const originalCursor = screen.getCursorScreenPoint;
    screen.getCursorScreenPoint = () => ({ x: area.x + 400, y: area.y + 20 });
    try {
      await change('retractDelay', 1500);
      await change('showBall', true);
      assert.equal(trayMenu.getMenuItemById('show-floating').checked, true);
      assert.equal(ball.isVisible(), true);
      assert.equal(ball.isFocusable(), false);
      const retracted = () => ball.webContents.executeJavaScript("document.querySelector('#floating-ball').dataset.retracted==='true'");
      await pause(850);
      assert.equal(await retracted(), false);
      await until(retracted, 'Long delay never retracted');
      await change('retractBall', false);
      await until(async () => !(await retracted()), 'Turning off retraction did not expand ball');
      await pause(650);
      assert.equal(await retracted(), false);
      assert.equal(await js(`${field('retractDelay')}.disabled`), true);
      await change('retractBall', true);
      await change('retractDelay', 500);
      await until(retracted, 'Short delay never retracted', 1300);
      toggleBall();
      await until(async () => !(await checked('showBall')), 'Tray toggle did not update settings');
      assert.equal(ball.isVisible(), false);
      await click('reset-ball-position');
      await awaitPage("document.querySelector('#settings-status').textContent.includes('左侧中间')", 'Could not reset position');
      assert.equal(ball.isVisible(), false);
      assert.equal(ball.getContentBounds().y, Math.round(area.y + (area.height - 48) / 2));
    } finally { screen.getCursorScreenPoint = originalCursor; }
    log('BALL DELAY, INSTANT EXPANSION, TRAY SYNC AND RESET WITHOUT SHOWING');

    if (nativeFocus) {
      await change('panelTopmost', 'always');
      assert.equal(win.isAlwaysOnTop(), true);
      const probe = new BrowserWindow({ show: false, width: 320, height: 200 });
      try {
        await probe.loadURL('data:text/html,<p>Other window</p>');
        probe.show(); probe.focus();
        await until(() => probe.isFocused() && !win.isFocused(), 'Could not transfer focus');
        assert.equal(win.isAlwaysOnTop(), true);
        await change('panelTopmost', 'temporary');
        assert.equal(win.isAlwaysOnTop(), false);
        await change('panelTopmost', 'never');
        trayMenu.getMenuItemById('show-panel').click();
        await until(() => win.isFocused(), 'Could not restore foreground');
        assert.equal(win.isAlwaysOnTop(), false);
      } finally { probe.destroy(); }
      log('PERMANENT TOPMOST SURVIVES BLUR; OTHER MODES RELEASE IT');
    }

    const moved = filename + '.smoke-backup';
    fs.renameSync(filename, moved);
    fs.mkdirSync(filename);
    try {
      await js(`${field('showGrid')}.click()`);
      await awaitPage("document.querySelector('#settings-error').textContent.includes('无法保存设置')", 'Write failure did not appear');
      assert.equal(await checked('showGrid'), false);
      assert.equal(await js('window.ggbApplet.getGridVisible()'), false);
    } finally {
      fs.rmdirSync(filename);
      fs.renameSync(moved, filename);
    }
    assert.match((await js("window.mathPadSettings.update({openAtStartup:true,showGrid:true})")).error, /设置值无效/);
    const beforeReset = await graphObjectNames();
    await reset();
    assert.deepEqual(await graphObjectNames(), beforeReset);
    assert.equal(await js('window.ggbApplet.getGridVisible()'), true);
    assert.equal(await value('sidebarWidth'), '300');
    assert.equal(await value('lessonWidth'), '280');
    assert.equal(await value('inputMode'), 'hand');
    assert.equal(await value('lessonDuration'), '3500');
    assert.equal(await value('lessonFormulaPlacement'), 'both');
    assert.equal(await checked('showBall'), true);
    assert.equal(await js("document.querySelector('#sequence-form [name=count]').value"), '17');
    assert.equal(await js("document.querySelector('#results').textContent"), intersections);
    log('WRITE FAILURE ROLLS BACK; DEFAULTS RESET PREFERENCES AND PRESERVE WORKBENCH');
    await change('closeAction', 'quit');
    await change('showBall', false);
    await change('inputMode', 'python');
    await change('showGrid', false);
    await change('sidebarWidth', 376);
    await change('lessonDuration', 1750);
    await change('lessonFormulaPlacement', 'list');
    clearTimeout(guard); app.quit();
  }
}
