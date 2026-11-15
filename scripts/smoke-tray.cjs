const { until, createLogger, prepareOfflineWindow, loadApp } = require('./lib/smoke.cjs');
const { app, BrowserWindow, Tray } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const secondary = process.env.MATHPAD_TRAY_SECONDARY === '1';
const profile = process.env.MATHPAD_TRAY_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'MathPad-tray-profile-'));
const report = path.join(os.tmpdir(), 'MathPad-tray-smoke.log');
const log = createLogger(report);
app.setName('MathPad tray verification');
app.setPath('userData', profile);
if (!secondary) {
  fs.writeFileSync(report, 'Math Pad tray and real second-instance checks\n');
  let tray, menu, window, shows = 0, focuses = 0;
  const setContextMenu = Tray.prototype.setContextMenu;
  Tray.prototype.setContextMenu = function (value) { tray = this; menu = value; return setContextMenu.call(this, value); };
  const guard = setTimeout(() => { log('FAIL timeout'); app.exit(1); }, 120000);
  app.on('browser-window-created', (_, win) => {
    if (window) return;
    window = win;
    win.on('show', () => shows++);
    win.on('focus', () => focuses++);
    prepareOfflineWindow(win);
    win.webContents.once('did-finish-load', () => verify(win).catch(error => { log('FAIL', error.stack); clearTimeout(guard); app.exit(1); }));
  });
  app.on('quit', (_, code) => {
    if (code === 0 && tray?.isDestroyed()) log('NORMAL QUIT REMOVES TRAY AND CLOSES WINDOW; ALL CHECKS PASSED');
    else log('FAIL incomplete shutdown', { code, trayDestroyed: tray?.isDestroyed() });
  });
  async function verify(win) {
    const js = code => win.webContents.executeJavaScript(code);
    await until(() => js("document.querySelector('#graph-state').dataset.state==='ready'"), 'Graph did not load', 60000);
    assert.equal(win.isVisible(), false);
    assert.equal(shows, 0, 'Cold startup must not flash the workbench');
    assert.equal(focuses, 0, 'Cold startup must not focus the workbench');
    log('COLD START PRELOADS GRAPH WITHOUT SHOWING OR FOCUSING PANEL');
    assert.ok(tray && !tray.isDestroyed(), 'Native tray icon must exist');
    assert.ok(tray.getBounds().width > 0, 'Windows must allocate a notification icon');
    const item = id => menu.getMenuItemById(id);
    await js("window.ggbApplet.evalCommand('KeepFunction(x)=x^2+1')");
    const names = await js('window.ggbApplet.getAllObjectNames()');
    win.close();
    assert.equal(win.isDestroyed(), false);
    assert.equal(win.isVisible(), false);
    assert.equal(win.isAlwaysOnTop(), false);
    tray.emit('click', {}, tray.getBounds());
    await until(() => win.isVisible() && win.isFocused(), 'Tray click did not reveal the same window');
    assert.deepEqual(await js('window.ggbApplet.getAllObjectNames()'), names);
    item('hide-panel').click();
    assert.equal(win.isVisible(), false);
    item('show-panel').click();
    await until(() => win.isVisible(), 'Tray menu did not show the panel');
    log('TRAY ICON EXISTS; CLOSE HIDES; TRAY CLICK/MENU RESTORE SAME GRAPH');
    async function relaunch() {
      const child = spawn(process.execPath, [__filename], {
        env: { ...process.env, MATHPAD_TRAY_PROFILE: profile, MATHPAD_TRAY_SECONDARY: '1' },
        windowsHide: true, stdio: 'ignore',
      });
      const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
      assert.equal(exit, 0, 'Secondary process must exit normally');
    }
    win.hide(); await relaunch();
    await until(() => win.isVisible() && win.isFocused(), 'Real second launch did not reveal hidden window');
    assert.deepEqual(await js('window.ggbApplet.getAllObjectNames()'), names);
    win.minimize(); await relaunch();
    await until(() => !win.isMinimized() && win.isVisible(), 'Second launch did not restore minimized window');
    await Promise.all([relaunch(), relaunch(), relaunch()]);
    assert.equal(BrowserWindow.getAllWindows().filter(window=>window.getTitle()==='Math Pad · 函数面板').length, 1);
    assert.equal(BrowserWindow.getAllWindows().filter(window=>window.getTitle()==='Math Pad · 悬浮球').length, 1);
    log('REAL SECOND PROCESSES RESTORE HIDDEN/MINIMIZED WINDOW; RAPID LAUNCHES KEEP ONE PANEL AND ONE BALL');
    clearTimeout(guard);
    item('quit-mathpad').click();
  }
}
loadApp();
