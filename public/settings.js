(() => {
  const API_ENDPOINT = "/settings";
  const MAX_BOTS = 25;
  const MIN_TEMPERATURE = 0;
  const MAX_TEMPERATURE = 2;
  const PROMPT_TEMPLATES = [
    "You are a positive chatter in a livestream.",
    "You are a negative chatter in a livestream.",
    "Respond with 5-10 words max.",
    "No emojis.",
    "Use only 😭 and 😂.",
    "Use W or L twitch language.",
    "Spam W.",
    "Spam L.",
  ];
  const PERSONA_TYPES = ["positive", "negative"];
  const PERSONA_HISTORY_LIMIT = 6;

  function initSettingsConsole() {
    const form = document.getElementById("settings-form");
    const numBotsInput = document.getElementById("numBots");
    const temperatureRange = document.getElementById("temperatureRange");
    const temperatureNumber = document.getElementById("temperatureNumber");
    const toneLabel = document.getElementById("tone-label");
    const streamContextInput = document.getElementById("streamContext");
    const statusEl = document.getElementById("settings-status");
    const botNameList = document.getElementById("bot-name-list");
    const refreshButton = document.getElementById("refresh-settings");
    const savePromptsButton = document.getElementById("save-prompts");
    const presetNameInput = document.getElementById("preset-name-input");
    const savePresetBtn = document.getElementById("save-preset-btn");
    const loadPresetsBtn = document.getElementById("load-presets-btn");
    const settingsPresetNameInput = document.getElementById("settings-preset-name-input");
    const saveSettingsPresetBtn = document.getElementById("save-settings-preset-btn");
    const loadSettingsPresetsBtn = document.getElementById("load-settings-presets-btn");
    const overwriteSettingsPresetBtn = document.getElementById("overwrite-settings-preset-btn");
    const presetModal = document.getElementById("preset-modal");
    const presetModalClose = document.getElementById("preset-modal-close");
    const presetList = document.getElementById("preset-list");
    const presetEmpty = document.getElementById("preset-empty");
    const promptTextareas = {
      positive: document.getElementById("promptBodyPositive"),
      negative: document.getElementById("promptBodyNegative"),
    };
    const promptWeightInputs = {
      positive: document.getElementById("promptWeightPositive"),
      negative: document.getElementById("promptWeightNegative"),
    };
    const promptTemplateContainers = {
      positive: document.querySelector('[data-template-target="positive"]'),
      negative: document.querySelector('[data-template-target="negative"]'),
    };
    const promptHistoryContainers = {
      positive: document.querySelector('[data-history-target="positive"]'),
      negative: document.querySelector('[data-history-target="negative"]'),
    };

    const requiredElements = [
      form,
      numBotsInput,
      temperatureRange,
      temperatureNumber,
      toneLabel,
      streamContextInput,
      statusEl,
      botNameList,
      refreshButton,
      savePromptsButton,
      promptTextareas.positive,
      promptTextareas.negative,
      promptWeightInputs.positive,
      promptWeightInputs.negative,
      promptTemplateContainers.positive,
      promptTemplateContainers.negative,
      promptHistoryContainers.positive,
      promptHistoryContainers.negative,
      presetNameInput,
      savePresetBtn,
      loadPresetsBtn,
      presetModal,
      presetModalClose,
      presetList,
      presetEmpty,
    ];

    if (requiredElements.some((el) => !el)) {
      console.warn("[Settings] Missing required elements. Settings console not initialized.");
      return;
    }

    // Optional elements for comprehensive presets
    if (!settingsPresetNameInput || !saveSettingsPresetBtn || !loadSettingsPresetsBtn) {
      console.warn("[Settings] Comprehensive preset elements not found. Some features may be unavailable.");
    }

    const state = {
      loading: false,
      saving: false,
      settings: null,
      loadedPresetId: null,
      loadedPresetSnapshot: null,
    };
    const personaHistoryState = {
      loading: false,
      cache: {
        positive: [],
        negative: [],
      },
    };

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function clampBotCount(value) {
      if (!Number.isFinite(value)) {
        return 0;
      }
      return clamp(Math.round(value), 0, MAX_BOTS);
    }

    function clampTemperature(value) {
      if (!Number.isFinite(value)) {
        return 0.8;
      }
      return Number.parseFloat(clamp(value, MIN_TEMPERATURE, MAX_TEMPERATURE).toFixed(2));
    }

    function clampPromptWeight(value, fallback = 50) {
      const parsed =
        typeof value === "number" && Number.isFinite(value)
          ? value
          : Number.parseFloat(String(value ?? ""));
      if (!Number.isFinite(parsed)) {
        return clamp(Math.round(fallback), 0, 100);
      }
      return clamp(Math.round(parsed), 0, 100);
    }

    function enforcePromptWeightTotals(source = "positive") {
      const positiveInput = promptWeightInputs.positive;
      const negativeInput = promptWeightInputs.negative;
      if (!positiveInput || !negativeInput) {
        return;
      }

      if (source === "negative") {
        const negativeValue = clampPromptWeight(Number(negativeInput.value));
        negativeInput.value = String(negativeValue);
        positiveInput.value = String(Math.max(0, 100 - negativeValue));
      } else {
        const positiveValue = clampPromptWeight(Number(positiveInput.value));
        positiveInput.value = String(positiveValue);
        negativeInput.value = String(Math.max(0, 100 - positiveValue));
      }
    }

    function toneForTemperature(value) {
      if (value < 0.35) return "Chill";
      if (value < 0.75) return "Balanced";
      if (value < 1.2) return "Energetic";
      if (value < 1.6) return "Hype";
      return "Chaotic";
    }

    function updateToneLabel(value) {
      const clamped = clampTemperature(value);
      toneLabel.textContent = `${toneForTemperature(clamped)} (${clamped.toFixed(2)})`;
    }

    function showStatus(message, variant = "info") {
      if (!message) {
        statusEl.textContent = "";
        statusEl.removeAttribute("data-variant");
        return;
      }
      statusEl.textContent = message;
      statusEl.setAttribute("data-variant", variant);
    }

    function setLoading(isLoading) {
      state.loading = isLoading;
      numBotsInput.disabled = isLoading;
      temperatureRange.disabled = isLoading;
      temperatureNumber.disabled = isLoading;
      streamContextInput.disabled = isLoading;
      form.querySelectorAll("button").forEach((button) => {
        button.disabled = isLoading;
      });
      Object.values(promptWeightInputs).forEach((input) => {
        input.disabled = isLoading;
      });
      Object.values(promptTextareas).forEach((textarea) => {
        textarea.disabled = isLoading;
      });
      savePromptsButton.disabled = isLoading;
      botNameList.querySelectorAll("input.bot-name-input").forEach((input) => {
        input.disabled = isLoading;
      });
      if (isLoading) {
        showStatus("Loading settings...", "info");
      }
    }

    function setSaving(isSaving) {
      state.saving = isSaving;
      const submitButton = form.querySelector('[type="submit"]');
      if (submitButton) {
        submitButton.disabled = isSaving || state.loading;
        submitButton.textContent = isSaving ? "Saving..." : "Save settings";
      }
      refreshButton.disabled = isSaving || state.loading;
      savePromptsButton.disabled = isSaving || state.loading;
      streamContextInput.disabled = isSaving || state.loading;
      Object.values(promptWeightInputs).forEach((input) => {
        input.disabled = isSaving || state.loading;
      });
      Object.values(promptTextareas).forEach((textarea) => {
        textarea.disabled = isSaving || state.loading;
      });
    }

    function insertPromptTemplate(persona, templateText) {
      const textarea = promptTextareas[persona];
      if (!textarea) {
        return;
      }
      const currentValue = textarea.value;
      const hasContent = currentValue.trim().length > 0;
      const separator = hasContent && !currentValue.endsWith("\n") ? "\n" : "";
      textarea.value = hasContent ? `${currentValue}${separator}${templateText}` : templateText;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    }

    function createTemplateChip(persona, templateText) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "prompt-quick__chip";
      chip.textContent = templateText;
      chip.addEventListener("click", () => {
        insertPromptTemplate(persona, templateText);
      });
      return chip;
    }

    function renderPromptTemplates() {
      Object.entries(promptTemplateContainers).forEach(([persona, container]) => {
        if (!container) {
          return;
        }
        container.innerHTML = "";
        PROMPT_TEMPLATES.forEach((templateText) => {
          const chip = createTemplateChip(persona, templateText);
          container.appendChild(chip);
        });
      });
    }

    function truncateHistoryText(text, maxLength = 80) {
      const value = (text ?? "").trim();
      if (!value) {
        return "Untitled prompt";
      }
      if (value.length <= maxLength) {
        return value;
      }
      return `${value.slice(0, maxLength - 1)}…`;
    }

    function applyHistoryPrompt(persona, body) {
      const textarea = promptTextareas[persona];
      if (!textarea) {
        return;
      }
      textarea.value = body;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    }

    function createHistoryChip(persona, entry) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `history-pill history-pill--${persona === "positive" ? "positive" : "negative"}`;
      chip.textContent = truncateHistoryText(entry.body);
      chip.title = entry.body;
      chip.addEventListener("click", () => {
        applyHistoryPrompt(persona, entry.body);
      });
      return chip;
    }

    function renderPersonaHistory(persona) {
      const container = promptHistoryContainers[persona];
      if (!container) {
        return;
      }
      const entries = personaHistoryState.cache[persona] ?? [];
      container.innerHTML = "";
      if (entries.length === 0) {
        const empty = document.createElement("span");
        empty.className = "history-placeholder";
        empty.textContent = "No saved personas yet.";
        container.appendChild(empty);
        return;
      }
      entries.forEach((entry) => {
        const chip = createHistoryChip(persona, entry);
        container.appendChild(chip);
      });
    }

    function renderAllPersonaHistory() {
      PERSONA_TYPES.forEach((persona) => renderPersonaHistory(persona));
    }

    async function fetchPersonaHistoryEntries(personaType) {
      const response = await fetch(
        `/history/personas?type=${personaType}&limit=${PERSONA_HISTORY_LIMIT}`,
        {
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) {
        throw new Error(`Failed to load ${personaType} history (${response.status})`);
      }
      const payload = await response.json();
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];
      return entries
        .map((entry) => ({
          ...entry,
          body: typeof entry?.body === "string" ? entry.body.trim() : "",
        }))
        .filter((entry) => entry.body.length > 0);
    }

    async function refreshPersonaHistory() {
      if (personaHistoryState.loading) {
        return;
      }
      personaHistoryState.loading = true;
      try {
        const results = await Promise.all(
          PERSONA_TYPES.map((persona) =>
            fetchPersonaHistoryEntries(persona).catch((error) => {
              console.error(`[Settings] Failed to fetch ${persona} persona history`, error);
              return [];
            }),
          ),
        );
        PERSONA_TYPES.forEach((persona, index) => {
          personaHistoryState.cache[persona] = results[index];
          renderPersonaHistory(persona);
        });
      } finally {
        personaHistoryState.loading = false;
      }
    }

    let autoSaveTimeout = null;

    function collectBotNamesFromInputs() {
      const inputs = botNameList.querySelectorAll("input.bot-name-input");
      return Array.from(inputs)
        .map((input) => (input.value || "").trim())
        .filter((name) => name.length > 0);
    }

    async function autoSaveBotNames() {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
      autoSaveTimeout = setTimeout(async () => {
        const botNames = collectBotNamesFromInputs();
        if (botNames.length === 0) {
          return;
        }
        try {
          await updateSettings({ botNames });
        } catch (error) {
          console.error("[Settings] Failed to auto-save bot names", error);
        }
      }, 500);
    }

    function renderBotNames(names) {
      botNameList.innerHTML = "";
      if (!Array.isArray(names) || names.length === 0) {
        const empty = document.createElement("li");
        empty.className = "bot-names__empty";
        empty.textContent = "No AI chatters active.";
        botNameList.appendChild(empty);
        return;
      }

      names.forEach((name, index) => {
        const item = document.createElement("li");
        item.className = "bot-name-item";
        item.dataset.index = String(index + 1);

        const input = document.createElement("input");
        input.type = "text";
        input.className = "bot-name-input";
        input.value = name;
        input.placeholder = `Bot ${index + 1} name`;
        input.maxLength = 64;

        input.addEventListener("input", () => {
          autoSaveBotNames();
        });

        input.addEventListener("blur", () => {
          autoSaveBotNames();
        });

        item.appendChild(input);
        botNameList.appendChild(item);
      });
    }

    function applySettingsToForm(settings) {
      state.settings = settings;

      const numBots = clampBotCount(settings.numBots ?? 0);
      const temperature = clampTemperature(settings.temperature ?? 0.8);
      const promptBodies = Array.isArray(settings.promptBodies) ? settings.promptBodies : [];
      const streamContext =
        typeof settings.streamContext === "string" ? settings.streamContext : "";

      const positiveBody =
        promptBodies.find((body) => body?.id === "positive") ??
        promptBodies[0] ??
        {};
      const negativeBody =
        promptBodies.find((body) => body?.id === "negative") ??
        promptBodies[1] ??
        {};

      const positiveInstructions =
        typeof positiveBody?.instructions === "string" ? positiveBody.instructions : "";
      const negativeInstructions =
        typeof negativeBody?.instructions === "string"
          ? negativeBody.instructions
          : positiveInstructions;

      const positiveWeight = clampPromptWeight(Number(positiveBody?.weight ?? 50));
      const negativeWeight = clampPromptWeight(
        Number(negativeBody?.weight ?? Math.max(0, 100 - positiveWeight)),
      );

      numBotsInput.value = String(numBots);
      temperatureRange.value = String(temperature);
      temperatureNumber.value = temperature.toFixed(2);
      updateToneLabel(temperature);
      renderBotNames(settings.botNames ?? []);
      streamContextInput.value = streamContext;

      promptTextareas.positive.value = positiveInstructions;
      promptTextareas.negative.value = negativeInstructions;
      promptWeightInputs.positive.value = String(positiveWeight);
      promptWeightInputs.negative.value = String(negativeWeight);
      enforcePromptWeightTotals("positive");

      showStatus("Settings synced.", "info");
    }

    async function fetchSettings() {
      const response = await fetch(API_ENDPOINT, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Failed to load settings (${response.status})`);
      }
      const payload = await response.json();
      return payload.settings ?? payload;
    }

    async function updateSettings(payload) {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || `Failed to save settings (${response.status})`);
      }
      return body;
    }

    async function loadSettings() {
      try {
        setLoading(true);
        const settings = await fetchSettings();
        applySettingsToForm(settings);
        // Clear loaded preset state when refreshing
        state.loadedPresetId = null;
        state.loadedPresetSnapshot = null;
        updateOverwriteButton();
        // Clear preset name inputs when refreshing
        if (presetNameInput) {
          presetNameInput.value = "";
        }
        if (settingsPresetNameInput) {
          settingsPresetNameInput.value = "";
        }
        showStatus("Settings loaded.", "success");
        void refreshPersonaHistory();
      } catch (error) {
        console.error(error);
        showStatus(error.message || "Unable to load settings.", "error");
      } finally {
        setLoading(false);
      }
    }

    async function submitSettings() {
      if (state.loading || state.saving) {
        return;
      }
      const numBots = clampBotCount(Number(numBotsInput.value));
      const temperature = clampTemperature(Number.parseFloat(temperatureNumber.value));
      enforcePromptWeightTotals();

      const positivePrompt = promptTextareas.positive.value.trim();
      const negativePrompt = promptTextareas.negative.value.trim();
      const positiveWeight = clampPromptWeight(Number(promptWeightInputs.positive.value));
      const negativeWeight = Math.max(0, 100 - positiveWeight);
      const streamContext = streamContextInput.value.trim();

      if (!positivePrompt) {
        showStatus("Positive prompt cannot be empty.", "error");
        return;
      }

      if (!negativePrompt) {
        showStatus("Negative prompt cannot be empty.", "error");
        return;
      }

      const payload = {
        numBots,
        temperature,
        promptBodies: [
          {
            id: "positive",
            label: "Positive",
            instructions: positivePrompt,
            weight: positiveWeight,
          },
          {
            id: "negative",
            label: "Negative",
            instructions: negativePrompt,
            weight: negativeWeight,
          },
        ],
        streamContext,
      };

      try {
        setSaving(true);
        showStatus("Saving settings...", "info");
        const response = await updateSettings(payload);
        const message = response.status === "updated" ? "Settings updated." : "Nothing changed.";
        if (response?.settings) {
          applySettingsToForm(response.settings);
        }
        showStatus(message, response.status === "updated" ? "success" : "info");
        void refreshPersonaHistory();
      } catch (error) {
        console.error(error);
        showStatus(error.message || "Unable to save settings.", "error");
      } finally {
        setSaving(false);
      }
    }

    async function handleSubmit(event) {
      event.preventDefault();
      await submitSettings();
    }

    function syncTemperatureFromRange() {
      const value = clampTemperature(Number.parseFloat(temperatureRange.value));
      temperatureRange.value = String(value);
      temperatureNumber.value = value.toFixed(2);
      updateToneLabel(value);
    }

    function syncTemperatureFromNumber() {
      const value = clampTemperature(Number.parseFloat(temperatureNumber.value));
      temperatureRange.value = String(value);
      temperatureNumber.value = value.toFixed(2);
      updateToneLabel(value);
    }

    function syncBotCount() {
      const value = clampBotCount(Number(numBotsInput.value));
      numBotsInput.value = String(value);
    }

    form.addEventListener("submit", handleSubmit);
    refreshButton.addEventListener("click", () => {
      if (state.loading || state.saving) {
        return;
      }
      showStatus("Refreshing settings...", "info");
      void loadSettings();
    });

    temperatureRange.addEventListener("input", () => {
      syncTemperatureFromRange();
      updateOverwriteButton();
    });
    temperatureNumber.addEventListener("input", () => {
      syncTemperatureFromNumber();
      updateOverwriteButton();
    });
    temperatureNumber.addEventListener("change", () => {
      syncTemperatureFromNumber();
      updateOverwriteButton();
    });
    numBotsInput.addEventListener("change", () => {
      syncBotCount();
      updateOverwriteButton();
    });
    streamContextInput.addEventListener("input", updateOverwriteButton);
    streamContextInput.addEventListener("change", updateOverwriteButton);
    promptTextareas.positive.addEventListener("input", updateOverwriteButton);
    promptTextareas.positive.addEventListener("change", updateOverwriteButton);
    promptTextareas.negative.addEventListener("input", updateOverwriteButton);
    promptTextareas.negative.addEventListener("change", updateOverwriteButton);
    promptWeightInputs.positive.addEventListener("input", () => {
      enforcePromptWeightTotals("positive");
      updateOverwriteButton();
    });
    promptWeightInputs.positive.addEventListener("change", () => {
      enforcePromptWeightTotals("positive");
      updateOverwriteButton();
    });
    promptWeightInputs.negative.addEventListener("input", () => {
      enforcePromptWeightTotals("negative");
      updateOverwriteButton();
    });
    promptWeightInputs.negative.addEventListener("change", () => {
      enforcePromptWeightTotals("negative");
      updateOverwriteButton();
    });
    
    // Track bot name changes
    const botNameObserver = new MutationObserver(() => {
      updateOverwriteButton();
    });
    if (botNameList) {
      botNameObserver.observe(botNameList, { childList: true, subtree: true });
    }
    
    // Also track input events on bot name inputs
    setInterval(() => {
      const botInputs = botNameList.querySelectorAll("input.bot-name-input");
      botInputs.forEach((input) => {
        if (!input.dataset.tracked) {
          input.dataset.tracked = "true";
          input.addEventListener("input", updateOverwriteButton);
          input.addEventListener("change", updateOverwriteButton);
        }
      });
    }, 500);
    savePromptsButton.addEventListener("click", () => {
      void submitSettings();
    });

    function collectAllSettings() {
      const numBots = clampBotCount(Number(numBotsInput.value));
      const temperature = clampTemperature(Number.parseFloat(temperatureNumber.value));
      const streamContext = streamContextInput.value.trim();
      const positivePersona = promptTextareas.positive.value.trim();
      const negativePersona = promptTextareas.negative.value.trim();
      const weightPositive = clampPromptWeight(Number(promptWeightInputs.positive.value));
      const weightNegative = clampPromptWeight(Number(promptWeightInputs.negative.value));
      const botNames = collectBotNamesFromInputs();

      return {
        numBots,
        temperature,
        streamContext,
        positivePersona,
        negativePersona,
        weightPositive,
        weightNegative,
        botNames,
      };
    }

    function hasSettingsChanged() {
      if (!state.loadedPresetId || !state.loadedPresetSnapshot) {
        return false;
      }

      const current = collectAllSettings();
      const snapshot = state.loadedPresetSnapshot;

      // Compare bot names (sorted arrays)
      const currentBots = [...current.botNames].sort().join(",");
      const snapshotBots = [...(snapshot.bot_names || snapshot.botNames || [])].sort().join(",");
      if (currentBots !== snapshotBots) {
        return true;
      }

      // Compare other fields
      if (Math.abs(current.temperature - (snapshot.temperature ?? 0.8)) > 0.01) {
        return true;
      }
      if (current.streamContext !== (snapshot.streamContext ?? "")) {
        return true;
      }
      if (current.positivePersona !== (snapshot.positive_persona ?? "")) {
        return true;
      }
      if (current.negativePersona !== (snapshot.negative_persona ?? "")) {
        return true;
      }
      if (current.weightPositive !== (snapshot.weight_positive ?? 50)) {
        return true;
      }
      if (current.weightNegative !== (snapshot.weight_negative ?? 50)) {
        return true;
      }

      return false;
    }

    function updateOverwriteButton() {
      if (!overwriteSettingsPresetBtn) {
        return;
      }

      const shouldShow = state.loadedPresetId !== null && hasSettingsChanged();
      overwriteSettingsPresetBtn.style.display = shouldShow ? "inline-block" : "none";
      overwriteSettingsPresetBtn.disabled = !shouldShow;
    }

    async function savePreset() {
      const presetName = (presetNameInput.value || "").trim();
      if (!presetName) {
        showStatus("Please enter a preset name.", "error");
        presetNameInput.focus();
        return;
      }

      const botNames = collectBotNamesFromInputs();
      if (botNames.length === 0) {
        showStatus("No bot names to save.", "error");
        return;
      }

      try {
        setSaving(true);
        showStatus("Saving preset...", "info");
        const response = await fetch("/settings/bot-names", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            presetName,
            botNames,
          }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || `Failed to save preset (${response.status})`);
        }

        presetNameInput.value = "";
        showStatus(`Preset "${presetName}" saved successfully.`, "success");
      } catch (error) {
        console.error(error);
        showStatus(error.message || "Unable to save preset.", "error");
      } finally {
        setSaving(false);
      }
    }

    async function saveSettingsPreset() {
      const presetName = (settingsPresetNameInput?.value || "").trim();
      if (!presetName) {
        showStatus("Please enter a preset name.", "error");
        settingsPresetNameInput?.focus();
        return;
      }

      const settings = collectAllSettings();

      if (!settings.positivePersona) {
        showStatus("Positive persona cannot be empty.", "error");
        return;
      }

      if (!settings.negativePersona) {
        showStatus("Negative persona cannot be empty.", "error");
        return;
      }

      try {
        setSaving(true);
        showStatus("Saving settings preset...", "info");
        const response = await fetch("/settings/presets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            presetName,
            botNames: settings.botNames,
            positivePersona: settings.positivePersona,
            negativePersona: settings.negativePersona,
            temperature: settings.temperature,
            weightPositive: settings.weightPositive,
            weightNegative: settings.weightNegative,
            streamContext: settings.streamContext,
          }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || `Failed to save preset (${response.status})`);
        }

        if (settingsPresetNameInput) {
          settingsPresetNameInput.value = "";
        }
        // Clear loaded preset state when saving new preset
        state.loadedPresetId = null;
        state.loadedPresetSnapshot = null;
        updateOverwriteButton();
        showStatus(`Preset "${presetName}" saved successfully.`, "success");
      } catch (error) {
        console.error(error);
        showStatus(error.message || "Unable to save preset.", "error");
      } finally {
        setSaving(false);
      }
    }

    async function loadPresets() {
      try {
        const response = await fetch("/settings/bot-names", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Failed to load presets (${response.status})`);
        }
        const payload = await response.json();
        const presets = Array.isArray(payload?.presets) ? payload.presets : [];
        renderPresetList(presets);
        presetModal.style.display = "block";
      } catch (error) {
        console.error(error);
        showStatus(error.message || "Unable to load presets.", "error");
      }
    }

    async function loadSettingsPresets() {
      try {
        const response = await fetch("/settings/presets", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Failed to load presets (${response.status})`);
        }
        const payload = await response.json();
        const presets = Array.isArray(payload?.presets) ? payload.presets : [];
        renderSettingsPresetList(presets);
        presetModal.style.display = "block";
      } catch (error) {
        console.error(error);
        showStatus(error.message || "Unable to load presets.", "error");
      }
    }

    function renderPresetList(presets) {
      presetList.innerHTML = "";
      if (presets.length === 0) {
        presetEmpty.style.display = "block";
        return;
      }
      presetEmpty.style.display = "none";

      presets.forEach((preset) => {
        const item = document.createElement("li");
        item.className = "preset-item";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "preset-item__button";
        button.textContent = preset.preset_name || "Unnamed preset";
        button.title = `${preset.bot_names?.length || 0} bot name(s)`;

        button.addEventListener("click", async () => {
          await loadPreset(preset.id);
        });

        item.appendChild(button);
        presetList.appendChild(item);
      });
    }

    function renderSettingsPresetList(presets) {
      presetList.innerHTML = "";
      if (presets.length === 0) {
        presetEmpty.style.display = "block";
        return;
      }
      presetEmpty.style.display = "none";

      presets.forEach((preset) => {
        const item = document.createElement("li");
        item.className = "preset-item";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "preset-item__button";
        
        const details = [];
        if (preset.bot_names && preset.bot_names.length > 0) {
          details.push(`${preset.bot_names.length} bot(s)`);
        }
        if (preset.temperature !== undefined) {
          details.push(`Temp: ${preset.temperature.toFixed(2)}`);
        }
        if (preset.weight_positive !== undefined && preset.weight_negative !== undefined) {
          details.push(`Weights: ${preset.weight_positive}/${preset.weight_negative}`);
        }
        
        const detailsText = details.length > 0 ? ` · ${details.join(", ")}` : "";
        button.textContent = `${preset.preset_name || "Unnamed preset"}${detailsText}`;
        button.title = `Temperature: ${preset.temperature?.toFixed(2) || "N/A"}, Weights: ${preset.weight_positive || 50}/${preset.weight_negative || 50}, Bots: ${preset.bot_names?.length || 0}`;

        button.addEventListener("click", async () => {
          await loadSettingsPreset(preset.id);
        });

        item.appendChild(button);
        presetList.appendChild(item);
      });
    }

    async function loadPreset(presetId) {
      try {
        setLoading(true);
        showStatus("Loading preset...", "info");
        
        // Fetch the preset data to get the preset name
        const fetchResponse = await fetch("/settings/bot-names", {
          headers: { Accept: "application/json" },
        });
        const fetchBody = await fetchResponse.json().catch(() => ({}));
        const allPresets = Array.isArray(fetchBody?.presets) ? fetchBody.presets : [];
        const presetData = allPresets.find((p) => p.id === presetId);
        
        const response = await fetch("/settings/bot-names/load", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ id: presetId }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || `Failed to load preset (${response.status})`);
        }

        if (body?.settings) {
          applySettingsToForm(body.settings);
        }
        
        // Set the preset name in the input field
        if (presetNameInput && presetData?.preset_name) {
          presetNameInput.value = presetData.preset_name;
        }
        
        presetModal.style.display = "none";
        showStatus("Preset loaded successfully.", "success");
      } catch (error) {
        console.error(error);
        showStatus(error.message || "Unable to load preset.", "error");
      } finally {
        setLoading(false);
      }
    }

    async function loadSettingsPreset(presetId) {
      try {
        setLoading(true);
        showStatus("Loading settings preset...", "info");
        
        // Fetch the preset data to store snapshot
        const fetchResponse = await fetch("/settings/presets", {
          headers: { Accept: "application/json" },
        });
        const fetchBody = await fetchResponse.json().catch(() => ({}));
        const allPresets = Array.isArray(fetchBody?.presets) ? fetchBody.presets : [];
        const presetData = allPresets.find((p) => p.id === presetId);

        const response = await fetch("/settings/presets/load", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ id: presetId }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || `Failed to load preset (${response.status})`);
        }

        if (body?.settings) {
          applySettingsToForm(body.settings);
        }

        // Store preset ID and snapshot for change tracking
        state.loadedPresetId = presetId;
        state.loadedPresetSnapshot = presetData || null;
        updateOverwriteButton();

        // Set the preset name in the input field
        if (settingsPresetNameInput && presetData?.preset_name) {
          settingsPresetNameInput.value = presetData.preset_name;
        }

        presetModal.style.display = "none";
        showStatus("Settings preset loaded successfully.", "success");
      } catch (error) {
        console.error(error);
        showStatus(error.message || "Unable to load preset.", "error");
      } finally {
        setLoading(false);
      }
    }

    async function overwriteSettingsPreset() {
      if (!state.loadedPresetId) {
        showStatus("No preset loaded to overwrite.", "error");
        return;
      }

      const settings = collectAllSettings();

      if (!settings.positivePersona) {
        showStatus("Positive persona cannot be empty.", "error");
        return;
      }

      if (!settings.negativePersona) {
        showStatus("Negative persona cannot be empty.", "error");
        return;
      }

      try {
        setSaving(true);
        showStatus("Overwriting preset...", "info");
        
        const presetName = state.loadedPresetSnapshot?.preset_name || "Unnamed Preset";
        
        const response = await fetch(`/settings/presets/${state.loadedPresetId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            presetName,
            botNames: settings.botNames,
            positivePersona: settings.positivePersona,
            negativePersona: settings.negativePersona,
            temperature: settings.temperature,
            weightPositive: settings.weightPositive,
            weightNegative: settings.weightNegative,
            streamContext: settings.streamContext,
          }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || `Failed to overwrite preset (${response.status})`);
        }

        // Update snapshot to reflect current state
        state.loadedPresetSnapshot = {
          ...state.loadedPresetSnapshot,
          preset_name: presetName,
          bot_names: settings.botNames,
          positive_persona: settings.positivePersona,
          negative_persona: settings.negativePersona,
          temperature: settings.temperature,
          weight_positive: settings.weightPositive,
          weight_negative: settings.weightNegative,
          stream_context: settings.streamContext,
        };
        updateOverwriteButton();

        showStatus(`Preset "${presetName}" overwritten successfully.`, "success");
      } catch (error) {
        console.error(error);
        showStatus(error.message || "Unable to overwrite preset.", "error");
      } finally {
        setSaving(false);
      }
    }

    function closePresetModal() {
      presetModal.style.display = "none";
    }

    savePresetBtn.addEventListener("click", () => {
      void savePreset();
    });

    presetNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void savePreset();
      }
    });

    loadPresetsBtn.addEventListener("click", () => {
      void loadPresets();
    });

    if (saveSettingsPresetBtn) {
      saveSettingsPresetBtn.addEventListener("click", () => {
        void saveSettingsPreset();
      });
    }

    if (settingsPresetNameInput) {
      settingsPresetNameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void saveSettingsPreset();
        }
      });
    }

    if (loadSettingsPresetsBtn) {
      loadSettingsPresetsBtn.addEventListener("click", () => {
        void loadSettingsPresets();
      });
    }

    if (overwriteSettingsPresetBtn) {
      overwriteSettingsPresetBtn.addEventListener("click", () => {
        void overwriteSettingsPreset();
      });
    }

    presetModalClose.addEventListener("click", closePresetModal);

    const presetModalOverlay = presetModal.querySelector(".preset-modal__overlay");
    if (presetModalOverlay) {
      presetModalOverlay.addEventListener("click", closePresetModal);
    }

    // Add click handlers for history panes
    const historyPaneHeaders = document.querySelectorAll(".history-pane__header");
    historyPaneHeaders.forEach((header) => {
      header.style.cursor = "pointer";
      header.addEventListener("click", () => {
        void refreshPersonaHistory();
      });
    });

    renderPromptTemplates();
    renderAllPersonaHistory();
    void loadSettings();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSettingsConsole, { once: true });
  } else {
    initSettingsConsole();
  }
})();
