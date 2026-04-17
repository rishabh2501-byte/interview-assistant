const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, screen, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');

// Prevent Chromium's window capture feature from bypassing content protection
app.commandLine.appendSwitch('disable-features', 'WindowCaptureMacV2');

let mainWindow;
let isVisible = true;
let ollamaProcess = null;

// Start Ollama server if not already running
function startOllama() {
  exec('curl -s http://localhost:11434/api/tags', (err, stdout) => {
    if (!err && stdout) return; // already running
    console.log('Starting Ollama...');
    ollamaProcess = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
    ollamaProcess.unref();
  });
}

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
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // Set content protection BEFORE showing — prevents Zoom/screen share from capturing this window
  mainWindow.setContentProtection(true);
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    // Re-apply content protection right before showing (some macOS versions need this)
    mainWindow.setContentProtection(true);
    mainWindow.show();
  });

}

app.whenReady().then(async () => {
  startOllama();
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

  // Cmd+Enter → AI Answer
  globalShortcut.register('Command+Return', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('trigger-ai-answer');
  });

  // Cmd+Shift+Enter → Screenshot analysis
  globalShortcut.register('Command+Shift+Return', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('trigger-screenshot');
  });

  // Cmd+H → toggle visibility
  globalShortcut.register('Command+H', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (isVisible) {
      mainWindow.hide();
      isVisible = false;
    } else {
      mainWindow.show();
      isVisible = true;
    }
  });

  // Cmd+N → stop listening
  globalShortcut.register('Command+N', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('stop-listening');
  });

  // Cmd+Space → stop listening (quick toggle off)
  globalShortcut.register('Command+Space', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('stop-listening');
  });

  // Cmd+Arrow → move window
  const MOVE_STEP = 40;

  globalShortcut.register('Command+Right', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + MOVE_STEP, y);
  });

  globalShortcut.register('Command+Left', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x - MOVE_STEP, y);
  });

  globalShortcut.register('Command+Up', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x, y - MOVE_STEP);
  });

  globalShortcut.register('Command+Down', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x, y + MOVE_STEP);
  });

  // Cmd+Shift+Up/Down → scroll AI response
  globalShortcut.register('Command+Shift+Up', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('scroll-response', 'up');
  });

  globalShortcut.register('Command+Shift+Down', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('scroll-response', 'down');
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

ipcMain.on('set-opacity', (event, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(Math.min(1, Math.max(0.2, value)));
  }
});

// Check if Ollama is running and which models are available
ipcMain.handle('check-ollama', async () => {
  return new Promise((resolve) => {
    exec('curl -s http://localhost:11434/api/tags', (err, stdout) => {
      if (err || !stdout) return resolve({ running: false, models: [] });
      try {
        const data = JSON.parse(stdout);
        const models = (data.models || []).map(m => m.name);
        resolve({ running: true, models });
      } catch {
        resolve({ running: false, models: [] });
      }
    });
  });
});

// Local Whisper transcription via nodejs-whisper
ipcMain.handle('transcribe-local', async (event, audioBytes) => {
  const tmpInput = path.join(os.tmpdir(), `whisper_in_${Date.now()}.webm`);
  fs.writeFileSync(tmpInput, Buffer.from(audioBytes));
  try {
    const { nodewhisper } = require('nodejs-whisper');
    const result = await nodewhisper(tmpInput, {
      modelName: 'base',
      autoDownloadModelName: 'base',
      removeWavFileAfterTranscription: true,
      withCuda: false,
      logger: { debug: () => {}, error: console.error },
      whisperOptions: { outputInText: true, outputInJson: false, wordTimestamps: false }
    });
    fs.unlinkSync(tmpInput);
    return { success: true, text: (result || '').trim() };
  } catch (err) {
    if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
    return { success: false, error: err.message };
  }
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
