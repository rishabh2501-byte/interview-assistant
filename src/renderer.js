const { ipcRenderer } = require('electron');

// State
let isCapturing = false;
let audioStream = null;
let transcriptionText = '';
let pdfContext = localStorage.getItem('pdf_context') || '';

// Conversation history for follow-up questions
let conversationHistory = [];

// API Keys
// Groq: FREE Whisper + LLM - get key from console.groq.com
// OpenAI: Paid but reliable
// Ollama: FREE local models - install from ollama.ai
let groqApiKey = localStorage.getItem('groq_api_key') || '';
let apiKey = localStorage.getItem('openai_api_key') || '';
let ollamaEnabled = localStorage.getItem('ollama_enabled') === 'true';
let ollamaUrl = localStorage.getItem('ollama_url') || 'http://localhost:11434/v1';
let ollamaChatModel = localStorage.getItem('ollama_chat_model') || 'llama3.2';
let ollamaVisionModel = localStorage.getItem('ollama_vision_model') || 'llava';

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

console.log('Interview Assistant initialized');
console.log('API Key set:', apiKey ? 'Yes' : 'No');
console.log('Groq Key set:', groqApiKey ? 'Yes' : 'No (get free key from console.groq.com)');
console.log('User context set:', userContext ? 'Yes (' + userContext.length + ' chars)' : 'No');

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
  ollamaChatModel = (ollamaChatModelInput ? ollamaChatModelInput.value.trim() : '') || 'llama3.2';
  ollamaVisionModel = (ollamaVisionModelInput ? ollamaVisionModelInput.value.trim() : '') || 'llava';
  localStorage.setItem('openai_api_key', apiKey);
  localStorage.setItem('groq_api_key', groqApiKey);
  localStorage.setItem('ollama_enabled', ollamaEnabled);
  localStorage.setItem('ollama_url', ollamaUrl);
  localStorage.setItem('ollama_chat_model', ollamaChatModel);
  localStorage.setItem('ollama_vision_model', ollamaVisionModel);
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
  showStatus('Conversation cleared - ready for new topic', 'success');
  console.log('Conversation history cleared');
});

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

// Screenshot Analysis Button
screenshotBtn.addEventListener('click', async () => {
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
  await transcribeWithGroq(blob);
  isTranscribing = false;
  
  // Process pending blob if any
  if (pendingBlob) {
    const nextBlob = pendingBlob;
    pendingBlob = null;
    await processAudioBlob(nextBlob);
  }
}

// Transcribe audio using Groq (free) or OpenAI
async function transcribeWithGroq(audioBlob) {
  const hasGroq = groqApiKey && groqApiKey.length > 10;
  const hasOpenAI = apiKey && apiKey.length > 10;
  
  if (!hasGroq && !hasOpenAI) {
    transcriptionBox.value = 'No API key! Get FREE key from console.groq.com';
    showStatus('No API key', 'error');
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

  // Priority: Ollama (local/free) > Groq (free cloud) > OpenAI (paid)
  let chatUrl, chatKey, chatModel, providerName;
  if (ollamaEnabled) {
    chatUrl = `${ollamaUrl}/chat/completions`;
    chatKey = 'ollama';
    chatModel = ollamaChatModel;
    providerName = `Ollama (${ollamaChatModel})`;
  } else if (hasGroq) {
    chatUrl = `${GROQ_API_URL}/chat/completions`;
    chatKey = groqApiKey;
    chatModel = 'llama-3.3-70b-versatile';
    providerName = 'Groq (FREE)';
  } else {
    chatUrl = `${OPENAI_API_URL}/chat/completions`;
    chatKey = apiKey;
    chatModel = 'gpt-3.5-turbo';
    providerName = 'OpenAI';
  }

  console.log('Generating answer with:', providerName);
  
  // Build system message with context
  const systemMessage = {
    role: 'system',
    content: `You are an expert interview assistant helping a candidate. Based on the conversation/question provided, give a clear, concise, and professional answer.

${pdfContext ? `CANDIDATE'S RESUME/CV (from PDF):\n${pdfContext}\n\n` : ''}${userContext ? `CANDIDATE'S ADDITIONAL CONTEXT:\n${userContext}\n\n` : ''}${(pdfContext || userContext) ? `Use this background to personalize your answers and highlight relevant experience.\n\n` : ''}GUIDELINES:
- Be direct and to the point
- Use bullet points for complex answers
- Keep answers under 1000 words unless complexity requires more
- Sound natural and confident
- If it's a technical question, provide accurate technical details
- When providing code examples, use markdown code blocks with the language specified
- Reference the candidate's experience, skills, and projects from their resume when relevant
- If this is a follow-up or counter question, consider the previous context and answers`
  };
  
  // Add current question to conversation history
  const currentQuestion = {
    role: 'user',
    content: `Here's what was said in the meeting/interview. Please provide a great answer to the latest question or topic:\n\n${currentTranscription}`
  };
  
  // Build messages array with conversation history (keep last 10 exchanges for context)
  const recentHistory = conversationHistory.slice(-10);
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
        max_tokens: 500,
        temperature: 0.7
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
    
    // Keep only last 20 messages to avoid token limits
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }
    
    responseBox.innerHTML = highlightImportantParts(answer);
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

  // Vision works with: Ollama (local) > Groq/Llama-4-Scout (free) > OpenAI gpt-4o (paid)
  if (!ollamaEnabled && !hasGroq && !hasOpenAI) {
    responseBox.innerHTML = '<span style="color: #f87171">Screenshot analysis needs one of:<br>• Groq API key (free) — already used for transcription<br>• Ollama enabled with a vision model (e.g. llava) — free & local<br>• OpenAI API key with gpt-4o access</span>';
    showStatus('No vision provider configured', 'error');
    settingsPanel.classList.add('active');
    return;
  }

  responseBox.innerHTML = '<span style="color: rgba(255,255,255,0.6)">Capturing screen...</span>';
  console.log('Starting screenshot capture...');

  try {
    const sources = await ipcRenderer.invoke('get-sources');
    console.log('Available sources:', sources.map(s => s.name));

    // Get the entire screen - look for "Entire screen" specifically
    const screenSource = sources.find(s =>
      s.name.toLowerCase().includes('entire') ||
      s.name.toLowerCase().includes('screen') ||
      s.name.toLowerCase().includes('display')
    ) || sources[sources.length - 1]; // Last source is usually the screen

    console.log('Using source:', screenSource?.name);

    if (!screenSource) {
      throw new Error('No screen source. Grant Screen Recording permission.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSource.id
        }
      }
    });
    console.log('Screen stream obtained');

    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    stream.getTracks().forEach(track => track.stop());

    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    const base64Image = imageData.split(',')[1];

    // Choose vision provider: Ollama (local free) > Groq (cloud free) > OpenAI (paid)
    let visionUrl, visionKey, visionModel, providerName;
    if (ollamaEnabled) {
      visionUrl = `${ollamaUrl}/chat/completions`;
      visionKey = 'ollama';
      visionModel = ollamaVisionModel;
      providerName = `Ollama (${ollamaVisionModel})`;
    } else if (hasGroq) {
      visionUrl = `${GROQ_API_URL}/chat/completions`;
      visionKey = groqApiKey;
      visionModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
      providerName = 'Groq (Llama 4 Scout — free)';
    } else {
      visionUrl = `${OPENAI_API_URL}/chat/completions`;
      visionKey = apiKey;
      visionModel = 'gpt-4o';
      providerName = 'OpenAI (gpt-4o)';
    }

    console.log('Sending to vision provider:', providerName);
    responseBox.innerHTML = `<span style="color: rgba(255,255,255,0.6)">Analyzing with ${providerName}...</span>`;

    const response = await fetch(visionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${visionKey}`
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'You are an expert interview assistant. Analyze this screenshot and provide helpful information. If there is a coding problem, provide the solution. If there is a question, answer it. Be concise and actionable.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      })
    });

    console.log('Vision API response status:', response.status);
    const responseText = await response.text();

    if (!response.ok) {
      let hint = '';
      if (ollamaEnabled) {
        hint = `Make sure "${ollamaVisionModel}" is pulled: run <b>ollama pull ${ollamaVisionModel}</b> in terminal.`;
      } else if (hasGroq) {
        hint = 'Groq vision request failed. Check your Groq API key is valid.';
      }
      responseBox.innerHTML = `<span style="color: #f87171">Vision API error (${response.status}). ${hint}</span>`;
      showStatus('Vision error', 'error');
      return;
    }

    const data = JSON.parse(responseText);
    const analysis = data.choices[0].message.content;
    responseBox.innerHTML = highlightImportantParts(analysis);
    showStatus('Screenshot analyzed!', 'success');

  } catch (error) {
    console.error('Screenshot analysis error:', error);
    let msg = 'Error analyzing screenshot.';
    if (error.message && error.message.includes('fetch')) {
      msg = ollamaEnabled
        ? 'Cannot reach Ollama. Make sure it is running: <b>ollama serve</b>'
        : 'Network error. Check your connection.';
    } else {
      msg += ' Check screen recording permissions.';
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
