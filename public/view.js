const messagesEl = document.getElementById("chat-messages");
const overlayStopBtn = document.getElementById("overlay-stop-btn");
const overlayStopBtnDefaultLabel =
  overlayStopBtn?.textContent?.trim() && overlayStopBtn.textContent.trim().length > 0
    ? overlayStopBtn.textContent.trim()
    : "Stop";
const messagePopupOverlay = document.getElementById("message-popup-overlay");
const messagePopupBackdrop = messagePopupOverlay?.querySelector(".message-popup-backdrop");
const messagePopupContent = messagePopupOverlay?.querySelector(".message-popup-content");
const messagePopupClose = messagePopupOverlay?.querySelector(".message-popup-close");
const messagePopupUsername = messagePopupOverlay?.querySelector(".message-popup-username");
const messagePopupText = messagePopupOverlay?.querySelector(".message-popup-text");
const CONTROL_CHANNEL_NAME = "fakechat-control";
const CONTROL_MESSAGE_TYPES = Object.freeze({
  stop: "stop-stt",
});
const STOP_FEEDBACK_TIMEOUT_MS = 2500;

const controlChannel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(CONTROL_CHANNEL_NAME)
    : null;
let stopButtonResetHandle = null;
const MAX_MESSAGES = 50;
const ROLE_CLASSES = Object.freeze({
  bot: "message--bot",
  moderator: "message--moderator",
  streamer: "message--streamer",
});
const ROLE_BADGES = Object.freeze({
  bot: { label: "AI", className: "badge--bot", useImage: true },
  moderator: { label: "Mod", className: "badge--moderator" },
  streamer: { label: "Host", className: "badge--streamer" },
});
const TWITCH_USERNAME_COLORS = [
  "#FF7F50",
  "#FF4500",
  "#FFD700",
  "#00FF7F",
  "#1E90FF",
  "#DA70D6",
  "#7B68EE",
  "#FF69B4",
  "#00CED1",
  "#ADFF2F",
  "#FF8C00",
  "#AFEEEE",
  "#E9967A",
  "#9ACD32",
  "#20B2AA",
];

const userColorCache = new Map();
const messageIdSet = new Set();
const reduceMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

// Scroll tracking constants
const SCROLL_THRESHOLD = 50; // pixels from bottom to consider "at bottom"
let isUserScrolling = false;
let scrollTimeout = null;

let eventSource = null;
let reconnectTimeout = null;

function connectEventSource() {
  if (eventSource) {
    eventSource.close();
  }

  const url = `${window.location.origin}/api/events`;
  eventSource = new EventSource(url);

  eventSource.addEventListener("open", () => {
    console.info("[Overlay] Connected to chat feed");
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  });

  eventSource.addEventListener("error", (error) => {
    console.warn("[Overlay] Connection error", error);
    eventSource.close();
    eventSource = null;
    
    // Reconnect after delay
    if (!reconnectTimeout) {
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connectEventSource();
      }, 2000);
    }
  });

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleSocketPayload(payload);
    } catch (error) {
      console.error("[Overlay] Failed to parse message", error);
    }
  };
}

function handleSocketPayload(payload) {
  switch (payload?.type) {
    case "chat_history": {
      renderHistory(Array.isArray(payload.data) ? payload.data : []);
      break;
    }
    case "chat_message": {
      renderIncomingMessage(payload.data);
      break;
    }
    case "chat_purge": {
      messageIdSet.clear();
      messagesEl.innerHTML = "";
      scrollToBottom(true);
      break;
    }
    default:
      console.warn("[Overlay] Unknown payload type", payload);
  }
}

function renderHistory(history) {
  messageIdSet.clear();
  messagesEl.innerHTML = "";
  const sorted = [...history].sort((a, b) => {
    const t1 = typeof a?.timestamp === "number" ? a.timestamp : 0;
    const t2 = typeof b?.timestamp === "number" ? b.timestamp : 0;
    return t1 - t2;
  });
  // Render all messages without auto-scrolling during render
  sorted.forEach((message) => renderIncomingMessage(message, { skipDuplicateCheck: true, skipScroll: true }));
  // Scroll to bottom once after all history is rendered
  scrollToBottom(true);
}

function renderIncomingMessage(rawMessage, { skipDuplicateCheck = false, skipScroll = false } = {}) {
  const message = normalizeMessage(rawMessage);
  if (!message) {
    return;
  }

  if (message.role === "streamer") {
    return;
  }

  if (!skipDuplicateCheck && messageIdSet.has(message.id)) {
    return;
  }

  messageIdSet.add(message.id);

  const element = createMessageElement(message);
  messagesEl.appendChild(element);
  pruneOldMessages();
  // Auto-scroll to bottom if user is already at bottom (unless skipScroll is true)
  if (!skipScroll) {
    scrollToBottom();
  }
}

function createMessageElement(message) {
  const li = document.createElement("li");
  li.classList.add("message");
  li.dataset.messageId = message.id;
  
  // Store message data for popup
  li.dataset.messageUsername = message.username;
  li.dataset.messageContent = message.content;
  li.dataset.messageRole = message.role;

  const roleClass = ROLE_CLASSES[message.role];
  if (roleClass) {
    li.classList.add(roleClass);
  }

  if (reduceMotion) {
    li.style.animation = "none";
    li.style.opacity = "1";
    li.style.transform = "none";
  }

  const badgesEl = createBadges(message.role);
  if (badgesEl) {
    li.appendChild(badgesEl);
  }

  const usernameEl = document.createElement("span");
  usernameEl.className = "message__username";
  usernameEl.textContent = message.username;
  usernameEl.style.color = getUserColor(message.username, message.role);
  li.appendChild(usernameEl);

  const contentEl = document.createElement("span");
  contentEl.className = "message__content";
  contentEl.textContent = message.content;
  li.appendChild(contentEl);

  // Add click event listener to open popup
  li.addEventListener("click", () => {
    openMessagePopup({
      username: message.username,
      content: message.content,
      role: message.role,
    });
  });

  return li;
}

function createBadges(role) {
  const badgeDefinition = ROLE_BADGES[role];
  if (!badgeDefinition) {
    return null;
  }

  const wrapper = document.createElement("span");
  wrapper.className = "message__badges";

  const badge = document.createElement("span");
  badge.className = `badge ${badgeDefinition.className}`;
  
  if (badgeDefinition.useImage) {
    const img = document.createElement("img");
    img.src = "/static/sword.svg";
    img.alt = badgeDefinition.label;
    img.className = "badge__image";
    badge.appendChild(img);
  } else {
    badge.textContent = badgeDefinition.label;
  }

  wrapper.appendChild(badge);
  return wrapper;
}

function pruneOldMessages() {
  while (messagesEl.children.length > MAX_MESSAGES) {
    const firstChild = messagesEl.firstElementChild;
    if (!firstChild) {
      break;
    }
    const messageId = firstChild.dataset.messageId;
    if (messageId) {
      messageIdSet.delete(messageId);
    }
    messagesEl.removeChild(firstChild);
  }
}

function getUserColor(username, role) {
  if (role === "bot") {
    return "#f4f6ff";
  }
  if (role === "moderator") {
    return "#7dffc9";
  }
  if (role === "streamer") {
    return "#ffe082";
  }

  const cacheKey = username.toLowerCase();
  if (!userColorCache.has(cacheKey)) {
    const hash = hashString(cacheKey);
    const color = TWITCH_USERNAME_COLORS[Math.abs(hash) % TWITCH_USERNAME_COLORS.length];
    userColorCache.set(cacheKey, color);
  }
  return userColorCache.get(cacheKey);
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function normalizeMessage(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id = typeof raw.id === "string" ? raw.id : null;
  const username = typeof raw.username === "string" ? raw.username.trim() : "";
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  const role =
    raw.role === "bot" || raw.role === "moderator" || raw.role === "streamer"
      ? raw.role
      : "viewer";

  if (!id || !username || !content) {
    return null;
  }

  return {
    id,
    username,
    content,
    role,
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
  };
}

function isAtBottom(threshold = SCROLL_THRESHOLD) {
  if (!messagesEl) {
    return false;
  }
  const { scrollTop, scrollHeight, clientHeight } = messagesEl;
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

function scrollToBottom(force = false) {
  if (!messagesEl) {
    return;
  }
  // Only auto-scroll if user is at bottom or force is true
  if (force || (!isUserScrolling && isAtBottom())) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

// Add scroll event listener to track manual scrolling
if (messagesEl) {
  messagesEl.addEventListener("scroll", () => {
    // Mark that user is manually scrolling
    isUserScrolling = true;
    
    // Clear existing timeout
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
    // Reset scrolling flag after user stops scrolling
    scrollTimeout = window.setTimeout(() => {
      isUserScrolling = false;
      // If user scrolled back to bottom, resume auto-scroll
      if (isAtBottom()) {
        scrollToBottom();
      }
    }, 150);
  });
}

function openMessagePopup(message) {
  if (!messagePopupOverlay || !messagePopupUsername || !messagePopupText) {
    return;
  }

  // Clear existing content
  messagePopupUsername.innerHTML = "";
  
  // Add sword image
  const swordImg = document.createElement("img");
  swordImg.src = "/static/sword.svg";
  swordImg.alt = "";
  swordImg.className = "message-popup-username__sword";
  messagePopupUsername.appendChild(swordImg);
  
  // Add username text
  const usernameText = document.createElement("span");
  usernameText.textContent = message.username;
  usernameText.style.color = getUserColor(message.username, message.role);
  messagePopupUsername.appendChild(usernameText);

  // Set the message text
  messagePopupText.textContent = message.content;

  // Reset animation and show the popup
  messagePopupOverlay.style.animation = "fadeIn 200ms ease forwards";
  messagePopupOverlay.style.display = "flex";
  
  // Prevent body scroll when popup is open
  document.body.style.overflow = "hidden";
}

function closeMessagePopup() {
  if (!messagePopupOverlay) {
    return;
  }

  // Hide the popup after animation
  setTimeout(() => {
    messagePopupOverlay.style.display = "none";
    document.body.style.overflow = "";
  }, 200);
  
  // Trigger fade out animation
  messagePopupOverlay.style.animation = "fadeOut 200ms ease forwards";
}

// Set up popup close handlers
if (messagePopupOverlay) {
  messagePopupOverlay.addEventListener("click", (e) => {
    // Close if clicking on the overlay itself or the backdrop (but not the content)
    if (e.target === messagePopupOverlay || e.target === messagePopupBackdrop) {
      closeMessagePopup();
    }
  });
}

if (messagePopupClose) {
  messagePopupClose.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMessagePopup();
  });
}

// Prevent closing when clicking on popup content
if (messagePopupContent) {
  messagePopupContent.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

connectEventSource();

if (overlayStopBtn) {
  overlayStopBtn.addEventListener("click", () => {
    if (!controlChannel) {
      console.warn("[Overlay] BroadcastChannel unavailable; cannot signal stop.");
      overlayStopBtn.disabled = true;
      overlayStopBtn.textContent = "Unavailable";
      return;
    }

    controlChannel.postMessage({ type: CONTROL_MESSAGE_TYPES.stop, source: "overlay" });
    overlayStopBtn.disabled = true;
    overlayStopBtn.textContent = "Stopping…";
    if (stopButtonResetHandle) {
      clearTimeout(stopButtonResetHandle);
    }
    stopButtonResetHandle = window.setTimeout(() => {
      overlayStopBtn.disabled = false;
      overlayStopBtn.textContent = overlayStopBtnDefaultLabel;
    }, STOP_FEEDBACK_TIMEOUT_MS);
  });
}

