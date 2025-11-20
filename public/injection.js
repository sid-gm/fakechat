const form = document.getElementById("injection-form");
const textarea = document.getElementById("injection-text");
const statusEl = document.getElementById("injection-status");
const pillsContainer = document.getElementById("template-pills");
const submitBtn = form?.querySelector('button[type="submit"]');
const persistBtn = document.getElementById("persist-btn");
const timerLimitSelect = document.getElementById("timer-limit-select");
const timerCustomInput = document.getElementById("timer-custom-input");

const TEMPLATES = [
  "pretend like I just said something super absurd. react accordingly.",
  "spam 'W'. Vary the format in 'W' or 'WWWWWW'.",
  "spam 😭. Vary the format in '😭' or '😭😭😭' ",
  "spam 'kys'. Vary the format in 'kys' in 'kys bro'",
  "spam L. Vary the format in 'L' or 'LLLLL'",
  "spam holy 🌽🏀",
  "spam 💀. Vary the format in '💀' or '💀💀💀💀'",
  "spam 💯 or 🤌🏼",
  "spam 🤣",
];

if (!form || !textarea || !statusEl || !pillsContainer || !submitBtn || !persistBtn || !timerLimitSelect || !timerCustomInput) {
  throw new Error("Injection UI missing required elements.");
}

// Persist state
let isPersisting = false;
let persistIntervalId = null;
let persistCountdownIntervalId = null;
let persistEndTime = null;

function setStatus(message, variant = "") {
  statusEl.textContent = message;
  if (!variant) {
    statusEl.removeAttribute("data-variant");
    return;
  }
  statusEl.setAttribute("data-variant", variant);
}

function setBusy(isBusy) {
  submitBtn.disabled = isBusy;
  textarea.disabled = isBusy;
  pillsContainer.querySelectorAll("button").forEach((pill) => {
    pill.disabled = isBusy;
  });
}

function parseTimerLimit() {
  const selectedValue = timerLimitSelect.value;
  
  if (selectedValue === "custom") {
    const customValue = timerCustomInput.value.trim();
    if (!customValue) {
      return null;
    }
    
    // Parse M:SS format
    const match = customValue.match(/^(\d+):([0-5][0-9])$/);
    if (!match) {
      return null;
    }
    
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    return minutes * 60 + seconds;
  }
  
  return parseInt(selectedValue, 10);
}

function formatTimeRemaining(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function updatePersistCountdown() {
  if (!isPersisting || !persistEndTime) {
    return;
  }
  
  const now = Date.now();
  const remaining = Math.max(0, Math.ceil((persistEndTime - now) / 1000));
  
  if (remaining <= 0) {
    stopPersist();
    return;
  }
  
  setStatus(`Persisting... ${formatTimeRemaining(remaining)} remaining`, "persist");
}

function startPersist() {
  if (isPersisting) {
    stopPersist();
    return;
  }
  
  const content = textarea.value.trim();
  if (!content) {
    setStatus("Enter an instruction first.", "error");
    return;
  }
  
  const durationSeconds = parseTimerLimit();
  if (!durationSeconds || durationSeconds <= 0) {
    setStatus("Please select a valid persist duration.", "error");
    return;
  }
  
  isPersisting = true;
  persistEndTime = Date.now() + durationSeconds * 1000;
  
  // Update button state
  persistBtn.textContent = "Stop";
  persistBtn.classList.add("injection-btn--persisting");
  submitBtn.disabled = true;
  textarea.disabled = true;
  timerLimitSelect.disabled = true;
  timerCustomInput.disabled = true;
  pillsContainer.querySelectorAll("button").forEach((pill) => {
    pill.disabled = true;
  });
  
  // Send first injection immediately
  sendInjection(content).catch((error) => {
    const message = error instanceof Error ? error.message : "Failed to inject instruction.";
    setStatus(message, "error");
  });
  
  // Set up interval to send every 1.5 seconds
  persistIntervalId = setInterval(() => {
    if (!isPersisting) {
      return;
    }
    
    const now = Date.now();
    if (now >= persistEndTime) {
      stopPersist();
      return;
    }
    
    sendInjection(content).catch((error) => {
      console.error("Persist injection error:", error);
    });
  }, 1500);
  
  // Set up countdown update every second
  persistCountdownIntervalId = setInterval(() => {
    updatePersistCountdown();
  }, 1000);
  
  updatePersistCountdown();
}

function stopPersist() {
  if (!isPersisting) {
    return;
  }
  
  isPersisting = false;
  
  if (persistIntervalId !== null) {
    clearInterval(persistIntervalId);
    persistIntervalId = null;
  }
  
  if (persistCountdownIntervalId !== null) {
    clearInterval(persistCountdownIntervalId);
    persistCountdownIntervalId = null;
  }
  
  persistEndTime = null;
  
  // Reset button state
  persistBtn.textContent = "Persist";
  persistBtn.classList.remove("injection-btn--persisting");
  submitBtn.disabled = false;
  textarea.disabled = false;
  timerLimitSelect.disabled = false;
  timerCustomInput.disabled = false;
  pillsContainer.querySelectorAll("button").forEach((pill) => {
    pill.disabled = false;
  });
  
  setStatus("Persist stopped.", "success");
}

async function sendInjection(content) {
  const response = await fetch("/injection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const message = errorText || `Request failed (${response.status})`;
    throw new Error(message);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const content = textarea.value.trim();

  if (!content) {
    setStatus("Enter an instruction first.", "error");
    return;
  }

  setBusy(true);
  setStatus("Injecting…");

  try {
    await sendInjection(content);
    textarea.value = "";
    setStatus("Instruction injected.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to inject instruction.";
    setStatus(message, "error");
  } finally {
    setBusy(false);
    textarea.focus();
  }
}

function createPill(templateText) {
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "injection-pill";
  pill.textContent = templateText;
  pill.addEventListener("click", () => {
    textarea.value = templateText;
    textarea.focus();
    textarea.setSelectionRange(templateText.length, templateText.length);
    setStatus("");
  });
  return pill;
}

TEMPLATES.forEach((template) => {
  pillsContainer.appendChild(createPill(template));
});

textarea.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit(submitBtn);
  }
});

form.addEventListener("submit", handleSubmit);

// Timer limit select change handler
timerLimitSelect.addEventListener("change", () => {
  if (timerLimitSelect.value === "custom") {
    timerCustomInput.style.display = "block";
    timerCustomInput.focus();
  } else {
    timerCustomInput.style.display = "none";
    timerCustomInput.value = "";
  }
});

// Custom input validation
timerCustomInput.addEventListener("input", (event) => {
  const value = event.target.value.trim();
  if (value && !/^\d+:[0-5][0-9]$/.test(value)) {
    event.target.setCustomValidity("Format must be M:SS (e.g., 1:30)");
  } else {
    event.target.setCustomValidity("");
  }
});

// Persist button click handler
persistBtn.addEventListener("click", () => {
  startPersist();
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  stopPersist();
});



