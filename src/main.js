const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, screen, systemPreferences, shell } = require('electron');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');
const appConfig = require('./config');

// Prevent Chromium's window capture feature from bypassing content protection
app.commandLine.appendSwitch('disable-features', 'WindowCaptureMacV2');

// Register custom protocol for deep linking (interviewai://callback?token=...)
app.setAsDefaultProtocolClient('interviewai');

let mainWindow;
let isVisible = true;
let ollamaProcess = null;
let authCheckDone = false;
let callbackServer = null;
let callbackPort = null;

// ─── Auth helpers ──────────────────────────────────────────────────────────
function getAuthFilePath() {
  return path.join(app.getPath('userData'), 'auth.json');
}
function loadStoredAuth() {
  try { return JSON.parse(fs.readFileSync(getAuthFilePath(), 'utf8')); } catch { return null; }
}
function saveStoredAuth(data) {
  try { fs.writeFileSync(getAuthFilePath(), JSON.stringify(data)); } catch {}
}
function clearStoredAuth() {
  try { fs.unlinkSync(getAuthFilePath()); } catch {}
}

function apiGet(apiPath, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: appConfig.backendHost,
      port: appConfig.backendPort,
      path: apiPath,
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    };
    const transport = appConfig.backendProtocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function checkAuthAndSubscription(token) {
  try {
    const meRes = await apiGet('/api/auth/me', token);
    if (meRes.status !== 200) return { valid: false };
    const subRes = await apiGet('/api/subscriptions/me', token);
    const activeSub = subRes.body?.active_subscription;
    return { valid: true, user: meRes.body.user, hasSubscription: !!activeSub, subscription: activeSub };
  } catch (err) {
    return { valid: false, error: 'server_unreachable' };
  }
}

function detectFrontendPort() {
  return new Promise((resolve) => {
    let found = false;
    const ports = appConfig.devFrontendPorts;
    let checked = 0;
    ports.forEach((port) => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        if (!found) { found = true; resolve(port); }
      });
      req.on('error', () => { checked++; if (checked === ports.length && !found) resolve(ports[0]); });
      req.setTimeout(600, () => { req.destroy(); checked++; if (checked === ports.length && !found) resolve(ports[0]); });
    });
  });
}

function startCallbackServer() {
  return new Promise((resolve) => {
    if (callbackServer && callbackPort) return resolve(callbackPort);

    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      const urlObj = new URL(req.url, 'http://localhost');

      if (urlObj.pathname === '/auth-callback') {
        const token = urlObj.searchParams.get('token');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        if (token && mainWindow && !mainWindow.isDestroyed()) {
          // Close the child login window
          closeChildWindow();
          // Bring main window to front
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          app.focus({ steal: true });
          // Directly validate in main process — no renderer round-trip needed
          mainWindow.webContents.send('auth-state', { status: 'loading' });
          checkAuthAndSubscription(token).then((result) => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (!result.valid) {
              console.error('[Auth] Token invalid after callback:', result.error);
              mainWindow.webContents.send('auth-state', { status: 'unauthenticated' });
              return;
            }
            saveStoredAuth({ token });
            if (!result.hasSubscription) {
              mainWindow.webContents.send('auth-state', { status: 'no_subscription', user: result.user });
            } else {
              mainWindow.webContents.send('auth-state', { status: 'authenticated', user: result.user, subscription: result.subscription });
              setTimeout(() => {
                if (!mainWindow || mainWindow.isDestroyed()) return;
                mainWindow.webContents.send('auto-start-capture');
              }, 1500);
            }
          });
        }
      } else if (urlObj.pathname === '/subscription-updated') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        closeChildWindow();
        const stored = loadStoredAuth();
        if (stored?.token && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth-state', { status: 'loading' });
          checkAuthAndSubscription(stored.token).then((result) => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (result.valid && result.hasSubscription) {
              mainWindow.webContents.send('auth-state', { status: 'authenticated', user: result.user, subscription: result.subscription });
              setTimeout(() => { if (!mainWindow || mainWindow.isDestroyed()) return; mainWindow.webContents.send('auto-start-capture'); }, 1500);
            } else if (result.valid) {
              mainWindow.webContents.send('auth-state', { status: 'no_subscription', user: result.user });
            }
          });
        }
      } else {
        res.writeHead(404); res.end();
      }
    });

    const tryListen = (port) => {
      server.listen(port, '0.0.0.0', () => {
        callbackServer = server;
        callbackPort = server.address().port;
        console.log(`[Auth] Callback server on port ${callbackPort}`);
        resolve(callbackPort);
      });
    };
    server.on('error', () => tryListen(0));
    tryListen(appConfig.internalCallbackPort);
  });
}
// ──────────────────────────────────────────────────────────────────────────

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
  startCallbackServer().catch(console.error);
  
  // Open DevTools for debugging (uncomment if needed)
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  // ── Auth check after page loads ──────────────────────────────────────────
  mainWindow.webContents.on('did-finish-load', async () => {
    if (authCheckDone) return;
    authCheckDone = true;

    mainWindow.webContents.send('auth-state', { status: 'loading' });

    const stored = loadStoredAuth();
    if (!stored?.token) {
      mainWindow.webContents.send('auth-state', { status: 'unauthenticated' });
      return;
    }

    const result = await checkAuthAndSubscription(stored.token);
    if (!result.valid) {
      if (result.error === 'server_unreachable') {
        mainWindow.webContents.send('auth-state', { status: 'server_error' });
      } else {
        clearStoredAuth();
        mainWindow.webContents.send('auth-state', { status: 'unauthenticated' });
      }
      return;
    }

    saveStoredAuth({ token: stored.token });
    if (!result.hasSubscription) {
      mainWindow.webContents.send('auth-state', { status: 'no_subscription', user: result.user });
    } else {
      mainWindow.webContents.send('auth-state', { status: 'authenticated', user: result.user, subscription: result.subscription });
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('auto-start-capture');
      }, 1500);
    }
  });

  // (deep link handler removed — using local HTTP callback server instead)
  // ─────────────────────────────────────────────────────────────────────────

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

  // auto-start-capture is sent after successful auth validation
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

// Returns the desktopCapturer source for the currently focused non-assistant window.
// Used by the screenshot shortcut (Cmd+Shift+Enter) to capture only the window with
// the interview question instead of the full cluttered screen.
// Returns null when our own app is frontmost (button-click case) so the caller
// falls back to full-screen capture.
ipcMain.handle('get-focused-window-source', async () => {
  if (process.platform !== 'darwin') return null;
  return new Promise(resolve => {
    exec(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      async (err, stdout) => {
        if (err || !stdout.trim()) return resolve(null);
        const appName = stdout.trim().toLowerCase();
        if (appName.includes('electron') || appName.includes('interview')) return resolve(null);
        const sources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 0, height: 0 }
        });
        const match = sources.find(s =>
          appName.split(' ').some(word => word.length > 2 && s.name.toLowerCase().includes(word))
        );
        resolve(match ? { id: match.id, name: match.name } : null);
      }
    );
  });
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

// Auto-fit the window vertically when the AI answer overflows the current
// viewport. Grows downward only, capped at 95% of the display's work area.
// Called (throttled) by the renderer during streaming and once on completion.
ipcMain.on('auto-fit-window', (event, { extra }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!Number.isFinite(extra) || extra <= 0) return;
  const [w, h] = mainWindow.getSize();
  const [x, y] = mainWindow.getPosition();
  const workArea = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
  const maxHeight = Math.floor(workArea.height * 0.95);
  const target = Math.min(maxHeight, h + Math.ceil(extra) + 8);
  console.log('[auto-fit-window]', { extra, currentH: h, target, maxHeight, winY: y });
  if (target <= h) { console.log('[auto-fit-window] no growth needed'); return; }
  // Keep the window on-screen: if growing downward would push it past the
  // work area, pull the top up instead of moving the bottom down.
  let newY = y;
  if (y + target > workArea.y + workArea.height) {
    newY = Math.max(workArea.y, workArea.y + workArea.height - target);
  }
  mainWindow.setBounds({ x, y: newY, width: w, height: target }, false);
  console.log('[auto-fit-window] resized to', target, 'at y=', newY);
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

// ── Auth IPC handlers ────────────────────────────────────────────────────
let childWindow = null;

function openChildWindow(url, title = 'Interview Assistant') {
  if (childWindow && !childWindow.isDestroyed()) {
    childWindow.focus();
    childWindow.loadURL(url);
    return;
  }
  childWindow = new BrowserWindow({
    width: 480,
    height: 700,
    parent: mainWindow,
    modal: false,
    title,
    resizable: false,
    minimizable: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  childWindow.setMenuBarVisibility(false);
  childWindow.loadURL(url);
  childWindow.on('closed', () => { childWindow = null; });
}

function closeChildWindow() {
  if (childWindow && !childWindow.isDestroyed()) {
    childWindow.close();
    childWindow = null;
  }
}

ipcMain.on('open-web-login', async () => {
  const [cbPort, fePort] = await Promise.all([startCallbackServer(), detectFrontendPort()]);
  openChildWindow(`http://localhost:${fePort}/signup?electron_port=${cbPort}`, 'Sign Up — Interview Assistant');
});

ipcMain.on('open-web-plans', async () => {
  const [cbPort, fePort] = await Promise.all([startCallbackServer(), detectFrontendPort()]);
  openChildWindow(`http://localhost:${fePort}/plans?electron_port=${cbPort}`, 'Plans — Interview Assistant');
});

ipcMain.on('electron-logout', () => {
  clearStoredAuth();
  authCheckDone = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auth-state', { status: 'unauthenticated' });
  }
});

ipcMain.handle('get-auth-token', () => {
  const stored = loadStoredAuth();
  return stored?.token || null;
});

ipcMain.on('recheck-subscription', async () => {
  const stored = loadStoredAuth();
  if (!stored?.token) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('auth-state', { status: 'unauthenticated' });
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('auth-state', { status: 'loading' });
  const result = await checkAuthAndSubscription(stored.token);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!result.valid) {
    mainWindow.webContents.send('auth-state', { status: 'unauthenticated' });
    return;
  }
  if (!result.hasSubscription) {
    mainWindow.webContents.send('auth-state', { status: 'no_subscription', user: result.user });
  } else {
    mainWindow.webContents.send('auth-state', { status: 'authenticated', user: result.user, subscription: result.subscription });
    setTimeout(() => { if (!mainWindow || mainWindow.isDestroyed()) return; mainWindow.webContents.send('auto-start-capture'); }, 1500);
  }
});

ipcMain.on('check-auth-after-callback', async (event, { token }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auth-state', { status: 'loading' });
  }
  const result = await checkAuthAndSubscription(token);
  if (!result.valid) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-state', { status: 'unauthenticated' });
    }
    return;
  }
  saveStoredAuth({ token });
  if (!result.hasSubscription) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-state', { status: 'no_subscription', user: result.user });
    }
  } else {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-state', { status: 'authenticated', user: result.user, subscription: result.subscription });
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('auto-start-capture');
      }, 1500);
    }
  }
});
// ─────────────────────────────────────────────────────────────────────────

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
