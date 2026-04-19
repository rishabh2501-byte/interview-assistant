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

// Response display history (back/forward navigation)
let responseHistory = [];
let responseHistoryIndex = -1;

// API Keys
// Groq: FREE Whisper + LLM - get key from console.groq.com
// OpenAI: Paid but reliable
// Ollama: FREE local models - install from ollama.ai
let groqApiKey = localStorage.getItem('groq_api_key') || '';
let apiKey = localStorage.getItem('openai_api_key') || '';
let ollamaEnabled = localStorage.getItem('ollama_enabled') === 'true';
let ollamaUrl = localStorage.getItem('ollama_url') || 'http://localhost:11434/v1';
let ollamaChatModel = localStorage.getItem('ollama_chat_model') || 'mistral';
let ollamaVisionModel = localStorage.getItem('ollama_vision_model') || 'llava';
let useLocalWhisper = localStorage.getItem('use_local_whisper') === 'true';

// API Configuration
const GROQ_API_URL = 'https://api.groq.com/openai/v1';
const OPENAI_API_URL = 'https://api.openai.com/v1';

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

  // Priority: Groq (fast cloud, no laptop load) > Ollama (local) > OpenAI (paid)
  // Groq is prioritized to avoid slowing down the laptop with local model inference
  let chatUrl, chatKey, chatModel, providerName;
  if (hasGroq) {
    chatUrl = `${GROQ_API_URL}/chat/completions`;
    chatKey = groqApiKey;
    chatModel = 'llama-3.3-70b-versatile';
    providerName = 'Groq (FREE)';
  } else if (ollamaEnabled) {
    chatUrl = `${ollamaUrl}/chat/completions`;
    chatKey = 'ollama';
    chatModel = ollamaChatModel;
    providerName = `Ollama (${ollamaChatModel})`;
  } else {
    chatUrl = `${OPENAI_API_URL}/chat/completions`;
    chatKey = apiKey;
    chatModel = 'gpt-3.5-turbo';
    providerName = 'OpenAI';
  }

  console.log('Generating answer with:', providerName);
  
  // Build system message with role-aware, human-sounding prompt
  const role = ROLE_DATA[selectedRole] || ROLE_DATA['general'];
  const systemMessage = {
    role: 'system',
    content: `You are roleplaying as the candidate in a job interview for the role of ${role.title}. Answer every question exactly as a real, experienced ${role.title} would speak — first person, confident, natural, and conversational. Your answers must sound like a human professional talking, NOT like an AI assistant writing a response.

ROLE & TECH STACK YOU KNOW DEEPLY:
${role.stack}

${pdfContext ? `YOUR RESUME / BACKGROUND (use this to personalize every answer):\n${pdfContext}\n` : ''}${userContext ? `ADDITIONAL CONTEXT ABOUT YOU:\n${userContext}\n` : ''}
HOW TO ANSWER — STRICT RULES:
- Speak in first person always: "I've worked with...", "In my experience...", "I usually...", "What I do is..."
- Sound like you're talking in a real conversation — natural pauses, direct points, no fluff
- NEVER start with "Certainly!", "Great question!", "Absolutely!", "Sure!" or any AI filler phrase
- NEVER say "As an AI" or anything that sounds like a chatbot wrote it
- Give concrete examples from your experience: "On my last project, we had this exact problem and I..."
- Be opinionated and specific — real engineers have opinions: "I prefer X over Y because..."
- For technical questions: give the actual answer first, then briefly explain the why
- For behavioural questions: use a real story format — situation, what you did, outcome
- Use industry terms naturally, like you actually use them at work
- Keep answers focused — 3-5 sentences for simple questions, structured bullets for complex ones
- If there's a follow-up or pushback, defend your answer confidently but professionally
- When providing code, write it cleanly and explain it like you're in a code review`
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
        max_tokens: 800,
        temperature: 0.75
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
    
    // Keep last 14 messages (7 full exchanges) for context memory
    if (conversationHistory.length > 14) {
      conversationHistory = conversationHistory.slice(-14);
    }
    
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

    // Vision provider priority: gpt-4o > Groq Llama-4-Scout > Ollama
    // gpt-4o is dramatically better at understanding screenshots than smaller models.
    let visionUrl, visionKey, visionModel, providerName;
    if (hasOpenAI) {
      visionUrl = `${OPENAI_API_URL}/chat/completions`;
      visionKey = apiKey;
      visionModel = 'gpt-4o';
      providerName = 'OpenAI (gpt-4o)';
    } else if (hasGroq) {
      visionUrl = `${GROQ_API_URL}/chat/completions`;
      visionKey = groqApiKey;
      visionModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
      providerName = 'Groq (Llama 4 Scout)';
    } else {
      visionUrl = `${ollamaUrl}/chat/completions`;
      visionKey = 'ollama';
      visionModel = ollamaVisionModel;
      providerName = `Ollama (${ollamaVisionModel})`;
    }

    responseBox.innerHTML = `<span style="color: rgba(255,255,255,0.6)">Analyzing with ${providerName}...</span>`;

    const role = ROLE_DATA[selectedRole] || ROLE_DATA['general'];
    const recentTranscription = transcriptionBox.value.trim();

    // Short, positive system message — models follow these much better than long "DO NOT" lists
    const systemContent = [
      `You are a ${role.title} candidate in a live job interview. Answer every question as yourself, in first person, with real technical depth.`,
      `Your tech stack: ${role.stack}`,
      pdfContext ? `Your background: ${pdfContext.slice(0, 800)}` : '',
      userContext ? `Additional context: ${userContext}` : ''
    ].filter(Boolean).join('\n');

    // Clear, direct user instruction — tell the model exactly what to do
    const taskText = [
      'Look at this screenshot and identify the interview question, coding problem, or technical task shown on screen.',
      recentTranscription ? `Context from the conversation: "${recentTranscription.slice(-400)}"` : '',
      `Respond with a complete answer as a ${role.title} candidate:`,
      '• For coding problems: write the full working solution (use Java unless another language is clearly shown), explain your approach, state time & space complexity.',
      '• For system design: give a structured answer with concrete choices and trade-offs.',
      '• For conceptual questions: answer directly with examples from your experience.',
      '• For code on screen: review it, fix bugs, suggest improvements.',
      'Skip any description of the UI or screen layout — just answer the question.'
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
        max_tokens: 800,
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
