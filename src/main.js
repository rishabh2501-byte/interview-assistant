const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, screen, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');

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
    hasShadow: false,
    type: 'panel',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // CRITICAL: Make window invisible to ALL screen capture methods
  mainWindow.setContentProtection(true);
  
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
  
  // Open DevTools for debugging (uncomment if needed)
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Ctrl+Enter for AI Answer
  globalShortcut.register('Control+Return', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('trigger-ai-answer');
  });

  // Ctrl+Shift+S for screenshot analysis
  globalShortcut.register('Control+Shift+S', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('trigger-screenshot');
  });

  // Ctrl+H to toggle visibility
  globalShortcut.register('Control+H', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
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
    if (!mainWindow || mainWindow.isDestroyed()) return;
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
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('stop-listening');
  });

  // Ctrl+Shift+Arrow keys to move window
  const MOVE_STEP = 30;
  
  globalShortcut.register('Control+Shift+Right', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + MOVE_STEP, y);
  });
  
  globalShortcut.register('Control+Shift+Left', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x - MOVE_STEP, y);
  });
  
  globalShortcut.register('Control+Shift+Up', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x, y - MOVE_STEP);
  });
  
  globalShortcut.register('Control+Shift+Down', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x, y + MOVE_STEP);
  });

  // Auto-start listening when app loads (with delay to ensure permissions)
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
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

ipcMain.on('resize-window', (event, { width, height, x, y }) => {
  if (width && height) {
    mainWindow.setSize(Math.max(300, width), Math.max(400, height));
  }
  if (x !== undefined && y !== undefined) {
    mainWindow.setPosition(x, y);
  }
});

ipcMain.handle('get-window-bounds', () => {
  return mainWindow.getBounds();
});

// PDF parsing handler - uses pdfjs-dist
ipcMain.handle('parse-pdf', async (event, buffer) => {
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    const uint8Array = new Uint8Array(buffer);
    const doc = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    
    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    return { success: true, text: fullText };
  } catch (error) {
    console.error('PDF parse error:', error);
    return { success: false, error: error.message };
  }
});
