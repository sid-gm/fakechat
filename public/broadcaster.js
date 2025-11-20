const recordBtn = document.getElementById("record-btn");
const stopBtn = document.getElementById("stop-btn");
const statusEl = document.getElementById("connection-status");
const transcriptList = document.getElementById("transcript-list");
const pendingEl = document.getElementById("pending-segment");
const eventLogEl = document.getElementById("event-log");
const clearLogBtn = document.getElementById("clear-log-btn");
const purgeChatBtn = document.getElementById("purge-chat-btn");
const purgeStatusEl = document.getElementById("purge-status");

const STATUS_CLASSES = ["status--idle", "status--recording", "status--error"];
const MIN_SENTENCE_LENGTH = 4;
const MAX_LOG_LINES = 200;
const SENTENCE_REGEX = /[^.!?]+[.!?]+/g;
const CHUNK_TIMESLICE_MS = 5000;
const MAX_EMITTED_HISTORY = 50;

const CONTROL_CHANNEL_NAME = "fakechat-control";
const CONTROL_MESSAGE_TYPES = Object.freeze({
  stop: "stop-stt",
});

const controlChannel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(CONTROL_CHANNEL_NAME)
    : null;

const state = {
  displayName: "",
  mediaRecorder: null,
  chunks: [],
  isRecording: false,
  stream: null,
  transcriptionQueue: Promise.resolve(),
  lastTranscript: "",
  pendingBuffer: "",
  headerChunk: null,
  uploadCursor: 0,
  emittedHistory: [],
};

function setStatus(mode, label) {
  STATUS_CLASSES.forEach((className) => statusEl.classList.remove(className));
  statusEl.classList.add(`status--${mode}`);
  statusEl.textContent = label;
}

function logEvent(tag, details = "") {
  const lines = eventLogEl.textContent.split("\n").filter(Boolean);
  const stamp = new Date().toLocaleTimeString();
  const entry = details ? `[${stamp}] ${tag} » ${details}` : `[${stamp}] ${tag}`;
  lines.unshift(entry);
  if (lines.length > MAX_LOG_LINES) {
    lines.length = MAX_LOG_LINES;
  }
  eventLogEl.textContent = `${lines.join("\n")}\n`;
}

function updatePendingDisplay(text) {
  pendingEl.textContent = text || "";
}

function appendTranscriptItem(text) {
  const li = document.createElement("li");
  li.textContent = text;
  transcriptList.prepend(li);
  while (transcriptList.children.length > 25) {
    transcriptList.removeChild(transcriptList.lastElementChild);
  }
}

function resetRecorder() {
  if (state.mediaRecorder) {
    state.mediaRecorder.ondataavailable = null;
    state.mediaRecorder.onstop = null;
    state.mediaRecorder.onerror = null;
    state.mediaRecorder = null;
  }
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  state.chunks = [];
  state.isRecording = false;
  state.lastTranscript = "";
  state.pendingBuffer = "";
  state.headerChunk = null;
  state.uploadCursor = 0;
  state.transcriptionQueue = Promise.resolve();
  state.emittedHistory = [];
  updatePendingDisplay("");
  recordBtn.disabled = false;
  stopBtn.disabled = true;
}

async function sendTranscriptToChat(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < MIN_SENTENCE_LENGTH) {
    return;
  }

  if (state.emittedHistory.includes(trimmed)) {
    return;
  }
  state.emittedHistory.push(trimmed);
  if (state.emittedHistory.length > MAX_EMITTED_HISTORY) {
    state.emittedHistory.shift();
  }

  appendTranscriptItem(trimmed);
  logEvent("transcript", trimmed);

  try {
    const response = await fetch("/realtime/transcript", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: trimmed,
        username: state.displayName || undefined,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`inject failed (${response.status}): ${errorBody}`);
    }
  } catch (error) {
    logEvent("transcript:error", error instanceof Error ? error.message : String(error));
  }
}

function splitIntoSentences(text) {
  const sentences = [];
  let consumedIndex = 0;
  let match;

  SENTENCE_REGEX.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = SENTENCE_REGEX.exec(text)) !== null) {
    sentences.push(match[0].trim());
    consumedIndex = SENTENCE_REGEX.lastIndex;
  }

  const remainder = text.slice(consumedIndex).trim();
  if (remainder) {
    sentences.push(remainder);
  }

  return sentences;
}

function processPendingBuffer({ force = false } = {}) {
  if (!state.pendingBuffer) {
    updatePendingDisplay("");
    return;
  }

  const sentences = [];
  let consumedIndex = 0;
  let match;

  SENTENCE_REGEX.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = SENTENCE_REGEX.exec(state.pendingBuffer)) !== null) {
    sentences.push(match[0].trim());
    consumedIndex = SENTENCE_REGEX.lastIndex;
  }

  const remainder = state.pendingBuffer.slice(consumedIndex).trim();
  const shouldHoldRemainder = !force && remainder && !/[.!?]$/.test(state.pendingBuffer);

  if (shouldHoldRemainder) {
    state.pendingBuffer = remainder;
    updatePendingDisplay(remainder);
  } else {
    if (force && remainder) {
      sentences.push(remainder);
    }
    state.pendingBuffer = "";
    updatePendingDisplay("");
  }

  sentences.forEach((sentence) => {
    void sendTranscriptToChat(sentence);
  });
}

async function transcribeBlob(blob) {
  if (!blob || blob.size === 0) {
    logEvent("stt", "No audio captured");
    return;
  }

  const formData = new FormData();
  formData.append("audio", blob, `speech-${Date.now()}.webm`);
  formData.append("username", state.displayName || "");

  try {
    const response = await fetch("/speech/transcribe", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`transcription failed (${response.status}): ${errorBody}`);
    }

    const payload = await response.json();
    const transcript = payload?.text?.trim();
    if (!transcript) {
      logEvent("stt", "Transcription empty");
      return;
    }

    let delta = transcript;
    const previous = state.lastTranscript;
    if (previous) {
      if (transcript.startsWith(previous)) {
        delta = transcript.slice(previous.length);
      } else {
        let prefixLength = 0;
        const minLength = Math.min(previous.length, transcript.length);
        while (
          prefixLength < minLength &&
          previous.charCodeAt(prefixLength) === transcript.charCodeAt(prefixLength)
        ) {
          prefixLength += 1;
        }
        delta = transcript.slice(prefixLength);
      }
    }

    state.lastTranscript = transcript;

    const trimmedDelta = delta.trim();
    if (trimmedDelta) {
      state.pendingBuffer = [state.pendingBuffer, trimmedDelta].filter(Boolean).join(" ").trim();
      processPendingBuffer({ force: !state.isRecording });
    } else if (!state.isRecording) {
      processPendingBuffer({ force: true });
    }
  } catch (error) {
    logEvent("stt:error", error instanceof Error ? error.message : String(error));
    setStatus("error", "Transcription failed");
  }
}

function enqueueTranscription(blob, { force = false } = {}) {
  state.transcriptionQueue = state.transcriptionQueue
    .catch(() => undefined)
    .then(() => transcribeBlob(blob))
    .then(() => {
      if (force) {
        processPendingBuffer({ force: true });
      }
    });
}

function uploadLatestChunks({ force = false } = {}) {
  if (state.chunks.length === 0) {
    if (force) {
      processPendingBuffer({ force: true });
    }
    return;
  }

  if (!state.headerChunk) {
    state.headerChunk = state.chunks[0];
  }

  const newChunks = state.chunks.slice(state.uploadCursor);

  if (!force && newChunks.length === 0) {
    return;
  }

  if (newChunks.length === 0 && force) {
    processPendingBuffer({ force: true });
    return;
  }

  const uploadChunks =
    state.uploadCursor === 0
      ? [...state.chunks]
      : [state.headerChunk, ...newChunks];

  const mimeType =
    uploadChunks[uploadChunks.length - 1].type ||
    state.headerChunk?.type ||
    "audio/webm";

  const blob = new Blob(uploadChunks, { type: mimeType });

  const kbSize = blob.size / 1024;
  const formattedSize =
    kbSize >= 1024
      ? `${(kbSize / 1024).toFixed(2)} MB`
      : `${kbSize.toFixed(1)} KB`;
  logEvent("stt:chunk", `${formattedSize} · ${uploadChunks.length} chunk(s)`);
  enqueueTranscription(blob, { force });

  state.uploadCursor = state.chunks.length;
  state.chunks = state.headerChunk ? [state.headerChunk] : [];
  state.uploadCursor = state.headerChunk ? 1 : 0;
}

async function startRecording() {
  if (state.isRecording) {
    return;
  }

  state.displayName = "";
  state.chunks = [];
  state.headerChunk = null;
  state.uploadCursor = 0;
  state.lastTranscript = "";
  state.pendingBuffer = "";
  state.emittedHistory = [];
  state.transcriptionQueue = Promise.resolve();
  updatePendingDisplay("");

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 44100,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    logEvent("client", "Microphone access granted");
  } catch (error) {
    setStatus("error", "Microphone denied");
    logEvent("device", error instanceof Error ? error.message : String(error));
    return;
  }

  state.chunks = [];
  state.mediaRecorder = new MediaRecorder(state.stream, {
    mimeType: "audio/webm",
    audioBitsPerSecond: 128_000,
  });

  state.mediaRecorder.ondataavailable = (event) => {
    if (!event.data || event.data.size === 0) {
      return;
    }
    state.chunks.push(event.data);
    uploadLatestChunks();
  };

  state.mediaRecorder.onstop = async () => {
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus("idle", "Idle");
    uploadLatestChunks({ force: true });
  };

  state.mediaRecorder.onerror = (event) => {
    logEvent("recorder:error", event.error?.message ?? "Unknown error");
    setStatus("error", "Recorder error");
    resetRecorder();
  };

  try {
    state.mediaRecorder.start(CHUNK_TIMESLICE_MS);
    state.isRecording = true;
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus("recording", "Recording…");
    logEvent("recorder", "Recording started");
    state.lastTranscript = "";
    state.pendingBuffer = "";
    updatePendingDisplay("");
  } catch (error) {
    logEvent("recorder:error", error instanceof Error ? error.message : String(error));
    setStatus("error", "Failed to start recorder");
    resetRecorder();
  }
}

function stopRecording() {
  if (!state.isRecording || !state.mediaRecorder) {
    return;
  }

  try {
    state.mediaRecorder.stop();
    state.isRecording = false;
    logEvent("recorder", "Recording stopped");
  } catch (error) {
    logEvent("recorder:error", error instanceof Error ? error.message : String(error));
    setStatus("error", "Failed to stop recorder");
    resetRecorder();
  }
}

recordBtn.addEventListener("click", () => {
  void startRecording();
});

stopBtn.addEventListener("click", () => {
  stopRecording();
});

clearLogBtn.addEventListener("click", () => {
  eventLogEl.textContent = "";
});

async function purgeChat() {
  if (!purgeChatBtn || purgeChatBtn.disabled) {
    return;
  }

  purgeChatBtn.disabled = true;
  if (purgeStatusEl) {
    purgeStatusEl.textContent = "Purging…";
  }

  try {
    const response = await fetch("/chat/purge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || `Request failed (${response.status})`);
    }

    if (purgeStatusEl) {
      purgeStatusEl.textContent = "Chat purged";
      setTimeout(() => {
        if (purgeStatusEl) {
          purgeStatusEl.textContent = "";
        }
      }, 2000);
    }
    logEvent("purge", "Chat history and injections cleared");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to purge chat";
    if (purgeStatusEl) {
      purgeStatusEl.textContent = message;
    }
    logEvent("purge:error", message);
  } finally {
    if (purgeChatBtn) {
      purgeChatBtn.disabled = false;
    }
  }
}

if (purgeChatBtn) {
  purgeChatBtn.addEventListener("click", () => {
    void purgeChat();
  });
}

window.addEventListener("beforeunload", () => {
  resetRecorder();
});

updatePendingDisplay("");

if (controlChannel) {
  controlChannel.addEventListener("message", (event) => {
    if (event?.data?.type === CONTROL_MESSAGE_TYPES.stop) {
      logEvent("remote", "Stop requested from overlay");
      stopRecording();
    }
  });
}

