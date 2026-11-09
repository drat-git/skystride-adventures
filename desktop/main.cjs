const { app, BrowserWindow, Menu, protocol, session, shell } = require('electron');
const { readFile } = require('node:fs/promises');
const { resolve, relative, isAbsolute, extname } = require('node:path');
const config = require('./config.json');

app.setName('SkyStride Adventures');
// Used by automated acceptance to keep its sessions separate from the user's app.
if (process.env.SKYSTRIDE_USER_DATA_DIR) app.setPath('userData', resolve(process.env.SKYSTRIDE_USER_DATA_DIR));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true,
} }]);
const origin = 'app://skystride';
const webRoot = resolve(__dirname, 'game');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const csp = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  `connect-src 'self' ${config.supabaseUrl} ${config.supabaseUrl.replace('https:', 'wss:')}`,
  "media-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "frame-src 'none'"].join('; ');
const trusted = url => { try { const u = new URL(url); return u.protocol === 'app:' && u.host === 'skystride' && !u.username && !u.password; } catch { return false; } };
function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 960, minHeight: 650,
    title: 'SkyStride Adventures', backgroundColor: '#17233d', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false },
  });
  win.webContents.on('will-navigate', (event, url) => { if (!trusted(url)) event.preventDefault(); });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { const u = new URL(url); if (u.protocol === 'https:' && ['github.com', 'kenney.nl'].includes(u.hostname)) void shell.openExternal(u.href); } catch {}
    return { action: 'deny' };
  });
  win.once('ready-to-show', () => win.show());
  void win.loadURL(origin + '/');
}
app.whenReady().then(() => {
  protocol.handle('app', async request => {
    if (!trusted(request.url)) return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    try {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const file = resolve(webRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
      const path = relative(webRoot, file);
      if (!path || path.startsWith('..') || isAbsolute(path)) return new Response('Not found', { status: 404 });
      const data = await readFile(file);
      return new Response(request.method === 'HEAD' ? null : data, { headers: {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache',
      } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'fullscreen'));
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => permission === 'fullscreen');
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ]));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
