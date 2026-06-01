import path from 'path';
import { app, BrowserWindow, protocol } from 'electron';
import { createHandler } from 'next-electron-rsc';

let mainWindow: BrowserWindow | null;

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

const appPath = app.getAppPath();
const dev = !app.isPackaged;
const dir = dev
  ? appPath
  : path.join(appPath, '.next', 'standalone', 'nfc-login');

const { createInterceptor, localhostUrl } = createHandler({
  dev,
  dir,
  protocol,
  debug: true,
});

let stopIntercept: (() => void) | undefined;

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      devTools: true,
    },
  });

  stopIntercept = await createInterceptor({ session: mainWindow.webContents.session });

  mainWindow.once('ready-to-show', () => mainWindow?.webContents.openDevTools());

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopIntercept?.();
  });

  await app.whenReady();

  await mainWindow.loadURL(localhostUrl + '/');

  console.log('[APP] Loaded', localhostUrl);
};

app.on('ready', createWindow);

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && !mainWindow) createWindow();
});
