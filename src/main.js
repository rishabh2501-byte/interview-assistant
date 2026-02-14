const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, screen, systemPreferences } = require('electron');
const path = require('path');

let mainWindow;
let isVisible = true;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 400,
    height: 800,
    x: width - 400,
    y: 50,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: 300,
    minHeight: 400,
    maxWidth: 600,
    maxHeight: 900,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // CRITICAL: Make window invisible to ALL screen capture methods
  mainWindow.setContentProtection(false);
  
  // Set window level to float above everything
  mainWindow.setAlwaysOnTop(true, 'floating', 1);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });


  mainWindow.loadFile(path.join(__dirname, 'index.html'));

}

app.whenReady().then(async () => {
  // Request microphone permission on macOS
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    console.log('Microphone permission status:', micStatus);
    if (micStatus !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log('Microphone permission granted:', granted);
    }

    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    console.log('Screen recording permission status:', screenStatus);
  }

  createWindow();
  
  // Open DevTools for debugging
  mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Ctrl+Enter for AI Answer
  globalShortcut.register('Control+Return', () => {
    mainWindow.webContents.send('trigger-ai-answer');
  });

  // Ctrl+Shift+S for screenshot analysis
  globalShortcut.register('Control+Shift+S', () => {
    mainWindow.webContents.send('trigger-screenshot');
  });

  // Ctrl+H to toggle visibility
  globalShortcut.register('Control+H', () => {
    if (isVisible) {
      mainWindow.hide();
      isVisible = false;
    } else {
      mainWindow.show();
      isVisible = true;
    }
  });

  // Cmd+D (Mac) / Ctrl+D (Win) to hide/show entire window
  globalShortcut.register('CommandOrControl+D', () => {
    if (isVisible) {
      mainWindow.hide();
      isVisible = false;
    } else {
      mainWindow.show();
      isVisible = true;
    }
  });

  // Cmd+N (Mac) / Ctrl+N (Win) to stop listening
  globalShortcut.register('CommandOrControl+N', () => {
    mainWindow.webContents.send('stop-listening');
  });

  // Ctrl+Shift+Arrow keys to move window
  const MOVE_STEP = 30;
  
  globalShortcut.register('Control+Shift+Right', () => {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + MOVE_STEP, y);
  });
  
  globalShortcut.register('Control+Shift+Left', () => {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x - MOVE_STEP, y);
  });
  
  globalShortcut.register('Control+Shift+Up', () => {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x, y - MOVE_STEP);
  });
  
  globalShortcut.register('Control+Shift+Down', () => {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x, y + MOVE_STEP);
  });

  // Auto-start listening when app loads (with delay to ensure permissions)
  setTimeout(() => {
    mainWindow.webContents.send('auto-start-capture');
  }, 2000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 0, height: 0 }
  });
  return sources;
});

ipcMain.on('minimize-window', () => {
  mainWindow.hide();
  isVisible = false;
});

ipcMain.on('close-window', () => {
  app.quit();
});

ipcMain.on('move-window', (event, { x, y }) => {
  const [currentX, currentY] = mainWindow.getPosition();
  mainWindow.setPosition(currentX + x, currentY + y);
});
