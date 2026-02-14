// State
let isListening = false;
let mediaRecorder = null;
let audioStream = null;
let transcriptionText = '';

// API Configuration
const GROQ_API_URL = 'https://api.groq.com/openai/v1';

// DOM Elements
const aiBtn = document.getElementById('ai-btn');
const ssBtn = document.getElementById('ss-btn');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const copyBtn = document.getElementById('copy-btn');
const saveContextBtn = document.getElementById('save-context-btn');
const saveBtn = document.getElementById('save-btn');
const transcriptionBox = document.getElementById('transcription');
const responseBox = document.getElementById('response');
const contextInput = document.getElementById('context');
const groqKeyInput = document.getElementById('groq-key');
const languageSelect = document.getElementById('language');
const statusEl = document.getElementById('status');

// Load saved settings
chrome.storage.local.get(['groqKey', 'language', 'context'], (result) => {
  if (result.groqKey) groqKeyInput.value = result.groqKey;
  if (result.language) languageSelect.value = result.language;
  if (result.context) contextInput.value = result.context;
});

// Save settings
saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({
    groqKey: groqKeyInput.value,
    language: languageSelect.value
  }, () => {
    showStatus('Settings saved!');
  });
});

// Save context
saveContextBtn.addEventListener('click', () => {
  chrome.storage.local.set({ context: contextInput.value }, () => {
    showStatus('Context saved!');
  });
});

// Clear transcription
clearBtn.addEventListener('click', () => {
  transcriptionText = '';
  transcriptionBox.innerHTML = '<span class="placeholder">Cleared</span>';
});

// Copy response
copyBtn.addEventListener('click', () => {
  const text = responseBox.innerText;
  navigator.clipboard.writeText(text);
  showStatus('Copied!');
});

// Toggle listening
micBtn.addEventListener('click', async () => {
  if (isListening) {
    stopListening();
  } else {
    await startListening();
  }
});

// AI Answer
aiBtn.addEventListener('click', async () => {
  await generateAIAnswer();
});

// Screenshot (capture visible tab)
ssBtn.addEventListener('click', async () => {
  await captureAndAnalyze();
});

// Show status
function showStatus(text) {
  statusEl.textContent = text;
  statusEl.classList.remove('recording');
  setTimeout(() => {
    statusEl.textContent = isListening ? 'Listening...' : 'Ready';
    if (isListening) statusEl.classList.add('recording');
  }, 2000);
}

// Start listening
async function startListening() {
  const groqKey = groqKeyInput.value || (await getStoredKey());
  if (!groqKey) {
    showStatus('Set API key first!');
    return;
  }

  try {
    // Request microphone permission
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    isListening = true;
    micBtn.classList.add('active');
    micBtn.textContent = '🔴 Stop';
    statusEl.textContent = 'Listening...';
    statusEl.classList.add('recording');

    recordAndTranscribe();
  } catch (error) {
    console.error('Mic error:', error);
    if (error.name === 'NotAllowedError') {
      showStatus('Click Allow for mic!');
      // Try again - this will show the permission prompt
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isListening = true;
        micBtn.classList.add('active');
        micBtn.textContent = '🔴 Stop';
        statusEl.textContent = 'Listening...';
        statusEl.classList.add('recording');
        recordAndTranscribe();
      } catch (e) {
        showStatus('Mic blocked - check Chrome settings');
      }
    } else {
      showStatus('Mic error: ' + error.message);
    }
  }
}

// Stop listening
function stopListening() {
  isListening = false;
  
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }

  micBtn.classList.remove('active');
  micBtn.textContent = '🎤 Listen';
  statusEl.textContent = 'Ready';
  statusEl.classList.remove('recording');
}

// Record and transcribe
function recordAndTranscribe() {
  if (!isListening || !audioStream) return;

  const chunks = [];
  mediaRecorder = new MediaRecorder(audioStream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    if (isListening) {
      recordAndTranscribe(); // Continue recording
    }

    if (chunks.length > 0) {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      if (blob.size > 500) {
        await transcribeAudio(blob);
      }
    }
  };

  mediaRecorder.start();

  setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }, 3000);
}

// Get stored API key
async function getStoredKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['groqKey'], (result) => {
      resolve(result.groqKey || '');
    });
  });
}

// Get stored settings
async function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['groqKey', 'language', 'context'], (result) => {
      resolve(result);
    });
  });
}

// Transcribe audio
async function transcribeAudio(audioBlob) {
  const settings = await getStoredSettings();
  const groqKey = settings.groqKey;
  const language = settings.language || 'en';

  if (!groqKey) return;

  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', language);

    const response = await fetch(`${GROQ_API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}` },
      body: formData
    });

    if (!response.ok) return;

    const data = await response.json();
    if (data.text && data.text.trim()) {
      const text = data.text.trim();
      
      // Filter hallucinations
      const hallucinations = [
        'thank you', 'thanks for watching', 'subscribe',
        'background sound', 'background noise', 'silence',
        'music', '[silence]', '[music]'
      ];
      
      const lowerText = text.toLowerCase();
      const isHallucination = hallucinations.some(h => lowerText.includes(h)) || text.length < 4;
      
      if (!isHallucination) {
        transcriptionText += ' ' + text;
        transcriptionBox.textContent = transcriptionText.trim();
      }
    }
  } catch (error) {
    console.error('Transcription error:', error);
  }
}

// Generate AI Answer
async function generateAIAnswer() {
  const settings = await getStoredSettings();
  const groqKey = settings.groqKey;
  const context = settings.context || '';

  if (!groqKey) {
    showStatus('Set API key first!');
    return;
  }

  if (!transcriptionText.trim()) {
    showStatus('No transcription yet');
    return;
  }

  responseBox.innerHTML = '<span class="placeholder">Generating...</span>';

  try {
    const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are an expert interview assistant.
${context ? `\nCANDIDATE'S BACKGROUND:\n${context}\n` : ''}
Give clear, concise, professional answers. Be direct. Use bullet points for complex answers.`
          },
          {
            role: 'user',
            content: `Answer this interview question/topic:\n\n${transcriptionText}`
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      responseBox.innerHTML = '<span class="placeholder">API Error</span>';
      return;
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;
    responseBox.innerHTML = answer.replace(/\n/g, '<br>');
    showStatus('Answer ready!');
  } catch (error) {
    responseBox.innerHTML = '<span class="placeholder">Error generating answer</span>';
  }
}

// Capture and analyze screenshot
async function captureAndAnalyze() {
  responseBox.innerHTML = '<span class="placeholder">Capturing...</span>';

  try {
    // Capture visible tab
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, async (dataUrl) => {
      if (chrome.runtime.lastError) {
        responseBox.innerHTML = '<span class="placeholder">Screenshot failed</span>';
        return;
      }

      const settings = await getStoredSettings();
      const groqKey = settings.groqKey;

      // Note: Groq doesn't support vision yet, so we'll just show a message
      responseBox.innerHTML = '<span class="placeholder">Screenshot captured! Vision analysis requires OpenAI API key.</span>';
      showStatus('Screenshot captured');
    });
  } catch (error) {
    responseBox.innerHTML = '<span class="placeholder">Screenshot error</span>';
  }
}
