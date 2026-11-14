const { app, BrowserWindow, Menu, protocol, screen, session } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const origin = 'mathpad://app';
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/renderer.mjs', ['renderer.mjs', 'text/javascript']],
  ['/expression.mjs', ['expression.mjs', 'text/javascript']],
  ['/mathml.mjs', ['mathml.mjs', 'text/javascript']],
  ['/graph.mjs', ['graph.mjs', 'text/javascript']],
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
let quitting = false;

function revealPanel() {
  if (!panel) return;
  if (panel.isMinimized()) panel.restore();
  const bounds = panel.getBounds();
  if (!screen.getAllDisplays().some(({ workArea: area }) => (
    bounds.x + 80 <= area.x + area.width && bounds.x + bounds.width - 80 >= area.x &&
    bounds.y >= area.y && bounds.y + 32 <= area.y + area.height
  ))) {
    positionPanel();
  }
  panel.show();
  panel.setAlwaysOnTop(true, 'pop-up-menu');
  panel.focus();
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
  app.on('before-quit', () => { quitting = true; });
  app.whenReady().then(() => {
    protocol.handle('mathpad', async (request) => {
      const url = new URL(request.url);
      const font = /^\/fonts\/(KaTeX_[a-zA-Z0-9_-]+\.(?:woff2?|ttf))$/.exec(url.pathname);
      const file = url.host === 'app' && (files.get(url.pathname)
        || (font && [`../../node_modules/katex/dist/fonts/${font[1]}`, font[1].endsWith('woff2') ? 'font/woff2' : font[1].endsWith('woff') ? 'font/woff' : 'font/ttf']));
      if (!file) return new Response('Not found', { status: 404 });
      return new Response(await readFile(path.join(__dirname, 'ui', file[0])), {
        headers: { 'Content-Type': `${file[1]}; charset=utf-8` },
      });
    });

    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    panel = new BrowserWindow({
      title: 'Math Pad · 函数面板',
      show: false,
      minWidth: 440,
      minHeight: 470,
      backgroundColor: '#f0f3f8',
      alwaysOnTop: true,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Math Pad', submenu: [{ label: '收起面板', click: () => panel.hide() }, { label: '退出', accelerator: 'Ctrl+Q', click: () => app.quit() }] },
      { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    ]));
    panel.webContents.on('will-navigate', (event) => event.preventDefault());
    panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    panel.on('close', (event) => {
      if (quitting) return;
      event.preventDefault();
      panel.hide();
    });
    positionPanel();
    panel.loadURL(`${origin}/`);
    revealPanel();
  });
}
