const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const { SIZE, DRAG_DISTANCE, constrain, remember, restore, circleShape } = require('./floating-geometry.cjs');
const { createFloatingDock } = require('./floating-dock.cjs');
const { writeJson } = require('./settings.cjs');

function createFloatingWindow({ origin, initialPosition, preferences, onActivate, onMenu, onHide, onUnavailable }) {
  const positionFile = path.join(app.getPath('userData'), 'floating-window.json');
  let position = initialPosition;
  let wantedVisible = preferences.showBall;
  let win, loaded = false, drag, timer, disposed = false, menuOpen = false;
  const dock = createFloatingDock(() => win, () => Boolean(drag || menuOpen), preferences);

  function fallbackDisplay() { return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()); }
  function recordPosition(bounds) {
    const display = screen.getDisplayNearestPoint({ x: bounds.x + SIZE / 2, y: bounds.y + SIZE / 2 });
    return remember(bounds, display, wantedVisible);
  }
  function save() {
    if (!win || win.isDestroyed()) return;
    position = recordPosition(win.getContentBounds());
    try {
      writeJson(positionFile, position);
    } catch (error) {
      console.warn('Could not save floating button position:', error.message);
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
    const initialBounds = restore(position, screen.getAllDisplays(), fallbackDisplay());
    loaded = false;
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
    win.webContents.once('did-finish-load', () => {
      if (disposed || win !== created) return;
      loaded = true; dock.publish();
      if (wantedVisible) created.showInactive();
    });
    win.on('show', dock.resume);
    win.on('hide', dock.pause);
    win.on('close', event => { if (!disposed) { event.preventDefault(); onHide(); } });
    win.on('closed', () => {
      clearInterval(timer); timer = undefined; drag = undefined;
      if (win === created) { win = undefined; loaded = false; dock.pause(); }
      if (!disposed) onUnavailable();
    });
    win.loadURL(`${origin}/floating.html`).catch(error => {
      console.warn('Floating button could not load:', error.message);
      if (!created.isDestroyed()) created.destroy();
    });
  }
  function configure(next) {
    if (next.showBall && (!wantedVisible || !win)) {
      wantedVisible = true;
      ensureWindow();
      dock.expand(true);
      if (loaded) win.showInactive();
    } else if (!next.showBall && wantedVisible) {
      wantedVisible = false;
      finish(false);
      win?.hide();
    }
    dock.configure(next);
  }
  function resetPosition() {
    finish(false);
    const bounds = restore(undefined, screen.getAllDisplays(), fallbackDisplay());
    const next = recordPosition(bounds);
    writeJson(positionFile, next);
    position = next;
    if (win && !win.isDestroyed()) {
      dock.pause();
      win.setContentBounds(bounds);
      dock.resume();
    }
  }
  function displaysChanged() {
    finish(false);
    dock.pause();
    if (win && !win.isDestroyed()) {
      win.setContentBounds(restore(position, screen.getAllDisplays(), fallbackDisplay()));
      save(); dock.resume();
    }
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
    get available() { return Boolean(win && !win.isDestroyed()); },
    configure, resetPosition,
    present() {
      if (!wantedVisible || !loaded || !win || win.isDestroyed()) return;
      dock.expand(true);
      if (win.isVisible()) win.moveTop();
      else win.showInactive();
    },
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
