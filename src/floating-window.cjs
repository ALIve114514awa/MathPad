const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { SIZE, DRAG_DISTANCE, constrain, remember, restore, circleShape } = require('./floating-geometry.cjs');
const { createFloatingDock } = require('./floating-dock.cjs');

function createFloatingWindow({ origin, onActivate, onMenu, onVisibility }) {
  const settingsFile = path.join(app.getPath('userData'), 'floating-window.json');
  let settings;
  try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch {}
  let wantedVisible = ![1, 2].includes(settings?.version) || settings.visible !== false;
  let win, drag, timer, disposed = false, menuOpen = false;
  const dock = createFloatingDock(() => win, () => Boolean(drag || menuOpen));

  function fallbackDisplay() { return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()); }
  function save() {
    if (!win || win.isDestroyed()) return;
    const bounds = win.getContentBounds();
    settings = remember(bounds, screen.getDisplayNearestPoint({ x: bounds.x + SIZE / 2, y: bounds.y + SIZE / 2 }), wantedVisible);
    const staging = `${settingsFile}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
      fs.writeFileSync(staging, JSON.stringify(settings)); fs.renameSync(staging, settingsFile);
    } catch (error) {
      console.warn('Could not save floating button position:', error.message);
      try { fs.unlinkSync(staging); } catch {}
    }
  }
  function updateDrag() {
    if (!drag || !win || win.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - drag.cursor.x, dy = cursor.y - drag.cursor.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_DISTANCE) return;
    if (!drag.moved) { drag.moved = true; win.webContents.send('floating:drag-state', true); }
    win.setContentBounds({ x: Math.round(drag.bounds.x + dx), y: Math.round(drag.bounds.y + dy), width: SIZE, height: SIZE });
  }
  function finish(activate = false) {
    if (!drag) return;
    updateDrag();
    const moved = drag.moved;
    clearInterval(timer); timer = undefined; drag = undefined;
    if (!win || win.isDestroyed()) return;
    win.webContents.send('floating:drag-state', false);
    if (moved) {
      const bounds = win.getContentBounds();
      const display = screen.getDisplayNearestPoint({ x: bounds.x + SIZE / 2, y: bounds.y + SIZE / 2 });
      win.setContentBounds(constrain(bounds, display.workArea, true)); save();
    } else if (activate) onActivate();
    dock.refresh();
  }
  function begin() {
    if (!win || win.isDestroyed() || drag) return;
    drag = { cursor: screen.getCursorScreenPoint(), bounds: win.getContentBounds(), moved: false };
    dock.expand(true);
    timer = setInterval(updateDrag, 16);
  }
  async function openMenu() {
    finish(false); menuOpen = true; dock.expand(true);
    try { await onMenu(win); } finally { menuOpen = false; dock.refresh(); }
  }
  const handlers = new Map([
    ['floating:down', begin], ['floating:up', () => finish(true)],
    ['floating:cancel', () => finish(false)],
    ['floating:menu', () => { void openMenu().catch(error => console.warn('Floating menu unavailable:', error.message)); }],
  ]);
  for (const [channel, handler] of handlers) {
    const listener = event => { if (!disposed && win && event.sender === win.webContents && !event.senderFrame?.parent) handler(); };
    handlers.set(channel, listener); ipcMain.on(channel, listener);
  }
  function ensureWindow() {
    if (disposed || (win && !win.isDestroyed())) return;
    const initialBounds = restore(settings, screen.getAllDisplays(), fallbackDisplay());
    win = new BrowserWindow({
      title: 'Math Pad · 悬浮球', ...initialBounds, useContentSize: true,
      frame: false, thickFrame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      hasShadow: false, skipTaskbar: true, focusable: false, alwaysOnTop: true, show: false,
      webPreferences: {
        preload: path.join(__dirname, 'floating-preload.cjs'),
        nodeIntegration: false, contextIsolation: true, sandbox: true,
      },
    });
    const created = win;
    win.setMenu(null);
    // At fractional Windows DPI, native bounds can include an extra 1–2 DIP.
    // Anchor and move the visible 48-DIP client area, never the outer frame.
    win.setContentBounds(initialBounds); win.setAlwaysOnTop(true, 'pop-up-menu');
    if (process.platform === 'win32' || process.platform === 'linux') win.setShape(circleShape());
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.once('did-finish-load', () => { if (!disposed && win === created) { dock.publish(); if (wantedVisible) created.showInactive(); } });
    win.on('show', () => { dock.resume(); onVisibility?.(); });
    win.on('hide', () => { dock.pause(); onVisibility?.(); });
    win.on('close', event => { if (!disposed) { event.preventDefault(); hide(); } });
    win.on('closed', () => { clearInterval(timer); timer = undefined; drag = undefined; if (win === created) win = undefined; dock.pause(); onVisibility?.(); });
    win.loadURL(`${origin}/floating.html`).catch(error => {
      console.warn('Floating button could not load:', error.message);
      if (!created.isDestroyed()) created.destroy();
      onVisibility?.();
    });
  }
  function show() {
    wantedVisible = true; ensureWindow();
    dock.expand(true);
    if (win && !win.isDestroyed() && !win.webContents.isLoadingMainFrame()) win.showInactive();
    dock.resume();
    save(); onVisibility?.();
  }
  function hide() { finish(false); wantedVisible = false; win?.hide(); save(); onVisibility?.(); }
  function resetPosition() {
    finish(false); ensureWindow();
    if (win && !win.isDestroyed()) win.setContentBounds(restore(undefined, screen.getAllDisplays(), fallbackDisplay()));
    show();
  }
  function displaysChanged() {
    finish(false);
    dock.pause();
    if (win && !win.isDestroyed()) { win.setContentBounds(restore(settings, screen.getAllDisplays(), fallbackDisplay())); save(); if (win.isVisible()) dock.resume(); }
  }
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, displaysChanged);
  try { ensureWindow(); } catch (error) {
    disposed = true;
    dock.destroy();
    for (const [channel, listener] of handlers) ipcMain.removeListener(channel, listener);
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.removeListener(event, displaysChanged);
    if (win && !win.isDestroyed()) win.destroy();
    throw error;
  }
  return {
    get visible() { return Boolean(win && !win.isDestroyed() && win.isVisible()); },
    show, hide, resetPosition,
    raise() { if (win && !win.isDestroyed() && win.isVisible()) win.moveTop(); },
    destroy() {
      if (disposed) return;
      finish(false); save(); disposed = true; dock.destroy();
      for (const [channel, listener] of handlers) ipcMain.removeListener(channel, listener);
      for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.removeListener(event, displaysChanged);
      if (win && !win.isDestroyed()) win.destroy();
    },
  };
}

module.exports = { createFloatingWindow };
