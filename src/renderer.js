const { ipcRenderer } = require('electron');

// State
let isCapturing = false;
let audioStream = null;
let transcriptionText = '';
let pdfContext = localStorage.getItem('pdf_context') || '';

// Conversation history for follow-up questions
let conversationHistory = [];

// Rolling transcription context — last 5 things sent to AI (so AI knows interview flow)
let transcriptionHistory = [];

// Rolling summary of older conversation exchanges (compressed memory).
// Updated whenever conversationHistory grows past SUMMARY_KEEP_EXCHANGES.
let conversationSummary = '';

// Transcript-summarisation guards
const TRANSCRIPT_WORD_THRESHOLD = 200;      // trigger summary above this
const TRANSCRIPT_KEEP_TAIL_WORDS = 30;      // always keep last N words verbatim
const SUMMARY_KEEP_EXCHANGES = 3;           // keep last N full Q/A pairs verbatim
const SUMMARY_TRIGGER_EXCHANGES = 6;        // start summarising when history exceeds this
let isSummarisingTranscript = false;
let isSummarisingHistory = false;

// Response display history (back/forward navigation)
let responseHistory = [];
let responseHistoryIndex = -1;

// API Keys
// NOTE: All AI features (answer, screenshot, transcription) now use OpenAI exclusively.
// Groq / Ollama paths are kept in code but disabled — OpenAI key is baked in below.
const BUILTIN_OPENAI_KEY = 'process.env.OPENAI_API_KEY || localStorage.getItem('openai_api_key') || ''';
let groqApiKey = ''; // disabled — using OpenAI only
let apiKey = BUILTIN_OPENAI_KEY;
let ollamaEnabled = false; // disabled — using OpenAI only
let ollamaUrl = localStorage.getItem('ollama_url') || 'http://localhost:11434/v1';
let ollamaChatModel = localStorage.getItem('ollama_chat_model') || 'mistral';
let ollamaVisionModel = localStorage.getItem('ollama_vision_model') || 'llava';
let useLocalWhisper = false; // disabled — using OpenAI Whisper

// API Configuration
const GROQ_API_URL = 'https://api.groq.com/openai/v1';
const OPENAI_API_URL = 'https://api.openai.com/v1';

// ─── Auth State Management ─────────────────────────────────────────────────
const overlayControls = document.getElementById('overlay-controls');
// loading-overlay is visible by default via CSS — show controls immediately
if (overlayControls) overlayControls.style.display = 'flex';

function showOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
  if (overlayControls) overlayControls.style.display = 'flex';
}
function hideOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
function hideAllOverlays() {
  ['loading-overlay', 'auth-overlay', 'paywall-overlay', 'server-error-overlay'].forEach(hideOverlay);
  if (overlayControls) overlayControls.style.display = 'none';
}

ipcRenderer.on('auth-state', (event, state) => {
  hideAllOverlays();
  const logoutBtn = document.getElementById('header-logout-btn');
  if (state.status === 'loading') {
    showOverlay('loading-overlay');
    if (logoutBtn) logoutBtn.style.display = 'none';
  } else if (state.status === 'authenticated') {
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
  } else if (state.status === 'no_subscription') {
    const el = document.getElementById('paywall-username');
    if (el) el.textContent = state.user?.username || 'there';
    showOverlay('paywall-overlay');
    if (logoutBtn) logoutBtn.style.display = 'none';
  } else if (state.status === 'unauthenticated') {
    showOverlay('auth-overlay');
    if (logoutBtn) logoutBtn.style.display = 'none';
  } else if (state.status === 'server_error') {
    showOverlay('server-error-overlay');
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
});

ipcRenderer.on('auth-callback', (event, { token }) => {
  ipcRenderer.send('check-auth-after-callback', { token });
});

const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');

async function doLogin() {
  const email = loginEmailInput?.value?.trim();
  const password = loginPasswordInput?.value;
  if (!email || !password) {
    if (loginError) loginError.textContent = 'Please enter email and password.';
    return;
  }
  if (loginError) loginError.textContent = '';
  if (loginSubmitBtn) { loginSubmitBtn.disabled = true; loginSubmitBtn.textContent = 'Signing in…'; }
  try {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    ipcRenderer.send('check-auth-after-callback', { token: data.token });
  } catch (err) {
    if (loginError) loginError.textContent = err.message;
  } finally {
    if (loginSubmitBtn) { loginSubmitBtn.disabled = false; loginSubmitBtn.textContent = 'Sign In'; }
  }
}

loginSubmitBtn?.addEventListener('click', doLogin);

// Allow Enter key to submit
loginPasswordInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
loginEmailInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginPasswordInput?.focus(); });

document.getElementById('login-signup-btn')?.addEventListener('click', () => {
  ipcRenderer.send('open-web-login');
});

document.getElementById('buy-plan-btn')?.addEventListener('click', () => {
  ipcRenderer.send('open-web-plans');
});

document.getElementById('logout-btn-paywall')?.addEventListener('click', () => {
  ipcRenderer.send('electron-logout');
});

document.getElementById('logout-btn-server')?.addEventListener('click', () => {
  ipcRenderer.send('electron-logout');
});

document.getElementById('retry-btn')?.addEventListener('click', () => {
  showOverlay('loading-overlay');
  hideOverlay('server-error-overlay');
  ipcRenderer.invoke('get-auth-token').then((token) => {
    if (token) {
      ipcRenderer.send('check-auth-after-callback', { token });
    } else {
      ipcRenderer.send('electron-logout');
    }
  });
});

document.getElementById('overlay-minimize-btn')?.addEventListener('click', () => {
  ipcRenderer.send('minimize-window');
});

document.getElementById('overlay-close-btn')?.addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

document.getElementById('refresh-sub-btn')?.addEventListener('click', () => {
  ipcRenderer.send('recheck-subscription');
});

document.getElementById('header-logout-btn')?.addEventListener('click', () => {
  if (confirm('Logout from Interview Assistant?')) {
    ipcRenderer.send('electron-logout');
  }
});
// ──────────────────────────────────────────────────────────────────────────

// DOM Elements
const aiAnswerBtn = document.getElementById('ai-answer-btn');
const screenshotBtn = document.getElementById('screenshot-btn');
const captureBtn = document.getElementById('capture-btn');
const minimizeBtn = document.getElementById('minimize-btn');
const closeBtn = document.getElementById('close-btn');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key');
const transcriptionBox = document.getElementById('transcription-box');
const responseBox = document.getElementById('response-box');
const clearTranscriptBtn = document.getElementById('clear-transcript');
const copyResponseBtn = document.getElementById('copy-response');
const listeningIndicator = document.getElementById('listening-indicator');
const statusIndicator = document.getElementById('status-indicator');

// Groq API key input element
const groqKeyInput = document.getElementById('groq-key-input');

// Ollama input elements
const ollamaEnabledCheckbox = document.getElementById('ollama-enabled');
const ollamaUrlInput = document.getElementById('ollama-url-input');
const ollamaChatModelInput = document.getElementById('ollama-chat-model-input');
const ollamaVisionModelInput = document.getElementById('ollama-vision-model-input');

// User context/resume
const userContextInput = document.getElementById('user-context');
const saveContextBtn = document.getElementById('save-context');
let userContext = localStorage.getItem('user_context') || '';

// Language selector
const languageSelect = document.getElementById('language-select');
let selectedLanguage = localStorage.getItem('selected_language') || 'en';

// Role selector
const roleSelect = document.getElementById('role-select');
let selectedRole = localStorage.getItem('selected_role') || 'general';

const ROLE_DATA = {
  general: {
    title: 'IT Professional',
    stack: 'General software engineering, algorithms, data structures, system design, OOP, REST APIs, Git, Agile/Scrum, problem-solving.'
  },
  frontend: {
    title: 'Frontend Developer',
    stack: 'React, Vue, Angular, TypeScript, JavaScript (ES6+), HTML5, CSS3, Tailwind CSS, Redux/Zustand, Next.js, Vite, Webpack, Jest, Cypress, Figma, responsive design, accessibility (WCAG), Web Performance, PWA, REST APIs.'
  },
  backend: {
    title: 'Backend Developer',
    stack: 'Node.js, Python, Java, Go, Spring Boot, Express, FastAPI, Django, REST APIs, GraphQL, gRPC, PostgreSQL, MySQL, MongoDB, Redis, RabbitMQ/Kafka, Docker, microservices, authentication (JWT, OAuth2), caching strategies, SOLID principles.'
  },
  fullstack: {
    title: 'Full Stack Developer',
    stack: 'React/Next.js, Node.js/Express, TypeScript, PostgreSQL/MongoDB, REST APIs, GraphQL, Docker, CI/CD, Redis, Tailwind CSS, Git, AWS basics, JWT authentication, microservices, deployment strategies.'
  },
  mobile: {
    title: 'Mobile Developer',
    stack: 'React Native, Flutter, Swift (iOS), Kotlin (Android), Xcode, Android Studio, App Store/Play Store deployment, push notifications, offline-first design, mobile performance, navigation patterns, native modules, Firebase.'
  },
  devops: {
    title: 'DevOps Engineer',
    stack: 'Docker, Kubernetes (K8s), Helm, CI/CD (GitHub Actions, Jenkins, GitLab CI), Terraform, Ansible, AWS/GCP/Azure, Linux, Bash scripting, Prometheus, Grafana, ELK Stack, Nginx, load balancing, blue-green/canary deployments, Infrastructure as Code, secrets management (Vault).'
  },
  cloud: {
    title: 'Cloud Engineer / Architect',
    stack: 'AWS (EC2, S3, Lambda, RDS, EKS, CloudFormation, IAM), GCP (GKE, BigQuery, Cloud Run), Azure, Terraform, serverless architecture, microservices, CDN, VPC/networking, cost optimization, multi-cloud strategy, cloud security, SLAs.'
  },
  sre: {
    title: 'SRE / Platform Engineer',
    stack: 'SLOs/SLIs/SLAs, error budgets, incident management, chaos engineering (Chaos Monkey), Prometheus, Grafana, PagerDuty, distributed tracing (Jaeger/Zipkin), Kubernetes, capacity planning, post-mortems, observability, toil reduction, on-call best practices.'
  },
  data_engineer: {
    title: 'Data Engineer',
    stack: 'Python, Apache Spark, Apache Kafka, Apache Airflow, dbt, Snowflake, Databricks, AWS Glue/Redshift, BigQuery, ETL/ELT pipelines, SQL, data modeling (star/snowflake schema), data lakes, Parquet/Avro, streaming vs batch processing, data quality, orchestration.'
  },
  data_scientist: {
    title: 'Data Scientist / ML Engineer',
    stack: 'Python, TensorFlow, PyTorch, scikit-learn, pandas, NumPy, Jupyter, MLflow, feature engineering, model evaluation, A/B testing, SQL, data visualization (Matplotlib, Seaborn, Plotly), NLP, computer vision, MLOps, model deployment (FastAPI, Docker), Hugging Face, LLMs.'
  },
  qa: {
    title: 'QA / SDET',
    stack: 'Selenium, Cypress, Playwright, JUnit, TestNG, pytest, API testing (Postman, REST Assured), performance testing (JMeter, k6), BDD (Cucumber), CI integration, test planning, regression testing, mobile testing (Appium), test automation frameworks, bug tracking (Jira).'
  },
  security: {
    title: 'Security Engineer',
    stack: 'OWASP Top 10, penetration testing, vulnerability assessment, SIEM (Splunk, ELK), network security, cryptography, zero-trust architecture, IAM, AWS/cloud security, compliance (SOC 2, ISO 27001), secure SDLC, threat modeling, incident response, Burp Suite, Nmap.'
  },
  system_design: {
    title: 'System Design / Solutions Architect',
    stack: 'Distributed systems, CAP theorem, consistency models, load balancing, horizontal vs vertical scaling, caching (Redis, CDN), message queues (Kafka, RabbitMQ, SQS), database sharding, replication, microservices vs monolith, API gateway, rate limiting, idempotency, event-driven architecture, real-time systems.'
  },
  dba: {
    title: 'Database Administrator',
    stack: 'PostgreSQL, MySQL, Oracle, MongoDB, Redis, Cassandra, query optimization, indexing strategies, execution plans, replication, sharding, backup/recovery, ACID transactions, connection pooling, database migrations, performance tuning, stored procedures, partitioning.'
  },
  embedded: {
    title: 'Embedded / Systems Engineer',
    stack: 'C, C++, RTOS (FreeRTOS, Zephyr), Linux kernel, device drivers, memory management, pointers, bit manipulation, UART/SPI/I2C protocols, ARM architecture, debugging (JTAG, GDB), real-time constraints, bootloaders, hardware-software integration, CMake, cross-compilation.'
  }
};

if (roleSelect) {
  roleSelect.value = selectedRole;
  roleSelect.addEventListener('change', () => {
    selectedRole = roleSelect.value;
    localStorage.setItem('selected_role', selectedRole);
  });
}

// Initialize
if (apiKey) {
  apiKeyInput.value = apiKey;
}
if (groqApiKey) {
  groqKeyInput.value = groqApiKey;
}
if (userContext) {
  userContextInput.value = userContext;
}
if (ollamaEnabledCheckbox) {
  ollamaEnabledCheckbox.checked = ollamaEnabled;
}
const localWhisperCheckbox = document.getElementById('local-whisper-enabled');
if (localWhisperCheckbox) {
  localWhisperCheckbox.checked = useLocalWhisper;
}
if (ollamaUrlInput) {
  ollamaUrlInput.value = ollamaUrl;
}
if (ollamaChatModelInput) {
  ollamaChatModelInput.value = ollamaChatModel;
}
if (ollamaVisionModelInput) {
  ollamaVisionModelInput.value = ollamaVisionModel;
}
if (languageSelect) {
  languageSelect.value = selectedLanguage;
  languageSelect.addEventListener('change', () => {
    selectedLanguage = languageSelect.value;
    localStorage.setItem('selected_language', selectedLanguage);
    console.log('Language set to:', selectedLanguage);
  });
}

// Opacity slider
const opacitySlider = document.getElementById('opacity-slider');
const opacityValue = document.getElementById('opacity-value');
const savedOpacity = localStorage.getItem('window_opacity') || '100';
opacitySlider.value = savedOpacity;
opacityValue.textContent = savedOpacity + '%';
ipcRenderer.send('set-opacity', parseInt(savedOpacity) / 100);

opacitySlider.addEventListener('input', () => {
  const val = opacitySlider.value;
  opacityValue.textContent = val + '%';
  ipcRenderer.send('set-opacity', parseInt(val) / 100);
  localStorage.setItem('window_opacity', val);
});

console.log('Interview Assistant initialized');
console.log('API Key set:', apiKey ? 'Yes' : 'No');
console.log('Groq Key set:', groqApiKey ? 'Yes' : 'No (get free key from console.groq.com)');
console.log('User context set:', userContext ? 'Yes (' + userContext.length + ' chars)' : 'No');

// ── Collapsible sections ──
// Persists open/closed state in localStorage per section
document.querySelectorAll('.section-header.collapsible').forEach(header => {
  const targetId = header.dataset.target;
  const body = document.getElementById(targetId);
  if (!body) return;

  // Restore saved state
  const saved = localStorage.getItem('section_' + targetId);
  if (saved === 'collapsed') {
    body.classList.add('collapsed');
    header.classList.add('collapsed');
  } else if (saved === 'open') {
    body.classList.remove('collapsed');
    header.classList.remove('collapsed');
  }

  header.addEventListener('click', e => {
    // Don't collapse when clicking buttons/labels inside the header
    if (e.target.closest('button') || e.target.closest('label') || e.target.closest('input')) return;

    const isNowCollapsed = body.classList.toggle('collapsed');
    header.classList.toggle('collapsed', isNowCollapsed);
    localStorage.setItem('section_' + targetId, isNowCollapsed ? 'collapsed' : 'open');
  });
});

// Auto-scroll main area to response box when new content is set
function scrollToResponse() {
  const mainScroll = document.getElementById('main-scroll');
  const responseSection = document.getElementById('section-response');
  if (mainScroll && responseSection) {
    mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Auto-detect Ollama on startup and enable it if running
async function autoDetectOllama() {
  try {
    const result = await ipcRenderer.invoke('check-ollama');
    if (!result.running) return;

    // Pick best available chat model
    const preferred = ['mistral', 'llama3.2', 'llama3', 'llama2', 'phi3', 'gemma'];
    const bestChat = preferred.find(m => result.models.some(n => n.startsWith(m)))
      || result.models.find(m => !m.includes('llava') && !m.includes('vision'));

    const bestVision = result.models.find(m => m.includes('llava') || m.includes('vision'))
      || ollamaVisionModel;

    if (bestChat) {
      ollamaEnabled = true;
      ollamaChatModel = bestChat.split(':')[0]; // strip tag like :latest
      if (bestVision) ollamaVisionModel = bestVision.split(':')[0];

      localStorage.setItem('ollama_enabled', 'true');
      localStorage.setItem('ollama_chat_model', ollamaChatModel);
      localStorage.setItem('ollama_vision_model', ollamaVisionModel);

      if (ollamaEnabledCheckbox) ollamaEnabledCheckbox.checked = true;
      if (ollamaChatModelInput) ollamaChatModelInput.value = ollamaChatModel;
      if (ollamaVisionModelInput) ollamaVisionModelInput.value = ollamaVisionModel;

      showStatus(`Ollama ready — ${ollamaChatModel}`, 'success');
      console.log('Auto-enabled Ollama:', ollamaChatModel, '| Vision:', ollamaVisionModel);
    }
  } catch (e) {
    console.log('Ollama not detected:', e.message);
  }
}
autoDetectOllama();

// Save context button
saveContextBtn.addEventListener('click', () => {
  userContext = userContextInput.value.trim();
  localStorage.setItem('user_context', userContext);
  showStatus('Context saved!', 'success');
  console.log('User context saved:', userContext.length, 'chars');
});

// PDF Upload handling
const pdfUpload = document.getElementById('pdf-upload');
const pdfStatus = document.getElementById('pdf-status');

// Show PDF status if already loaded
if (pdfContext) {
  pdfStatus.textContent = '✓ PDF loaded (' + pdfContext.length + ' chars)';
  pdfStatus.classList.add('active');
}

pdfUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    pdfStatus.textContent = '✗ Please select a PDF file';
    pdfStatus.classList.add('active', 'error');
    return;
  }
  
  pdfStatus.textContent = 'Processing PDF...';
  pdfStatus.classList.add('active');
  pdfStatus.classList.remove('error');
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const result = await ipcRenderer.invoke('parse-pdf', Array.from(uint8Array));
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    pdfContext = result.text.trim();
    localStorage.setItem('pdf_context', pdfContext);
    
    pdfStatus.textContent = '✓ PDF loaded: ' + file.name + ' (' + pdfContext.length + ' chars)';
    showStatus('PDF loaded!', 'success');
    console.log('PDF context loaded:', pdfContext.length, 'chars');
    
    // Optionally append to user context textarea
    if (userContextInput.value.trim() === '') {
      userContextInput.value = pdfContext.substring(0, 5000); // First 5000 chars as preview
    }
  } catch (error) {
    console.error('PDF parsing error:', error);
    pdfStatus.textContent = '✗ Error reading PDF: ' + error.message;
    pdfStatus.classList.add('error');
    showStatus('PDF error', 'error');
  }
});

// Window Controls
minimizeBtn.addEventListener('click', () => {
  ipcRenderer.send('minimize-window');
});

closeBtn.addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

// Settings Toggle
settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.toggle('active');
});

// Save API Keys
saveApiKeyBtn.addEventListener('click', () => {
  apiKey = apiKeyInput.value.trim();
  groqApiKey = groqKeyInput.value.trim();
  ollamaEnabled = ollamaEnabledCheckbox ? ollamaEnabledCheckbox.checked : false;
  ollamaUrl = (ollamaUrlInput ? ollamaUrlInput.value.trim() : '') || 'http://localhost:11434/v1';
  ollamaChatModel = (ollamaChatModelInput ? ollamaChatModelInput.value.trim() : '') || 'mistral';
  ollamaVisionModel = (ollamaVisionModelInput ? ollamaVisionModelInput.value.trim() : '') || 'llava';
  useLocalWhisper = localWhisperCheckbox ? localWhisperCheckbox.checked : false;
  localStorage.setItem('openai_api_key', apiKey);
  localStorage.setItem('groq_api_key', groqApiKey);
  localStorage.setItem('ollama_enabled', ollamaEnabled);
  localStorage.setItem('ollama_url', ollamaUrl);
  localStorage.setItem('ollama_chat_model', ollamaChatModel);
  localStorage.setItem('ollama_vision_model', ollamaVisionModel);
  localStorage.setItem('use_local_whisper', useLocalWhisper);
  showStatus('Settings saved!', 'success');
  settingsPanel.classList.remove('active');
  console.log('API Key saved:', apiKey ? 'Yes' : 'No');
  console.log('Groq Key saved:', groqApiKey ? 'Yes' : 'No');
  console.log('Ollama enabled:', ollamaEnabled, '| URL:', ollamaUrl, '| Chat model:', ollamaChatModel, '| Vision model:', ollamaVisionModel);
});

// Clear Transcript
clearTranscriptBtn.addEventListener('click', () => {
  transcriptionText = '';
  transcriptionBox.value = '';
});

// Clear conversation history (New Topic button)
const clearHistoryBtn = document.getElementById('clear-history');
clearHistoryBtn.addEventListener('click', () => {
  conversationHistory = [];
  transcriptionHistory = [];
  conversationSummary = '';
  showStatus('Conversation cleared - ready for new topic', 'success');
  console.log('Conversation history cleared');
});

// Clear response box
document.getElementById('clear-response').addEventListener('click', () => {
  responseBox.innerHTML = '';
  responseHistory = [];
  responseHistoryIndex = -1;
  updateNavButtons();
});

// Back/Forward navigation through response history
document.getElementById('response-back-btn').addEventListener('click', () => {
  if (responseHistoryIndex > 0) {
    responseHistoryIndex--;
    responseBox.innerHTML = responseHistory[responseHistoryIndex];
    updateNavButtons();
  }
});

document.getElementById('response-forward-btn').addEventListener('click', () => {
  if (responseHistoryIndex < responseHistory.length - 1) {
    responseHistoryIndex++;
    responseBox.innerHTML = responseHistory[responseHistoryIndex];
    updateNavButtons();
  }
});

// Scroll AI response via keyboard shortcut (Cmd+Shift+Up/Down)
ipcRenderer.on('scroll-response', (event, direction) => {
  responseBox.scrollTop += direction === 'up' ? -140 : 140;
});

// Add a response to display history and update nav buttons
function addToResponseHistory(html) {
  // Drop any forward entries when a new response arrives
  responseHistory = responseHistory.slice(0, responseHistoryIndex + 1);
  responseHistory.push(html);
  responseHistoryIndex = responseHistory.length - 1;
  updateNavButtons();
}

function updateNavButtons() {
  document.getElementById('response-back-btn').disabled = responseHistoryIndex <= 0;
  document.getElementById('response-forward-btn').disabled = responseHistoryIndex >= responseHistory.length - 1;
}

// Copy Response
copyResponseBtn.addEventListener('click', () => {
  const text = responseBox.innerText;
  if (text && !text.includes('Press Ctrl+Enter')) {
    navigator.clipboard.writeText(text);
    showStatus('Copied to clipboard!', 'success');
  }
});

// AI Answer Button
aiAnswerBtn.addEventListener('click', async () => {
  await generateAIAnswer();
});

// Screenshot Analysis Button — 3-second countdown so user can switch to the question window
screenshotBtn.addEventListener('click', async () => {
  for (let i = 3; i > 0; i--) {
    responseBox.innerHTML = `<span style="color: rgba(255,255,255,0.85); font-size: 1.1em;">📸 Switch to the question window...<br>Capturing in <b>${i}</b>s</span>`;
    showStatus(`Capturing in ${i}s`, 'processing');
    await new Promise(r => setTimeout(r, 1000));
  }
  await captureAndAnalyzeScreenshot();
});

// Capture Audio Button (manual toggle if needed)
captureBtn.addEventListener('click', async () => {
  if (isCapturing) {
    stopCapture();
  } else {
    await startCapture();
  }
});

// Auto-start capture when app loads
ipcRenderer.on('auto-start-capture', async () => {
  await startCapture();
});

// IPC listeners for global shortcuts
ipcRenderer.on('trigger-ai-answer', async () => {
  await generateAIAnswer();
});

ipcRenderer.on('trigger-screenshot', async () => {
  await captureAndAnalyzeScreenshot();
});

// Stop listening shortcut (Cmd+N)
ipcRenderer.on('stop-listening', () => {
  if (isCapturing) {
    stopCapture();
    showStatus('Stopped listening', 'ready');
  }
});

// Start Audio Capture with MediaRecorder
async function startCapture() {
  if (isCapturing) return;
  
  console.log('=== Starting audio capture ===');
  showStatus('Starting mic...', 'processing');
  
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    console.log('Microphone stream obtained');
    
    // Setup audio analysis for voice detection
    setupAudioAnalysis(audioStream);
    
    isCapturing = true;
    captureBtn.classList.add('active');
    captureBtn.textContent = '🔴 Listening';
    listeningIndicator.classList.add('active');
    showStatus('Listening...', 'recording');
    
    // Start recording loop
    recordAndTranscribe();
  } catch (error) {
    console.error('Microphone error:', error);
    showStatus('Mic error: ' + error.message, 'error');
    transcriptionBox.value = `Microphone error: ${error.message}`;
  }
}

// Audio capture settings for low latency
const CHUNK_DURATION_MS = 3000; // 3 seconds for faster response
const SILENCE_THRESHOLD = 0.03; // Audio level threshold to detect speech vs silence (higher = more aggressive filtering)
let isTranscribing = false;
let pendingBlob = null;
let audioContext = null;
let analyser = null;

// Setup audio analysis for voice detection
function setupAudioAnalysis(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
}

// Check if audio has actual speech (not just background noise)
function hasVoiceActivity() {
  if (!analyser) return true; // If no analyser, assume there's voice
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  
  // Calculate average volume
  const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
  const normalizedLevel = average / 255;
  
  return normalizedLevel > SILENCE_THRESHOLD;
}

// Record audio chunk and transcribe
function recordAndTranscribe() {
  if (!isCapturing || !audioStream || !audioStream.active) {
    console.log('Recording stopped');
    return;
  }
  
  const chunks = [];
  let hasDetectedVoice = false;
  const recorder = new MediaRecorder(audioStream, {
    mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus' 
      : 'audio/webm'
  });
  
  // Check for voice activity periodically during recording
  const voiceCheckInterval = setInterval(() => {
    if (hasVoiceActivity()) {
      hasDetectedVoice = true;
    }
  }, 200);
  
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  
  recorder.onstop = async () => {
    clearInterval(voiceCheckInterval);
    
    // Start next recording immediately (don't wait for transcription)
    if (isCapturing) {
      recordAndTranscribe();
    }
    
    // Only process if voice was detected (skip silence/background noise)
    if (chunks.length > 0 && hasDetectedVoice) {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      
      if (blob.size > 500) {
        // If already transcribing, queue this blob
        if (isTranscribing) {
          pendingBlob = blob;
        } else {
          await processAudioBlob(blob);
        }
      }
    } else {
      console.log('Skipped chunk - no voice detected');
    }
  };
  
  recorder.start();
  
  // Record for CHUNK_DURATION_MS then stop
  setTimeout(() => {
    if (recorder.state === 'recording') {
      recorder.stop();
    }
  }, CHUNK_DURATION_MS);
}

// Process audio blob with queue handling
async function processAudioBlob(blob) {
  isTranscribing = true;
  if (useLocalWhisper) {
    await transcribeLocally(blob);
  } else {
    await transcribeWithGroq(blob);
  }
  isTranscribing = false;

  // Process pending blob if any
  if (pendingBlob) {
    const nextBlob = pendingBlob;
    pendingBlob = null;
    await processAudioBlob(nextBlob);
  }
}

// Transcribe using local nodejs-whisper (no API key needed)
async function transcribeLocally(audioBlob) {
  try {
    showStatus('Transcribing locally...', 'processing');
    const arrayBuffer = await audioBlob.arrayBuffer();
    const result = await ipcRenderer.invoke('transcribe-local', Array.from(new Uint8Array(arrayBuffer)));
    if (!result.success) {
      console.error('Local whisper error:', result.error);
      showStatus('Whisper error', 'error');
      return;
    }
    const text = (result.text || '').trim();
    if (!text || text.length < 4) return;

    const hallucinationPatterns = [
      'thank you', 'thanks for watching', 'subscribe', 'background sound',
      'background noise', 'music playing', 'applause', '[ silence ]', '[silence]',
      'the end', 'transcribe', '(music)', '(applause)'
    ];
    const lower = text.toLowerCase();
    if (hallucinationPatterns.some(p => lower.includes(p))) return;

    transcriptionText += ' ' + text;
    updateTranscriptionBox(transcriptionText.trim());
    showStatus('✓ Transcribed (local)', 'success');
    maybeSummariseTranscript();
  } catch (error) {
    console.error('Local transcription error:', error);
    showStatus('Local whisper failed', 'error');
  }
}

// Transcribe audio using Groq (free) or OpenAI
async function transcribeWithGroq(audioBlob) {
  const hasGroq = groqApiKey && groqApiKey.length > 10;
  const hasOpenAI = apiKey && apiKey.length > 10;
  
  if (!hasGroq && !hasOpenAI) {
    transcriptionBox.value = 'No transcription API key! Enable Local Whisper in Settings (free) or get a free key from console.groq.com';
    showStatus('No transcription key', 'error');
    stopCapture();
    return;
  }
  
  const useGroq = hasGroq;
  const apiUrl = useGroq ? `${GROQ_API_URL}/audio/transcriptions` : `${OPENAI_API_URL}/audio/transcriptions`;
  const key = useGroq ? groqApiKey : apiKey;
  const model = useGroq ? 'whisper-large-v3' : 'whisper-1';
  
  console.log('Transcribing with:', useGroq ? 'Groq (FREE)' : 'OpenAI');
  
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', model);
    formData.append('language', selectedLanguage); // Use selected language
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: formData
    });
    
    console.log('Transcription status:', response.status);
    
    if (!response.ok) {
      const err = await response.text();
      console.error('Transcription error:', err);
      showStatus('API Error', 'error');
      return;
    }
    
    const data = await response.json();
    if (data.text && data.text.trim()) {
      const text = data.text.trim();
      const lowerText = text.toLowerCase();
      
      // Filter out common Whisper hallucinations (uses CONTAINS matching)
      const hallucinationPatterns = [
        'thank you', 'thanks for watching', 'subscribe', 'like and subscribe',
        'background sound', 'background noise', 'avoid background', 'silence',
        'music playing', 'applause', 'laughter',
        '[ silence ]', '[silence]', '[ music ]', '[music]', '[applause]',
        'the end', 'thanks for', 'see you', 'goodbye',
        'transcribe', 'ignore background', 'actual speech',
        'professional interview', 'conversation'
      ];
      
      // Check if text CONTAINS any hallucination pattern
      const containsHallucination = hallucinationPatterns.some(pattern => 
        lowerText.includes(pattern)
      );
      
      // Also filter very short or repetitive text
      const isTooShort = text.length < 4;
      const isJustPunctuation = /^[.,!?…♪\s]+$/.test(text);
      const isJustFiller = /^(um+|uh+|ah+|oh+|hmm+|okay|ok|bye|you|yeah|yes|no|hi|hey)\.?$/i.test(text);
      
      const isHallucination = containsHallucination || isTooShort || isJustPunctuation || isJustFiller;
      
      if (!isHallucination) {
        transcriptionText += ' ' + text;
        updateTranscriptionBox(transcriptionText.trim());
        showStatus('✓ Transcribed', 'success');
        maybeSummariseTranscript();
      } else {
        console.log('Filtered hallucination:', text);
      }
    }
  } catch (error) {
    console.error('Transcription error:', error);
    showStatus('Network error', 'error');
  }
}

// Stop Audio Capture
function stopCapture() {
  isCapturing = false;
  
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }
  
  captureBtn.classList.remove('active');
  captureBtn.textContent = '🎤 Listen';
  listeningIndicator.classList.remove('active');
  showStatus('Paused', 'ready');
}

// Update transcription display
function updateTranscriptionBox(text) {
  transcriptionBox.value = text;
  transcriptionBox.scrollTop = transcriptionBox.scrollHeight;
}

// ─── Summarisation helpers ─────────────────────────────────────────────────
// Lightweight gpt-4o-mini call that returns a plain-text summary.
// Fire-and-forget from callers; failures are logged but never break the UI.
async function openaiSummarise(systemPrompt, userText, maxTokens = 220) {
  try {
    const res = await fetch(`${OPENAI_API_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ],
        max_tokens: maxTokens,
        temperature: 0.2
      })
    });
    if (!res.ok) throw new Error(`summariser ${res.status}`);
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  } catch (err) {
    console.warn('Summariser failed:', err.message);
    return '';
  }
}

// When the live transcript grows long, compress the older part into a short
// summary and keep the last TRANSCRIPT_KEEP_TAIL_WORDS verbatim so fresh audio
// still tacks on naturally. Non-blocking.
async function maybeSummariseTranscript() {
  if (isSummarisingTranscript) return;
  const current = transcriptionText.trim();
  const words = current.split(/\s+/).filter(Boolean);
  if (words.length < TRANSCRIPT_WORD_THRESHOLD) return;

  isSummarisingTranscript = true;
  try {
    const tail = words.slice(-TRANSCRIPT_KEEP_TAIL_WORDS).join(' ');
    const head = words.slice(0, -TRANSCRIPT_KEEP_TAIL_WORDS).join(' ');

    const summary = await openaiSummarise(
      'You compress a live interview transcript for an AI interview assistant. Keep it short and factual — capture the interviewer\'s questions asked so far, the topics discussed, any constraints mentioned, and the candidate\'s stated answers or positions. Use 2–5 compact bullet points. Do not add commentary.',
      `Transcript so far:\n${head}`,
      200
    );

    if (!summary) return;
    const condensed = `[Context so far]\n${summary}\n\n[Live]\n${tail}`;
    transcriptionText = condensed;
    // Only overwrite the UI box if the user hasn't manually edited it away
    if (transcriptionBox && transcriptionBox.value.trim().split(/\s+/).length >= TRANSCRIPT_WORD_THRESHOLD) {
      updateTranscriptionBox(condensed);
    }
    console.log('[Transcript] Summarised older context, kept tail of', TRANSCRIPT_KEEP_TAIL_WORDS, 'words');
  } finally {
    isSummarisingTranscript = false;
  }
}

// When conversationHistory grows, fold older Q/A pairs into conversationSummary
// so the LLM still "remembers" them on follow-up questions without blowing tokens.
async function maybeSummariseHistory() {
  if (isSummarisingHistory) return;
  const exchanges = Math.floor(conversationHistory.length / 2);
  if (exchanges <= SUMMARY_TRIGGER_EXCHANGES) return;

  isSummarisingHistory = true;
  try {
    // Keep the last SUMMARY_KEEP_EXCHANGES verbatim; fold the rest into summary.
    const keepMsgs = SUMMARY_KEEP_EXCHANGES * 2;
    const toFold = conversationHistory.slice(0, -keepMsgs);
    if (toFold.length === 0) return;

    const foldText = toFold.map((m, i) => {
      const prefix = m.role === 'user' ? 'Interviewer' : 'Me (candidate)';
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${prefix}: ${content}`;
    }).join('\n\n');

    const priorSummary = conversationSummary
      ? `Previous running summary:\n${conversationSummary}\n\nNew exchanges to merge:\n`
      : 'Exchanges to summarise:\n';

    const newSummary = await openaiSummarise(
      'You maintain a compact running memory of a live interview for an AI assistant. Merge the previous summary (if any) with the new exchanges and output an updated summary. Capture: topics covered, specific questions asked by the interviewer, the candidate\'s key answers / stated positions / code or designs proposed, and any follow-up threads that are still open. Use 4–8 tight bullet points. No preamble, no commentary.',
      priorSummary + foldText,
      300
    );

    if (!newSummary) return;
    conversationSummary = newSummary;
    conversationHistory = conversationHistory.slice(-keepMsgs);
    console.log('[Memory] Folded', toFold.length / 2, 'exchanges into summary; history now', conversationHistory.length / 2, 'exchanges');
  } finally {
    isSummarisingHistory = false;
  }
}
// ──────────────────────────────────────────────────────────────────────────

// Generate AI Answer
async function generateAIAnswer() {
  const hasGroq = groqApiKey && groqApiKey.length > 10;
  const hasOpenAI = apiKey && apiKey.length > 10;

  if (!ollamaEnabled && !hasGroq && !hasOpenAI) {
    showStatus('No AI configured', 'error');
    settingsPanel.classList.add('active');
    return;
  }

  // Use the textarea value (allows user edits) instead of just transcriptionText
  const currentTranscription = transcriptionBox.value.trim();

  if (!currentTranscription) {
    showStatus('No transcription yet', 'error');
    return;
  }

  responseBox.innerHTML = '<span style="color: rgba(255,255,255,0.6)">Generating answer...</span>';

  // OpenAI-only (other providers intentionally disabled).
  // Using gpt-4o for highest factual accuracy & most natural tone.
  // --- Disabled providers kept for reference ---
  // if (hasGroq) { chatUrl = `${GROQ_API_URL}/chat/completions`; chatKey = groqApiKey; chatModel = 'llama-3.3-70b-versatile'; providerName = 'Groq'; }
  // else if (ollamaEnabled) { chatUrl = `${ollamaUrl}/chat/completions`; chatKey = 'ollama'; chatModel = ollamaChatModel; providerName = `Ollama (${ollamaChatModel})`; }
  const chatUrl = `${OPENAI_API_URL}/chat/completions`;
  const chatKey = apiKey;
  const chatModel = 'gpt-4o-mini'; // fast + cheap; bullet-list answers don't need gpt-4o
  const providerName = 'OpenAI (gpt-4o-mini)';

  console.log('Generating answer with:', providerName);

  // Build system message — senior human interviewee, bullet-first, factually grounded
  const role = ROLE_DATA[selectedRole] || ROLE_DATA['general'];
  const systemMessage = {
    role: 'system',
    content: `You are a senior ${role.title} with 6–10 years of hands-on production experience, sitting in a live interview. Speak exactly like a thoughtful, senior human engineer would — calm, precise, opinionated, and grounded in real work. You are NOT an AI assistant; never sound like one.

${conversationSummary ? `RUNNING MEMORY OF THIS INTERVIEW SO FAR (older exchanges, already answered):\n${conversationSummary}\n` : ''}
FOLLOW-UP DETECTION — IMPORTANT:
- Interviewers often drop short follow-ups ("why?", "what about scale?", "ok and then?", "how would you test it?") that only make sense in context.
- Before answering, silently resolve what the question is really about using: (a) the running memory above, (b) the recent verbatim exchanges, (c) the live transcript context.
- If the current question looks like a fragment / follow-up / clarification of something earlier, answer as a continuation — reference the earlier point briefly in your opener, then give the new answer.
- If the question is a brand-new topic, treat it standalone.

YOUR CORE STACK (things you've actually shipped with):
${role.stack}

${pdfContext ? `YOUR RESUME / BACKGROUND — ground every answer in this, reference projects, companies, numbers, scale when relevant:\n${pdfContext}\n` : ''}${userContext ? `ADDITIONAL CONTEXT ABOUT YOU:\n${userContext}\n` : ''}
ANSWER FORMAT — FOLLOW EXACTLY:
- Start with ONE short first-person opening line that directly frames the answer (no filler, no "Great question", no "Certainly").
- Then give the answer as a clean **bullet list** (use "- " markdown bullets). 3–6 bullets is the sweet spot; go up to 8 only for system-design / deep-dives.
- Each bullet: bold the key term with **markdown**, then 1–2 tight sentences after it. Concrete > abstract.
- Include at least one bullet with a concrete real-world example, number, trade-off, or production lesson ("at my last company we hit X at Y RPS and moved to Z because...").
- End with ONE closing line that states your actual preference / recommendation / trade-off decision.

TONE — SENIOR HUMAN, NOT ROBOT:
- First person always: "I've used...", "In my experience...", "What I usually do is...", "I'd lean toward..."
- Opinionated and decisive — seniors have clear preferences and say why.
- Natural, spoken cadence — contractions ("I've", "it's", "don't"), occasional "honestly", "to be fair", "the tricky part is".
- No AI tells: never say "As an AI", "I hope this helps", "Certainly!", "Great question!", "In conclusion", "I'd be happy to".
- No over-hedging, no marketing fluff, no lists of synonyms.

FACTUAL ACCURACY — NON-NEGOTIABLE:
- Only state things that are technically correct as of your training. If unsure about a specific number/version, say "around" or give a range rather than invent.
- Prefer canonical, well-known patterns over obscure ones. Name real tools, real libraries, real RFCs/specs when relevant.
- For complexity / Big-O, state it precisely. For system design, give concrete numbers (QPS, latency, storage) with realistic orders of magnitude.
- If a question has a genuine trade-off, show both sides in one bullet, then pick a side.

SPECIAL CASES:
- Behavioural questions: use STAR compressed into bullets — **Situation / Task**, **Action**, **Result** (each a bullet), with a real-sounding specific story.
- Coding questions: give the working solution in a fenced code block (language inferred, default Java), then bullets for **Approach**, **Complexity**, **Edge cases**, **Follow-ups I'd ask**.
- System design: bullets for **Requirements clarified**, **High-level components**, **Data model**, **Scale & bottlenecks**, **Trade-offs I'd pick**.
- Follow-up / pushback: acknowledge the point in the first line, then bullets defending or refining your position.`
  };

  // Save this transcription to rolling history (keep last 5)
  transcriptionHistory.push(currentTranscription);
  if (transcriptionHistory.length > 5) transcriptionHistory.shift();

  // Build context block from past transcriptions so AI knows the interview flow
  const pastContext = transcriptionHistory.length > 1
    ? transcriptionHistory
        .slice(0, -1) // all except current
        .map((t, i) => `[Exchange ${i + 1}]: ${t}`)
        .join('\n\n')
    : null;

  const currentQuestion = {
    role: 'user',
    content: pastContext
      ? `INTERVIEW CONVERSATION SO FAR (last ${transcriptionHistory.length - 1} exchanges for context):\n${pastContext}\n\n---\nCURRENT QUESTION / LATEST CONVERSATION:\n${currentTranscription}`
      : `Interview question or conversation (answer as the candidate):\n\n${currentTranscription}`
  };

  // Keep last 7 exchanges (14 messages) for full context memory
  const recentHistory = conversationHistory.slice(-14);
  const messages = [systemMessage, ...recentHistory, currentQuestion];
  
  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${chatKey}`
      },
      body: JSON.stringify({
        model: chatModel,
        messages: messages,
        max_tokens: 600,
        temperature: 0.5,
        presence_penalty: 0.3,
        frequency_penalty: 0.3,
        stream: false
      })
    });

    console.log('Chat response status:', response.status);

    if (!response.ok) {
      const err = await response.text();
      console.error('Chat error:', err);
      throw new Error('API request failed');
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;
    
    // Store this exchange in conversation history
    conversationHistory.push(currentQuestion);
    conversationHistory.push({ role: 'assistant', content: answer });

    // Fold older exchanges into the running summary so follow-up questions
    // keep full interview context without ballooning the prompt.
    maybeSummariseHistory();
    
    responseBox.innerHTML = highlightImportantParts(answer);
    addToResponseHistory(responseBox.innerHTML);
    scrollToResponse();
    showStatus('✓ Answer ready!', 'success');
    console.log('Conversation history length:', conversationHistory.length);

  } catch (error) {
    console.error('AI Answer error:', error);
    responseBox.innerHTML = '<span style="color: #f87171">Error generating answer. Check API key.</span>';
    showStatus('Error', 'error');
  }
}

// Capture and Analyze Screenshot
async function captureAndAnalyzeScreenshot() {
  const hasOpenAI = apiKey && apiKey.length > 10;
  const hasGroq = groqApiKey && groqApiKey.length > 10;

  if (!ollamaEnabled && !hasGroq && !hasOpenAI) {
    responseBox.innerHTML = '<span style="color: #f87171">Screenshot analysis needs one of:<br>• Groq API key (free) — already used for transcription<br>• Ollama enabled with a vision model (e.g. llava) — free & local<br>• OpenAI API key with gpt-4o access</span>';
    showStatus('No vision provider configured', 'error');
    settingsPanel.classList.add('active');
    return;
  }

  responseBox.innerHTML = '<span style="color: rgba(255,255,255,0.6)">Capturing screen...</span>';

  try {
    // When triggered via global shortcut (Cmd+Shift+Enter) the previous app is still
    // frontmost, so we capture just that window — much cleaner than the full screen.
    // Falls back to null if our own app is frontmost (button-click case).
    let focusedSource = null;
    try {
      focusedSource = await ipcRenderer.invoke('get-focused-window-source');
    } catch (_) {}

    let captureSource;
    let isWindowCapture = false;

    if (focusedSource) {
      captureSource = focusedSource;
      isWindowCapture = true;
      console.log('Capturing focused window:', focusedSource.name);
    } else {
      const sources = await ipcRenderer.invoke('get-sources');
      captureSource = sources.find(s =>
        s.name.toLowerCase().includes('entire') ||
        s.name.toLowerCase().includes('screen') ||
        s.name.toLowerCase().includes('display')
      ) || sources[sources.length - 1];
      console.log('Capturing full screen:', captureSource?.name);
    }

    if (!captureSource) {
      throw new Error('No screen source found. Grant Screen Recording permission in System Settings.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: captureSource.id
        }
      }
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    await new Promise(resolve => { video.onloadedmetadata = resolve; });
    await video.play();

    // Window capture → full resolution (it's already one window).
    // Full screen → cap at 1920px wide so the payload stays manageable.
    const MAX_WIDTH = isWindowCapture ? Infinity : 1920;
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(video.videoWidth  * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach(t => t.stop());

    const base64Image = canvas.toDataURL('image/jpeg', isWindowCapture ? 0.85 : 0.75).split(',')[1];

    // OpenAI-only (Groq / Ollama vision paths intentionally disabled).
    // gpt-4o has the strongest OCR + reasoning for interview screenshots.
    // --- Disabled providers kept for reference ---
    // if (hasGroq) { visionUrl = `${GROQ_API_URL}/chat/completions`; visionKey = groqApiKey; visionModel = 'meta-llama/llama-4-scout-17b-16e-instruct'; }
    // else { visionUrl = `${ollamaUrl}/chat/completions`; visionKey = 'ollama'; visionModel = ollamaVisionModel; }
    const visionUrl = `${OPENAI_API_URL}/chat/completions`;
    const visionKey = apiKey;
    const visionModel = 'gpt-4o-mini'; // fast vision model — enough for interview screenshots
    const providerName = 'OpenAI (gpt-4o-mini)';

    responseBox.innerHTML = `<span style="color: rgba(255,255,255,0.6)">Analyzing with ${providerName}...</span>`;

    const role = ROLE_DATA[selectedRole] || ROLE_DATA['general'];
    const recentTranscription = transcriptionBox.value.trim();

    // System prompt — senior human persona + full interview-assistant context
    const systemContent = [
      `You are my personal AI interview assistant. I am a senior ${role.title} with 6–10 years of hands-on production experience in a live interview right now. You speak and answer AS ME — first person, thoughtful senior engineer, calm, precise, opinionated, grounded in real work. Never sound like an AI.`,
      `Core stack I've actually shipped with: ${role.stack}`,
      pdfContext ? `MY RESUME / BACKGROUND — ground every answer in this, reference my actual projects, companies, numbers, scale, outcomes whenever relevant:\n${pdfContext.slice(0, 2000)}` : '',
      userContext ? `ADDITIONAL CONTEXT I GAVE YOU ABOUT ME / THE ROLE / THE COMPANY:\n${userContext}` : '',
      conversationSummary ? `RUNNING MEMORY OF THIS INTERVIEW SO FAR (already discussed):\n${conversationSummary}` : '',
      '',
      'WHAT THE SCREENSHOT COULD BE — handle ALL cases:',
      '- Coding problem (LeetCode-style, take-home, online editor) → give full working solution.',
      '- Existing code / snippet for review / debugging → find bugs, suggest refactors, provide fixed version.',
      '- System design prompt or whiteboard diagram → give structured design answer.',
      '- Architecture / sequence / ER diagram → explain it, critique it, or extend it as asked.',
      '- SQL query / schema → write or optimise the query, explain trade-offs, indexes.',
      '- Error message / stack trace / log → diagnose the root cause and fix.',
      '- API spec / OpenAPI / docs / config file → explain, critique, or modify as requested.',
      '- Behavioural / conceptual question written on a slide → answer it like the candidate.',
      '- Data / spreadsheet / chart / dashboard → interpret the data and answer the question.',
      '- Job description / requirements → tailor an answer showing fit from MY RESUME.',
      '- Any other content → figure out what the interviewer is really asking and answer that.',
      '',
      'ANSWER FORMAT:',
      '- ONE short first-person opening line framing the answer (no filler, no "Certainly", no "Great question").',
      '- Then a markdown bullet list ("- " bullets). 3–6 bullets usually; up to 8 for system-design / deep-dives.',
      '- Each bullet: **bold the key term** in markdown, then 1–2 tight sentences.',
      '- Include at least one bullet with a concrete example from MY background / a real-world number / a production trade-off.',
      '- End with one closing line stating my preferred approach / decision.',
      '',
      'TONE: first person, contractions ("I\'ve", "it\'s", "don\'t"), opinionated, spoken cadence. Occasional "honestly", "to be fair", "the tricky part is". Never "As an AI", "I hope this helps", "In conclusion", "I\'d be happy to".',
      'ACCURACY: only state things that are technically correct. Precise Big-O. Realistic QPS / latency / storage numbers. Real library / tool / RFC names. If unsure of a specific version or figure, say "around" or give a range.',
      '',
      'SPECIAL-CASE FORMATS:',
      '- Coding problem: fenced code block with full working solution (default Java unless another language is clearly shown), then bullets for **Approach**, **Complexity** (time & space), **Edge cases**, **Follow-ups I\'d ask**.',
      '- Code review / bug fix: bullets listing issues (bolded), then fenced code block with the fixed version, then a final bullet on what changed and why.',
      '- System design: bullets for **Requirements clarified**, **High-level components**, **Data model**, **Scale & bottlenecks**, **Trade-offs I\'d pick**.',
      '- SQL: fenced code block with the query, then bullets for **Indexes / plan**, **Edge cases**, **Alternative**.',
      '- Error / stack trace: bullets for **Root cause**, **Fix**, **Prevention**, optional code block.',
      '- Behavioural: STAR as bullets — **Situation / Task**, **Action**, **Result**, grounded in MY resume.'
    ].filter(Boolean).join('\n');

    // User instruction — extract intent first, then answer using screenshot + spoken context
    const taskText = [
      'This screenshot is from my live interview RIGHT NOW. Read everything visible on screen carefully — problem text, constraints, examples, code, diagrams, error messages, SQL, data, slides, or any other content.',
      recentTranscription ? `What the interviewer just said / what I\'ve been discussing (use as context, may contain the actual question if the screen is just supporting material):\n"""\n${recentTranscription.slice(-1200)}\n"""` : '',
      '',
      'Do this internally, then answer:',
      '1. Figure out WHAT TYPE of screen this is (coding problem / code review / design / SQL / error / docs / slide / diagram / data / other).',
      '2. Figure out the EXACT question or task — combine what\'s on screen with the spoken context and running memory. The interviewer may not state the full question on screen; infer it.',
      '3. Answer it AS ME following the ANSWER FORMAT and the right SPECIAL-CASE format from the system prompt.',
      '',
      'Strict rules:',
      '- Do NOT describe the UI, the IDE, the window, or what the screenshot looks like. Go straight to the substantive answer.',
      '- Do NOT restate the full problem back — reference it only briefly if needed.',
      '- If an example / test case / constraint is visible, make sure the solution handles it exactly.',
      '- If something on screen is genuinely ambiguous, state your ONE assumption in a bullet and proceed confidently.',
      '- Ground the answer in MY RESUME and MY PRIOR ANSWERS (running memory) whenever relevant so it feels consistent with what I\'ve already said.'
    ].filter(Boolean).join('\n');

    const userContent = [
      { type: 'text', text: taskText },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
    ];

    const response = await fetch(visionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${visionKey}` },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user',   content: userContent }
        ],
        max_tokens: 750,
        temperature: 0.4,
        presence_penalty: 0.3,
        frequency_penalty: 0.3,
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Vision API error:', errText);
      let hint = hasGroq ? 'Check your Groq API key.' : '';
      if (ollamaEnabled) hint = `Run: <b>ollama pull ${ollamaVisionModel}</b>`;
      responseBox.innerHTML = `<span style="color: #f87171">Vision API error (${response.status}). ${hint}</span>`;
      showStatus('Vision error', 'error');
      return;
    }

    // Stream tokens to screen as they arrive
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    responseBox.innerHTML = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const token = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || '';
          if (token) {
            fullText += token;
            responseBox.innerHTML = highlightImportantParts(fullText);
            responseBox.scrollTop = responseBox.scrollHeight;
          }
        } catch (_) {}
      }
    }

    addToResponseHistory(responseBox.innerHTML);
    scrollToResponse();
    showStatus('Screenshot analyzed!', 'success');

    // Persist the screenshot exchange into conversation memory (text-only placeholder
    // for the question so it can be summarised later without carrying the image bytes).
    if (fullText) {
      const screenshotQuestion = recentTranscription
        ? `[Screenshot shown during interview] Interviewer context: ${recentTranscription.slice(-600)}`
        : `[Screenshot shown during interview — coding / design / code review / error / other visual content]`;
      conversationHistory.push({ role: 'user', content: screenshotQuestion });
      conversationHistory.push({ role: 'assistant', content: fullText });
      maybeSummariseHistory();
    }

  } catch (error) {
    console.error('Screenshot analysis error:', error);
    let msg = 'Error analyzing screenshot.';
    if (error.message?.includes('fetch') || error.message?.includes('Network')) {
      msg = ollamaEnabled ? 'Cannot reach Ollama. Run: <b>ollama serve</b>' : 'Network error. Check your connection.';
    } else if (error.message?.includes('Permission') || error.message?.includes('screen')) {
      msg = 'Screen recording permission denied. Enable it in System Settings → Privacy → Screen Recording.';
    } else {
      msg += ` (${error.message})`;
    }
    responseBox.innerHTML = `<span style="color: #f87171">${msg}</span>`;
    showStatus('Error analyzing screenshot', 'error');
  }
}

// Highlight important parts of AI response
function highlightImportantParts(text) {
  // First, extract and preserve code blocks
  const codeBlocks = [];
  let processedText = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const index = codeBlocks.length;
    codeBlocks.push({ lang: lang || 'code', code: code.trim() });
    return `__CODE_BLOCK_${index}__`;
  });
  
  // Convert newlines to <br> for HTML display
  let html = processedText.replace(/\n/g, '<br>');
  
  // Highlight inline code with backticks
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // Highlight text in **bold** markers (convert to highlighted spans)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<span class="highlight">$1</span>');
  
  // Highlight bullet point key terms (text before colon in bullet points)
  html = html.replace(/(<br>[-•]\s*)([^:]+):/g, '$1<span class="key-point">$2</span>:');
  
  // Highlight numbered list key terms
  html = html.replace(/(<br>\d+\.\s*)([^:]+):/g, '$1<span class="key-point">$2</span>:');
  
  // Highlight common important keywords/phrases
  const importantTerms = [
    'key point', 'important', 'critical', 'essential', 'remember',
    'note that', 'keep in mind', 'crucial', 'significant', 'main',
    'primary', 'fundamental', 'core', 'vital', 'notably'
  ];
  
  importantTerms.forEach(term => {
    const regex = new RegExp(`\\b(${term})\\b`, 'gi');
    html = html.replace(regex, '<span class="highlight">$1</span>');
  });
  
  // Restore code blocks with proper formatting
  codeBlocks.forEach((block, index) => {
    const codeHtml = `
      <div class="code-block">
        <div class="code-header">
          <span class="code-lang">${block.lang.toUpperCase()}</span>
        </div>
        <pre class="code-content"><code>${escapeHtml(block.code)}</code></pre>
      </div>
    `;
    html = html.replace(`__CODE_BLOCK_${index}__`, codeHtml);
  });
  
  return html;
}

// Escape HTML special characters for code display
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show status message
function showStatus(message, type) {
  const statusText = statusIndicator.querySelector('.status-text');
  const dot = statusIndicator.querySelector('.dot');
  
  statusText.textContent = message;
  
  switch(type) {
    case 'success':
      dot.style.background = '#4ade80';
      break;
    case 'error':
      dot.style.background = '#f87171';
      break;
    case 'recording':
      dot.style.background = '#f472b6';
      break;
    default:
      dot.style.background = '#4ade80';
  }

  // Reset after 3 seconds
  if (type !== 'recording') {
    setTimeout(() => {
      statusText.textContent = 'Ready';
      dot.style.background = '#4ade80';
    }, 3000);
  }
}

// Window drag and resize state
let isDragging = false;
let isResizing = false;
let dragStartX, dragStartY;
let resizeDirection = null;
let initialBounds = null;
let initialMouseX, initialMouseY;

const RESIZE_MARGIN = 12; // pixels from edge to trigger resize

// Detect resize direction based on cursor position
function getResizeDirection(e) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = e.clientX;
  const y = e.clientY;
  
  const onLeft = x < RESIZE_MARGIN;
  const onRight = x > w - RESIZE_MARGIN;
  const onTop = y < RESIZE_MARGIN;
  const onBottom = y > h - RESIZE_MARGIN;
  
  if (onTop && onLeft) return 'nw';
  if (onTop && onRight) return 'ne';
  if (onBottom && onLeft) return 'sw';
  if (onBottom && onRight) return 'se';
  if (onTop) return 'n';
  if (onBottom) return 's';
  if (onLeft) return 'w';
  if (onRight) return 'e';
  return null;
}

// Get cursor style for resize direction
function getResizeCursor(dir) {
  const cursors = {
    'n': 'ns-resize', 's': 'ns-resize',
    'e': 'ew-resize', 'w': 'ew-resize',
    'ne': 'nesw-resize', 'sw': 'nesw-resize',
    'nw': 'nwse-resize', 'se': 'nwse-resize'
  };
  return cursors[dir] || 'default';
}

// Drag handle for moving window
document.getElementById('drag-handle').addEventListener('mousedown', (e) => {
  if (e.target.classList.contains('control-btn')) return;
  const dir = getResizeDirection(e);
  if (dir) return; // Don't drag if on resize edge
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
});

// Global mousedown for resize
document.addEventListener('mousedown', async (e) => {
  const dir = getResizeDirection(e);
  if (dir) {
    isResizing = true;
    resizeDirection = dir;
    initialMouseX = e.screenX;
    initialMouseY = e.screenY;
    initialBounds = await ipcRenderer.invoke('get-window-bounds');
    e.preventDefault();
    e.stopPropagation();
  }
});

// Global mousemove for drag and resize
document.addEventListener('mousemove', (e) => {
  // Handle resize
  if (isResizing && initialBounds) {
    const deltaX = e.screenX - initialMouseX;
    const deltaY = e.screenY - initialMouseY;
    
    let newWidth = initialBounds.width;
    let newHeight = initialBounds.height;
    let newX = initialBounds.x;
    let newY = initialBounds.y;
    
    if (resizeDirection.includes('e')) newWidth = initialBounds.width + deltaX;
    if (resizeDirection.includes('w')) {
      newWidth = initialBounds.width - deltaX;
      newX = initialBounds.x + deltaX;
    }
    if (resizeDirection.includes('s')) newHeight = initialBounds.height + deltaY;
    if (resizeDirection.includes('n')) {
      newHeight = initialBounds.height - deltaY;
      newY = initialBounds.y + deltaY;
    }
    
    ipcRenderer.send('resize-window', { width: newWidth, height: newHeight, x: newX, y: newY });
    return;
  }
  
  // Handle drag
  if (isDragging) {
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    ipcRenderer.send('move-window', { x: deltaX, y: deltaY });
    return;
  }
  
  // Update cursor based on position
  const dir = getResizeDirection(e);
  document.body.style.cursor = dir ? getResizeCursor(dir) : 'default';
});

// Global mouseup
document.addEventListener('mouseup', () => {
  isDragging = false;
  isResizing = false;
  resizeDirection = null;
  initialBounds = null;
});
