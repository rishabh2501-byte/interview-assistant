const { ipcRenderer } = require('electron');

// State
let isCapturing = false;
let audioStream = null;
let transcriptionText = '';

// API Keys
// Groq: FREE Whisper + LLM - get key from console.groq.com
// OpenAI: Paid but reliable
let groqApiKey = localStorage.getItem('groq_api_key') || '';
let apiKey = localStorage.getItem('openai_api_key') || '';

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
  localStorage.setItem('openai_api_key', apiKey);
  localStorage.setItem('groq_api_key', groqApiKey);
  showStatus('Keys saved!', 'success');
  settingsPanel.classList.remove('active');
  console.log('API Key saved:', apiKey ? 'Yes' : 'No');
  console.log('Groq Key saved:', groqApiKey ? 'Yes' : 'No');
});

// Clear Transcript
clearTranscriptBtn.addEventListener('click', () => {
  transcriptionText = '';
  transcriptionBox.innerHTML = '<p class="placeholder">Audio transcription will appear here...</p>';
});

// Copy Response
copyResponseBtn.addEventListener('click', () => {
  const text = responseBox.innerText;
  if (text && !text.includes('will appear here')) {
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
    transcriptionBox.innerHTML = `<p class="error">Microphone error: ${error.message}</p>`;
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
    transcriptionBox.innerHTML = `<p class="error">No API key! Get FREE key from <a href="https://console.groq.com" target="_blank" style="color:#60a5fa">console.groq.com</a></p>`;
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
  transcriptionBox.innerHTML = `<p>${text}</p>`;
  transcriptionBox.scrollTop = transcriptionBox.scrollHeight;
}

// Generate AI Answer
async function generateAIAnswer() {
  const hasGroq = groqApiKey && groqApiKey.length > 10;
  const hasOpenAI = apiKey && apiKey.length > 10;
  
  if (!hasGroq && !hasOpenAI) {
    showStatus('No API key set', 'error');
    settingsPanel.classList.add('active');
    return;
  }

  if (!transcriptionText.trim()) {
    showStatus('No transcription yet', 'error');
    return;
  }

  responseBox.innerHTML = '<div class="loading"></div> Generating answer...';
  
  // Use Groq (free) or OpenAI
  const chatUrl = hasGroq ? `${GROQ_API_URL}/chat/completions` : `${OPENAI_API_URL}/chat/completions`;
  const chatKey = hasGroq ? groqApiKey : apiKey;
  const chatModel = hasGroq ? 'llama-3.3-70b-versatile' : 'gpt-3.5-turbo';
  
  console.log('Generating answer with:', hasGroq ? 'Groq (FREE)' : 'OpenAI');
  
  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${chatKey}`
      },
      body: JSON.stringify({
        model: chatModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert interview assistant helping a candidate. Based on the conversation/question provided, give a clear, concise, and professional answer.

${userContext ? `CANDIDATE'S BACKGROUND:\n${userContext}\n\nUse this background to personalize your answers and highlight relevant experience.\n\n` : ''}GUIDELINES:
- Be direct and to the point
- Use bullet points for complex answers
- Keep answers under 550 words unless complexity requires more
- Sound natural and confident
- If it's a technical question, provide accurate technical details
- Reference the candidate's experience when relevant`
          },
          {
            role: 'user',
            content: `Here's what was said in the meeting/interview. Please provide a great answer to the latest question or topic:\n\n${transcriptionText}`
          }
        ],
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
    responseBox.innerHTML = `<p>${answer.replace(/\n/g, '<br>')}</p>`;
    showStatus('✓ Answer ready!', 'success');

  } catch (error) {
    console.error('AI Answer error:', error);
    responseBox.innerHTML = '<p class="error">Error generating answer. Check API key.</p>';
    showStatus('Error', 'error');
  }
}

// Capture and Analyze Screenshot
async function captureAndAnalyzeScreenshot() {
  const hasGroq = groqApiKey && groqApiKey.length > 10;
  const hasOpenAI = apiKey && apiKey.length > 10;
  
  if (!hasOpenAI) {
    // Vision requires OpenAI - Groq doesn't support vision yet
    responseBox.innerHTML = '<p class="error">Screenshot analysis requires OpenAI API key (Groq doesn\'t support vision yet)</p>';
    showStatus('Need OpenAI key for vision', 'error');
    settingsPanel.classList.add('active');
    return;
  }

  responseBox.innerHTML = '<div class="loading"></div> Capturing screen...';
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

    console.log('Sending to OpenAI Vision...');
    const response = await fetch(`${OPENAI_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
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
    console.log('Vision API response:', responseText);

    if (!response.ok) {
      // If gpt-4o fails, show the error
      responseBox.innerHTML = `<p class="error">API Error: ${response.status}. Vision model may not be available on this API.</p>`;
      showStatus('Vision not available', 'error');
      return;
    }

    const data = JSON.parse(responseText);
    const analysis = data.choices[0].message.content;
    responseBox.innerHTML = `<p>${analysis.replace(/\n/g, '<br>')}</p>`;
    showStatus('Screenshot analyzed!', 'success');

  } catch (error) {
    console.error('Screenshot analysis error:', error);
    responseBox.innerHTML = '<p class="placeholder">Error analyzing screenshot. Check permissions.</p>';
    showStatus('Error analyzing screenshot', 'error');
  }
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

// Draggable window (backup for non-native drag)
let isDragging = false;
let dragStartX, dragStartY;

document.getElementById('drag-handle').addEventListener('mousedown', (e) => {
  if (e.target.classList.contains('control-btn')) return;
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const deltaX = e.clientX - dragStartX;
  const deltaY = e.clientY - dragStartY;
  ipcRenderer.send('move-window', { x: deltaX, y: deltaY });
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});
