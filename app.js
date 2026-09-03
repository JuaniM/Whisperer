/**
 * Main UI Application Controller for Whisperer Standalone Executive Dashboard.
 * Integrates Web Speech API, Question Detector, Doc Processor, and Gemini API.
 */

import { GeminiApiClient } from './modules/gemini_api.js';
import { DocProcessor } from './modules/doc_processor.js';
import { QuestionDetector } from './modules/question_detector.js';

const docProcessor = new DocProcessor();
let questionDetector = null;
let recentTranscript = [];
let copilotActive = true;
let speechRecognizer = null;
let isAudioListening = false;

// Initialize app
window.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initEventListeners();
  await loadStoredState();

  questionDetector = new QuestionDetector({
    minQuestionLength: 6,
    debounceMs: 800,
    onQuestionDetected: async (questionObj) => {
      console.log('[Whisperer] Question Detected:', questionObj);

      if (!copilotActive) {
        renderPausedNotice(questionObj.text);
        return;
      }

      renderDetectedQuestionNotice(questionObj);
      await processAndGenerateReply(questionObj.text, questionObj.speaker);
    }
  });

  initAudioListener();
});

/* Tabs Management */
function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.classList.add('active');
    });
  });
}

/* Event Listeners */
function initEventListeners() {
  document.getElementById('save-doc-btn').addEventListener('click', saveDocument);
  document.getElementById('load-sample-doc-btn').addEventListener('click', loadSampleDoc);
  document.getElementById('doc-file-input').addEventListener('change', handleFileUpload);

  document.getElementById('ask-btn').addEventListener('click', submitManualQuestion);
  document.getElementById('manual-question-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitManualQuestion();
  });

  document.getElementById('save-settings-btn').addEventListener('click', () => saveSettings(false));
  document.getElementById('test-connection-btn').addEventListener('click', testApiConnection);
  document.getElementById('fetch-models-btn').addEventListener('click', fetchAuthorizedModels);
  document.getElementById('toggle-key-visibility').addEventListener('click', toggleApiKeyVisibility);

  // Silent auto-save across input actions
  document.getElementById('api-key-input').addEventListener('input', (e) => {
    updateApiBadge(e.target.value.trim());
    saveSettings(true);
  });
  document.getElementById('api-key-input').addEventListener('change', () => saveSettings(true));
  document.getElementById('api-key-input').addEventListener('blur', () => saveSettings(true));
  document.getElementById('model-select').addEventListener('change', () => saveSettings(true));
  document.getElementById('auto-generate-toggle').addEventListener('change', () => saveSettings(true));

  // Always format as a neat, tidy Side Panel (`sidepanel-mode`) by default
  document.body.classList.add('sidepanel-mode');
}

/* State Persistence & Loader */
async function loadStoredState() {
  try {
    const settingsRaw = localStorage.getItem('whisperer_settings');
    if (settingsRaw) {
      const s = JSON.parse(settingsRaw);
      document.getElementById('api-key-input').value = s.apiKey || '';
      document.getElementById('model-select').value = s.model || 'gemini-2.0-flash';
      document.getElementById('auto-generate-toggle').checked = s.autoGenerate !== false;
      updateApiBadge(s.apiKey);
    }

    const docObj = docProcessor.loadFromStorage();
    if (docObj && docObj.rawText) {
      document.getElementById('doc-text-input').value = docObj.rawText;
      updateDocStatus(true, docObj);
    } else {
      updateDocStatus(false);
    }
  } catch (e) {
    console.warn('Failed loading stored state:', e);
  }
}

function updateApiBadge(apiKey) {
  const badge = document.getElementById('api-badge');
  if (!apiKey || apiKey.length < 10) {
    badge.className = 'badge missing';
    badge.textContent = 'API Key Needed';
  } else {
    badge.className = 'badge connected';
    badge.textContent = 'API Ready';
  }
}

function updateDocStatus(loaded, metadata = null) {
  const dot = document.getElementById('doc-status-dot');
  const text = document.getElementById('doc-status-text');
  const countBadge = document.getElementById('doc-word-count');
  const updatedText = document.getElementById('doc-last-updated');

  if (loaded && metadata) {
    dot.className = 'dot success';
    text.textContent = `Doc Active: ${metadata.fileName}`;
    countBadge.textContent = `${metadata.wordCount} words`;
    updatedText.textContent = `Last saved: ${new Date(metadata.updatedAt).toLocaleTimeString()}`;
  } else {
    dot.className = 'dot warning';
    text.textContent = 'No Document Loaded';
    countBadge.textContent = '0 words';
    updatedText.textContent = 'Not saved';
  }
}

/* Document Upload & Sample Loader */
function saveDocument() {
  const text = document.getElementById('doc-text-input').value.trim();
  if (!text) {
    alert('Please enter or paste document text before saving.');
    return;
  }

  try {
    const docObj = docProcessor.processText(text, 'Communications_Document.txt');
    docProcessor.saveToStorage(docObj);
    updateDocStatus(true, docObj);
    alert('✅ Communications Document saved and indexed successfully!');
  } catch (e) {
    alert(`❌ Failed saving document: ${e.message}`);
  }
}

function loadSampleDoc() {
  const sampleText = `# Q&A Briefing: AMP Deprecation & Monetization Impact

Q: What's the cheatcode for infinite money?
A: Klapaucius;

  document.getElementById('doc-text-input').value = sampleText;
  const docObj = docProcessor.processText(sampleText, 'Sample_FAQ_Briefing.txt');
  docProcessor.saveToStorage(docObj);
  updateDocStatus(true, docObj);
  alert('⚡ Sample FAQ loaded cleanly!');
}

function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result;
    if (typeof text === 'string') {
      document.getElementById('doc-text-input').value = text;
      const docObj = docProcessor.processText(text, file.name);
      docProcessor.saveToStorage(docObj);
      updateDocStatus(true, docObj);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

/* Settings Management */
function saveSettings(silent = false) {
  const apiKey = document.getElementById('api-key-input').value.trim();
  const model = document.getElementById('model-select').value;
  const autoGenerate = document.getElementById('auto-generate-toggle').checked;

  const s = { apiKey, model, autoGenerate };
  localStorage.setItem('whisperer_settings', JSON.stringify(s));
  updateApiBadge(apiKey);

  if (!silent) {
    alert('Settings saved successfully!');
  }
}

async function testApiConnection() {
  const apiKey = document.getElementById('api-key-input').value.trim();
  const model = document.getElementById('model-select').value;

  if (!apiKey) {
    alert('Please enter a Gemini API Key to test.');
    return;
  }

  const btn = document.getElementById('test-connection-btn');
  btn.textContent = 'Testing...';

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
    });

    if (res.ok) {
      updateApiBadge(apiKey);
      saveSettings(true);
      alert('✅ Gemini API Connection Successful!');
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`❌ API Error (${res.status}): ${err.error?.message || res.statusText}`);
    }
  } catch (e) {
    alert(`❌ Connection failed: ${e.message}`);
  } finally {
    btn.textContent = '🔌 Test API Connection';
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function fetchAuthorizedModels() {
  const apiKey = document.getElementById('api-key-input').value.trim();
  if (!apiKey) {
    alert('Please enter your Gemini API Key first.');
    return;
  }

  const btn = document.getElementById('fetch-models-btn');
  btn.textContent = '🔄 Fetching...';

  try {
    const client = new GeminiApiClient(apiKey);
    const models = await client.listAvailableModels();

    if (!models || models.length === 0) {
      alert('No generateContent models found for this API Key.');
      return;
    }

    const select = document.getElementById('model-select');
    select.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
    saveSettings(true);
    alert(`✅ Successfully loaded ${models.length} authorized models for your key! Selected: ${models[0]}`);
  } catch (err) {
    alert(`❌ Failed to fetch models: ${err.message}`);
  } finally {
    btn.textContent = '🔄 Fetch Models';
  }
}

/* Manual Question & Reply Generation */
function submitManualQuestion() {
  const input = document.getElementById('manual-question-input');
  const questionText = input.value.trim();
  if (!questionText) return;

  renderGeneratingReply(questionText, 'User');
  input.value = '';
  processAndGenerateReply(questionText, 'User');
}

async function processAndGenerateReply(questionText, speaker) {
  const settingsRaw = localStorage.getItem('whisperer_settings');
  const settings = settingsRaw ? JSON.parse(settingsRaw) : {};

  if (!settings.apiKey) {
    renderErrorCard('Missing Gemini API Key. Please enter your API key in Settings.');
    return;
  }

  const docObj = docProcessor.loadFromStorage();
  if (!docObj || !docObj.rawText) {
    renderErrorCard('No Communications Document loaded. Please upload or paste your document.');
    return;
  }

  renderGeneratingReply(questionText, speaker);

  try {
    const client = new GeminiApiClient(settings.apiKey, settings.model || 'gemini-2.0-flash');
    const reply = await client.generateGroundedReply(
      questionText,
      speaker,
      docObj.rawText,
      recentTranscript
    );

    renderSuggestedReplyCard(reply);
  } catch (error) {
    console.error('[Whisperer] Reply error:', error);
    renderErrorCard(error.message || 'Failed to generate grounded reply.');
  }
}

/* Web Speech API Live Audio Intercept Engine */
function initAudioListener() {
  const startBtn = document.getElementById('start-audio-btn');
  const stopBtn = document.getElementById('stop-audio-btn');
  const badge = document.getElementById('audio-status-badge');
  const preview = document.getElementById('audio-live-preview');
  const card = document.getElementById('audio-listener-card');

  if (!startBtn || !stopBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    preview.innerHTML = '<span style="color:#d93025;">❌ Web Speech API is not supported in this browser window. Please use desktop Chrome.</span>';
    startBtn.disabled = true;
    return;
  }

  startBtn.addEventListener('click', () => {
    try {
      if (!speechRecognizer) {
        speechRecognizer = new SpeechRecognition();
        speechRecognizer.continuous = true;
        speechRecognizer.interimResults = true;
        speechRecognizer.lang = 'en-US';

        speechRecognizer.onstart = () => {
          isAudioListening = true;
          copilotActive = true;
          badge.className = 'badge badge-audio-on';
          badge.textContent = '🟢 Listening to Audio';
          card.classList.add('listening');
          startBtn.classList.add('hidden');
          stopBtn.classList.remove('hidden');
          preview.innerHTML = '<span style="color:#34a853; font-weight:500;">🎙️ Microphone active! Speak or play meeting audio to transcribe...</span>';
        };

        speechRecognizer.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          if (interimTranscript) {
            preview.innerHTML = `<b>Live Speech:</b> <span style="color:#aaa;">"${escapeHtml(interimTranscript)}"</span>`;
          }

          if (finalTranscript && finalTranscript.trim().length > 3) {
            const cleanText = finalTranscript.trim();
            preview.innerHTML = `<b>Last Captured:</b> <span style="color:#34a853;">"${escapeHtml(cleanText)}"</span>`;
            
            const entry = {
              speaker: 'Audio Intercept',
              text: cleanText,
              timestamp: Date.now(),
              source: 'WEB_SPEECH_API'
            };

            appendTranscriptFeed(entry);
            if (copilotActive && questionDetector) {
              questionDetector.processTranscriptEntry(entry);
            }
          }
        };

        speechRecognizer.onerror = (event) => {
          console.warn('[Whisperer] Audio Listener Error:', event.error);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            isAudioListening = false;
            copilotActive = false;
            badge.className = 'badge badge-audio-off';
            badge.textContent = 'Permission Denied';
            card.classList.remove('listening');
            startBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            preview.innerHTML = '<span style="color:#d93025;">❌ Microphone access denied. Please allow microphone permissions in Chrome settings.</span>';
          }
        };

        speechRecognizer.onend = () => {
          if (isAudioListening) {
            setTimeout(() => {
              if (isAudioListening && speechRecognizer) {
                try { speechRecognizer.start(); } catch (e) {}
              }
            }, 250);
          } else {
            copilotActive = false;
            badge.className = 'badge badge-audio-off';
            badge.textContent = 'Audio OFF';
            card.classList.remove('listening');
            startBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            preview.innerHTML = '<i style="color:#777;">Audio listening stopped. Click Start to resume.</i>';
          }
        };
      }

      speechRecognizer.start();
    } catch (e) {
      console.error('[Whisperer] Speech start failed:', e);
    }
  });

  stopBtn.addEventListener('click', () => {
    isAudioListening = false;
    copilotActive = false;
    if (speechRecognizer) {
      try { speechRecognizer.stop(); } catch (e) {}
    }
    badge.className = 'badge badge-audio-off';
    badge.textContent = 'Audio OFF';
    card.classList.remove('listening');
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    preview.innerHTML = '<i style="color:#777;">Audio listening stopped. Click Start to resume.</i>';
  });
}

/* UI Rendering Helpers */
function appendTranscriptFeed(entry) {
  recentTranscript.push(entry);
  if (recentTranscript.length > 25) recentTranscript.shift();

  const feed = document.getElementById('live-transcript-feed');
  if (!feed) return;

  if (feed.querySelector('div[style*="text-align:center"]')) {
    feed.innerHTML = '';
  }

  const item = document.createElement('div');
  item.className = 'transcript-item';
  const timeStr = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  item.innerHTML = `<span class="speaker">${entry.speaker}</span> <span class="time">[${timeStr}]</span>: ${entry.text}`;
  feed.appendChild(item);
  feed.scrollTop = feed.scrollHeight;
}

function renderDetectedQuestionNotice(questionObj) {
  const container = document.getElementById('active-reply-container');
  container.className = 'card reply-card state-generating';
  container.innerHTML = `
    <div class="card-header">
      <span class="badge" style="background:#f2994a; color:#fff;">⚡ Question Detected</span>
      <span style="font-weight:600; color:#aaa;">${questionObj.speaker}</span>
    </div>
    <div class="detected-question">"${escapeHtml(questionObj.text)}"</div>
    <div style="padding:12px 0; color:#aaa;">Checking Communications Document...</div>
  `;
}

function renderGeneratingReply(question, speaker) {
  const container = document.getElementById('active-reply-container');
  container.className = 'card reply-card state-generating';
  container.innerHTML = `
    <div class="card-header">
      <span class="badge" style="background:#f2994a; color:#fff;">🔄 Generating Reply...</span>
      <span style="font-weight:600; color:#aaa;">${speaker || 'Speaker'}</span>
    </div>
    <div class="detected-question">"${escapeHtml(question)}"</div>
    <div style="padding:12px 0; color:#aaa;">Synthesizing grounded executive response from document facts...</div>
  `;
}

function renderPausedNotice(question) {
  const container = document.getElementById('active-reply-container');
  container.className = 'card reply-card';
  container.innerHTML = `
    <div class="card-header">
      <span class="badge" style="background:#555; color:#ddd;">⏸️ Audio Listening Paused</span>
    </div>
    <div class="detected-question">"${escapeHtml(question)}"</div>
    <div style="padding:12px 0; color:#aaa; font-size:13px;">
      Question detected while listening is stopped. Click <b>▶️ Start Audio Listening</b> above to resume automatic reply generation.
    </div>
  `;
}

function renderErrorCard(errorMessage) {
  const container = document.getElementById('active-reply-container');
  container.className = 'card reply-card state-error';
  container.innerHTML = `
    <div class="card-header">
      <span class="badge" style="background:#d93025; color:#fff;">⚠️ Generation Error</span>
    </div>
    <div style="padding:12px 0; color:#f87171;">${escapeHtml(errorMessage)}</div>
  `;
}

function renderSuggestedReplyCard(replyObj) {
  const container = document.getElementById('active-reply-container');
  container.className = 'card reply-card state-ready';

  let scoreClass = 'conf-high';
  if (replyObj.confidenceScore < 70 && replyObj.confidenceScore >= 40) scoreClass = 'conf-medium';
  if (replyObj.confidenceScore < 40) scoreClass = 'conf-low';

  const bulletsHtml = (replyObj.bulletPoints && replyObj.bulletPoints.length > 0)
    ? `<ul class="bullet-list">${replyObj.bulletPoints.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
    : '';

  container.innerHTML = `
    <div class="card-header">
      <span class="badge" style="background:#1a73e8; color:#fff;">🎯 Grounded Reply Suggestion</span>
      <span class="confidence-badge ${scoreClass}">Grounded Confidence: ${replyObj.confidenceScore}%</span>
    </div>
    <div class="detected-question">
      <b>${escapeHtml(replyObj.speaker || 'Question')}:</b> "${escapeHtml(replyObj.question || '')}"
    </div>
    <div class="suggested-reply-text">${escapeHtml(replyObj.suggestedReply)}</div>
    ${bulletsHtml}
    <div style="margin-top:16px;">
      <button class="btn btn-secondary copy-reply-btn">📋 Copy Reply</button>
    </div>
  `;

  container.querySelector('.copy-reply-btn').addEventListener('click', (e) => {
    navigator.clipboard.writeText(replyObj.suggestedReply);
    e.target.textContent = '✅ Copied!';
    setTimeout(() => { e.target.textContent = '📋 Copy Reply'; }, 2000);
  });

  const followupContainer = document.getElementById('followup-card-container');
  if (replyObj.anticipatedFollowup && replyObj.anticipatedFollowupReply && followupContainer) {
    followupContainer.innerHTML = `
      <div class="card" style="border-left: 4px solid #8ab4f8; margin-top:20px; background:#181c24;">
        <div class="card-header" style="margin-bottom:10px;">
          <span style="font-weight:700; color:#8ab4f8; font-size:14px;">🔮 Potential Follow-Up Question & Suggested Reply</span>
        </div>
        <div style="font-size:14px; margin-bottom:10px; color:#ddd;"><b>If asked next:</b> "${escapeHtml(replyObj.anticipatedFollowup)}"</div>
        <div style="font-size:15px; color:#fff; font-weight:500; margin-bottom:14px;"><b>Suggested Reply:</b> "${escapeHtml(replyObj.anticipatedFollowupReply)}"</div>
        <div>
          <button class="btn btn-secondary copy-followup-btn" style="font-size:13px; padding:6px 14px;">📋 Copy Follow-Up Reply</button>
        </div>
      </div>
    `;

    const followupBtn = followupContainer.querySelector('.copy-followup-btn');
    if (followupBtn) {
      followupBtn.addEventListener('click', (e) => {
        navigator.clipboard.writeText(replyObj.anticipatedFollowupReply);
        e.target.textContent = '✅ Copied!';
        setTimeout(() => { e.target.textContent = '📋 Copy Follow-Up Reply'; }, 2000);
      });
    }
  } else if (followupContainer) {
    followupContainer.innerHTML = '';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
