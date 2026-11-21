const { app, BrowserWindow, Menu, Tray, ipcMain, protocol, screen, session } = require('electron');
const { mkdirSync } = require('node:fs');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { createGeoGebraAssets } = require('./geogebra-assets.cjs');
const { createFloatingWindow } = require('./floating-window.cjs');
const { createSettings, loadFloatingPosition } = require('./settings.cjs');

const origin = 'mathpad://app';
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/floating.html', ['floating.html', 'text/html']],
  ['/floating.css', ['floating.css', 'text/css']],
  ['/floating.js', ['floating.js', 'text/javascript']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/renderer.mjs', ['renderer.mjs', 'text/javascript']],
  ['/settings-page.mjs', ['settings-page.mjs', 'text/javascript']],
  ['/expression.mjs', ['expression.mjs', 'text/javascript']],
  ['/python-expression.mjs', ['python-expression.mjs', 'text/javascript']],
  ['/mathml.mjs', ['mathml.mjs', 'text/javascript']],
  ['/graph.mjs', ['graph.mjs', 'text/javascript']],
  ['/derivative-model.mjs', ['derivative-model.mjs', 'text/javascript']],
  ['/derivative-lesson.mjs', ['derivative-lesson.mjs', 'text/javascript']],
  ['/sidebar-resize.mjs', ['sidebar-resize.mjs', 'text/javascript']],
  ['/calculator.mjs', ['calculator.mjs', 'text/javascript']],
  ['/calculations.mjs', ['calculations.mjs', 'text/javascript']],
  ['/calculation-worker.js', ['calculation-worker.js', 'text/javascript']],
  ['/nerdamer.js', ['../../node_modules/nerdamer/dist/bundle.js', 'text/javascript']],
  ['/katex.js', ['../../node_modules/katex/dist/katex.min.js', 'text/javascript']],
  ['/katex.css', ['../../node_modules/katex/dist/katex.min.css', 'text/css']],
]);
protocol.registerSchemesAsPrivileged([
  { scheme: 'mathpad', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

let panel;
let tray;
let floating;
let settings;
let quitting = false;

// Honor Electron's explicit profile argument before acquiring the instance lock.
const userDataDirectory = app.commandLine.getSwitchValue('user-data-dir');
if (userDataDirectory) {
  mkdirSync(path.resolve(userDataDirectory), { recursive: true });
  app.setPath('userData', path.resolve(userDataDirectory));
}
if (process.platform === 'win32') app.setAppUserModelId('MathPad.Desktop');

function releasePanelTopmost() {
  if (panel && !panel.isDestroyed()) panel.setAlwaysOnTop(false);
}

function setPanelTopmost(enabled) {
  if (enabled) panel.setAlwaysOnTop(true, 'pop-up-menu');
  else releasePanelTopmost();
}

function revealPanel() {
  if (!panel || panel.isDestroyed() || quitting) return;
  if (panel.isMinimized()) panel.restore();
  const bounds = panel.getBounds();
  if (!screen.getAllDisplays().some(({ workArea: area }) => (
    bounds.x + 80 <= area.x + area.width && bounds.x + bounds.width - 80 >= area.x &&
    bounds.y >= area.y && bounds.y + 32 <= area.y + area.height
  ))) {
    positionPanel();
  }
  panel.show();
  setPanelTopmost(settings.values.panelTopmost !== 'never');
  panel.moveTop();
  panel.focus();
  floating?.raise();
  setTimeout(() => {
    if (panel && !panel.isDestroyed() && settings.values.panelTopmost === 'temporary' && !panel.isFocused()) {
      releasePanelTopmost();
    }
  }, 150);
}

function hasTray() { return tray && !tray.isDestroyed(); }
function canRecoverPanel() { return hasTray() || (settings.values.showBall && floating?.available); }
function hidePanel() { if (canRecoverPanel()) panel?.hide(); }

function publishSettings() {
  if (!quitting && panel && !panel.isDestroyed()) panel.webContents.send('settings:changed', settings.values);
}

function changeSettings(save) {
  const previous = settings.values;
  save();
  const next = settings.values;
  if (next.panelTopmost !== previous.panelTopmost) {
    setPanelTopmost(next.panelTopmost === 'always' && panel.isVisible() && !panel.isMinimized());
  }
  try { floating?.configure(next); }
  catch (error) { console.warn('Could not configure the floating button:', error.message); }
  if (!canRecoverPanel() && !panel.isVisible()) revealPanel();
  updateTrayMenu();
  publishSettings();
}

function settingsError(error) {
  if (!error.code) return error.message;
  if (['EACCES', 'EPERM', 'EBUSY', 'EISDIR'].includes(error.code)) return '无法保存设置。请检查配置文件是否可写且未被占用。';
  return `无法保存设置（${error.code}）。`;
}

function resetBallPosition() {
  if (!floating) throw new Error('悬浮球当前不可用。');
  floating.resetPosition();
}

function nativeSetting(action) {
  try { action(); }
  catch (error) {
    updateTrayMenu();
    panel.webContents.send('settings:error', settingsError(error));
    revealPanel();
  }
}

function registerSettingsHandlers() {
  function handle(channel, action) {
    ipcMain.handle(channel, (event, data) => {
      if (event.sender !== panel?.webContents || !event.senderFrame || event.senderFrame.parent
          || event.senderFrame.url !== `${origin}/`) throw new Error('Settings are only available in the workbench.');
      try { return action(data); }
      catch (error) { return { error: settingsError(error), values: settings.values }; }
    });
  }
  handle('settings:load', legacy => {
    settings.migrateWidths(legacy);
    return { values: settings.values, error: settings.readError };
  });
  handle('settings:update', patch => { changeSettings(() => settings.update(patch)); return {}; });
  handle('settings:reset', () => { changeSettings(settings.reset); return {}; });
  handle('settings:reset-ball-position', () => { resetBallPosition(); return {}; });
}

function updateTrayMenu() {
  if (!hasTray() || quitting) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { id: 'show-panel', label: '显示面板', click: revealPanel },
    { id: 'hide-panel', label: '收起面板', click: hidePanel },
    { type: 'separator' },
    { id: 'show-floating', label: '显示悬浮球', type: 'checkbox', checked: settings.values.showBall && Boolean(floating?.available), enabled: Boolean(floating), click: item => nativeSetting(() => changeSettings(() => settings.update({ showBall: item.checked }))) },
    { id: 'reset-floating', label: '重置悬浮球位置', enabled: Boolean(floating), click: () => nativeSetting(resetBallPosition) },
    { type: 'separator' },
    { id: 'quit-mathpad', label: '完全退出 Math Pad', click: () => app.quit() },
  ]));
}

function floatingMenu(window) {
  return new Promise(resolve => Menu.buildFromTemplate([
    { label: '显示 Math Pad', click: revealPanel },
    { label: '重置位置', click: () => nativeSetting(resetBallPosition) },
    { label: '隐藏悬浮球', click: hideFloating },
    { type: 'separator' },
    { label: '完全退出 Math Pad', click: () => app.quit() },
  ]).popup({ window, callback: resolve }));
}

function hideFloating() {
  nativeSetting(() => changeSettings(() => settings.update({ showBall: false })));
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, '..', 'assets', 'mathpad.ico'));
    tray.setToolTip(`Math Pad v${app.getVersion()} · 点击显示面板，右键完全退出`);
    updateTrayMenu();
    tray.on('click', revealPanel);
    tray.on('double-click', revealPanel);
  } catch (error) {
    tray?.destroy(); tray = undefined;
    console.warn('Tray unavailable; closing the panel will quit:', error.message);
  }
}

function positionPanel() {
  const { workArea: area } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = Math.min(860, area.width - 24);
  const height = Math.min(730, area.height - 96);
  panel.setBounds({ x: area.x + area.width - width - 20, y: area.y + 72, width, height });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', revealPanel);
  app.on('activate', revealPanel);
  app.on('before-quit', () => { quitting = true; floating?.destroy(); });
  app.on('will-quit', () => { tray?.destroy(); tray = undefined; });
  app.whenReady().then(() => {
    const profile = app.getPath('userData');
    const initialPosition = loadFloatingPosition(profile);
    settings = createSettings(profile, initialPosition);
    registerSettingsHandlers();
    const geogebraAsset = createGeoGebraAssets();
    protocol.handle('mathpad', async (request) => {
      const url = new URL(request.url);
      if (url.host !== 'app') return new Response('Not found', { status: 404 });
      const asset = geogebraAsset(url.pathname);
      const font = /^\/fonts\/(KaTeX_[a-zA-Z0-9_-]+\.(?:woff2?|ttf))$/.exec(url.pathname);
      const file = files.get(url.pathname)
        || (font && [`../../node_modules/katex/dist/fonts/${font[1]}`, font[1].endsWith('woff2') ? 'font/woff2' : font[1].endsWith('woff') ? 'font/woff' : 'font/ttf']);
      if (!asset && !file) return new Response('Not found', { status: 404 });
      try {
        return new Response(await readFile(asset ? asset.filename : path.join(__dirname, 'ui', file[0])), {
          headers: {
            'Content-Type': asset ? asset.contentType : `${file[1]}; charset=utf-8`,
            'Cache-Control': 'no-store',
          },
        });
      } catch (error) {
        console.warn('Local resource unavailable:', url.pathname, error.message);
        return new Response('Local resource unavailable', { status: 404 });
      }
    });

    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    panel = new BrowserWindow({
      title: 'Math Pad · 函数面板',
      show: false,
      minWidth: 440,
      minHeight: 470,
      backgroundColor: '#f0f3f8',
      icon: path.join(__dirname, '..', 'assets', 'mathpad.ico'),
      alwaysOnTop: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'settings-preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Math Pad', submenu: [{ label: '收起面板', click: hidePanel }, { label: '完全退出', accelerator: 'Ctrl+Q', click: () => app.quit() }] },
      { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    ]));
    panel.webContents.on('will-navigate', (event) => event.preventDefault());
    panel.on('blur', () => { if (settings.values.panelTopmost !== 'always') releasePanelTopmost(); });
    panel.on('hide', releasePanelTopmost);
    panel.on('minimize', releasePanelTopmost);
    panel.on('restore', () => { if (settings.values.panelTopmost === 'always') setPanelTopmost(true); });
    panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    panel.on('close', (event) => {
      if (quitting) return;
      if (settings.values.closeAction === 'quit' || !hasTray()) { app.quit(); return; }
      event.preventDefault();
      panel.hide();
    });
    createTray();
    positionPanel();
    try {
      floating = createFloatingWindow({
        origin, initialPosition, preferences: settings.values,
        onActivate: revealPanel, onMenu: floatingMenu, onHide: hideFloating,
        onUnavailable() { updateTrayMenu(); if (!canRecoverPanel()) revealPanel(); },
      });
    } catch (error) {
      console.warn('Floating button unavailable; use the tray to show Math Pad:', error.message);
    }
    updateTrayMenu();
    if (settings.values.openAtStartup || !canRecoverPanel()) panel.once('ready-to-show', revealPanel);
    // Preload the workbench quietly unless the startup preference requests it.
    panel.loadURL(`${origin}/`);
  });
}
