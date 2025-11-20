import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { ChatMessage, ChatRole } from "./chat/types";
import { AIResponderHandle, launchMultipleAIResponders } from "./ai/agent";
import {
  fetchPersonaHistory,
  fetchStreamContextHistory,
  insertPersonaHistory,
  insertStreamContextHistory,
  insertBotNamePreset,
  fetchBotNamePresets,
  fetchBotNamePresetById,
  ensurePersonaInHistory,
  findOrCreateBotPreset,
  insertSettingsPreset,
  updateSettingsPreset,
  fetchSettingsPresets,
  fetchSettingsPresetById,
  type PersonaHistoryType,
} from "./storage/history";
import { launchDevServer } from "./scripts/launcher";
const ROLES: ChatRole[] = ["viewer", "bot", "moderator", "streamer"];

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const CHAT_HISTORY_LIMIT = 100;
const BOT_USERNAME_SEED = process.env.BOT_USERNAME?.trim() || "AiChatter";
const BOT_POSITIVE_CHARACTER =
  process.env.BOT_PERSONA?.trim() ||
  "you are a supportive hype co-host who keeps morale high, celebrates wins, and encourages the streamer and chat.";
const BOT_NEGATIVE_CHARACTER =
  process.env.BOT_NEGATIVE_PERSONA?.trim() ||
  "you are a sarcastic contrarian co-host who playfully roasts the streamer and viewers, leaning into chaotic, negative banter.";
const BASE_PROMPT_TEMPLATE = [
  "You are an AI co-host inside a livestream chat.",
  "Speak in short, punchy messages (max 2 sentences).",
  "Blend casual Twitch slang with wit, and encourage engagement.",
  "If asked something you cannot do, deflect playfully.",
];

type PromptKey = "positive" | "negative";

interface PromptBody {
  id: PromptKey;
  label: string;
  instructions: string;
  weight: number;
}

function buildPromptBody(character: string): string {
  return [
    BASE_PROMPT_TEMPLATE[0],
    `Stay in character: ${character}`,
    ...BASE_PROMPT_TEMPLATE.slice(1),
  ].join(" ");
}

const DEFAULT_PROMPT_BODIES: PromptBody[] = [
  {
    id: "positive",
    label: "Positive",
    instructions: buildPromptBody(BOT_POSITIVE_CHARACTER),
    weight: 50,
  },
  {
    id: "negative",
    label: "Negative",
    instructions: buildPromptBody(BOT_NEGATIVE_CHARACTER),
    weight: 50,
  },
];

const PROMPT_KEYS: PromptKey[] = ["positive", "negative"];

function getDefaultPromptBodies(): PromptBody[] {
  return DEFAULT_PROMPT_BODIES.map((body) => ({ ...body }));
}

function mapPromptBodies(bodies: PromptBody[]) {
  const table = new Map<PromptKey, PromptBody>();
  bodies.forEach((body) => {
    table.set(body.id, body);
  });
  return table;
}

function parseHistoryLimit(value: unknown, fallback = 10) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

function respondWithHistoryError(res: Response, error: unknown, context: string) {
  console.error(`[History] Failed to load ${context}`, error);
  res.status(500).send({ error: `Failed to load ${context}` });
}
const DEFAULT_STREAM_CONTEXT = "";
const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const AI_REPLY_CHANCE = Number.parseFloat(process.env.AI_REPLY_CHANCE ?? "0.35");
const AI_MIN_INTERVAL_MS = Number.parseInt(process.env.AI_MIN_INTERVAL_MS ?? "5000", 10);
const AI_MAX_CONTEXT = Number.parseInt(process.env.AI_MAX_CONTEXT ?? "15", 10);
const MAX_BOT_COUNT = 25;
const DEFAULT_BOT_COUNT = sanitizeBotCount(Number.parseInt(process.env.AI_BOT_COUNT ?? "1", 10), 1);
const DEFAULT_BOT_TEMPERATURE = sanitizeTemperature(Number.parseFloat(process.env.AI_TEMPERATURE ?? "0.8"), 0.8);
const STREAMER_USERNAME = process.env.STREAMER_USERNAME?.trim() || "Streamer";
const OPENAI_TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const INJECTION_USERNAME = "Injection";
const INJECTION_SUPPRESSION_MS = 6000;

const openAIClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

type MessageListener = (message: ChatMessage) => void;

const app = express();
app.use(express.json({ limit: "4mb" }));

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    // Accept various audio formats including iOS formats
    const allowedMimes = [
      "audio/webm",
      "audio/m4a",
      "audio/x-m4a",
      "audio/mp4",
      "audio/caf",
      "audio/x-caf",
      "audio/mpeg",
      "audio/wav",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid audio file type"));
    }
  },
});

const publicDir = path.resolve(__dirname, "../public");
app.use("/static", express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/view", (_req, res) => {
  res.sendFile(path.join(publicDir, "view.html"));
});

app.get("/broadcaster", (_req, res) => {
  res.sendFile(path.join(publicDir, "broadcaster.html"));
});

// Deprecated: Redirect old standalone pages to unified broadcaster page
app.get("/settings/view", (_req, res) => {
  res.redirect("/broadcaster#settings");
});

app.get("/injection", (_req, res) => {
  res.redirect("/broadcaster#injection");
});

app.get("/launcher", (_req, res) => {
  res.sendFile(path.join(publicDir, "launcher.html"));
});

app.post("/launch", async (_req, res) => {
  try {
    const result = await launchDevServer();
    res.status(result.success ? 200 : 500).send(result);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: `Failed to launch dev server: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});

app.get("/settings", (_req, res) => {
  res.send({
    status: "ok",
    settings: getPublicBotSettings(),
  });
});

app.post("/settings", async (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).send({ error: "Invalid payload" });
    return;
  }

  const payload = req.body as Record<string, unknown>;
  const updates: Partial<
    Pick<BotSettings, "numBots" | "temperature" | "promptBodies" | "streamContext" | "botNames">
  > = {};

  if (Object.prototype.hasOwnProperty.call(payload, "numBots")) {
    updates.numBots = payload.numBots as number;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "temperature")) {
    updates.temperature = payload.temperature as number;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "promptBodies")) {
    updates.promptBodies = payload.promptBodies as PromptBody[];
  }

  if (Object.prototype.hasOwnProperty.call(payload, "streamContext")) {
    updates.streamContext = payload.streamContext as string;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "botNames")) {
    const botNamesValue = payload.botNames;
    if (Array.isArray(botNamesValue)) {
      updates.botNames = botNamesValue
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter((name) => name.length > 0)
        .map((name) => name.replace(/\s+/g, ""))
        .slice(0, MAX_BOT_COUNT);
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).send({ error: "No settings provided" });
    return;
  }

  const previousPrompts = mapPromptBodies(botSettings.promptBodies);
  const previousStreamContext = botSettings.streamContext;

  const changed = applyBotSettings(updates);

  const currentPrompts = mapPromptBodies(botSettings.promptBodies);
  const historyTasks: Promise<void>[] = [];

  const positiveBefore = (previousPrompts.get("positive")?.instructions ?? "").trim();
  const positiveAfter = (currentPrompts.get("positive")?.instructions ?? "").trim();
  if (positiveAfter && positiveAfter !== positiveBefore) {
    historyTasks.push(
      insertPersonaHistory("positive", positiveAfter).catch((error) => {
        console.error("[History] Failed to insert positive persona entry", error);
      }),
    );
  }

  const negativeBefore = (previousPrompts.get("negative")?.instructions ?? "").trim();
  const negativeAfter = (currentPrompts.get("negative")?.instructions ?? "").trim();
  if (negativeAfter && negativeAfter !== negativeBefore) {
    historyTasks.push(
      insertPersonaHistory("negative", negativeAfter).catch((error) => {
        console.error("[History] Failed to insert negative persona entry", error);
      }),
    );
  }

  const newStreamContext = botSettings.streamContext.trim();
  if (newStreamContext && newStreamContext !== previousStreamContext.trim()) {
    historyTasks.push(
      insertStreamContextHistory(newStreamContext).catch((error) => {
        console.error("[History] Failed to insert stream context entry", error);
      }),
    );
  }

  if (historyTasks.length > 0) {
    await Promise.all(historyTasks);
  }

  // Always ensure bot names are generated and match numBots before returning
  botSettings.botNames = ensureBotNames(botSettings.botNames, botSettings.numBots);
  
  res.status(changed ? 202 : 200).send({
    status: changed ? "updated" : "unchanged",
    settings: getPublicBotSettings(),
  });
});

app.get("/history/personas", async (req, res) => {
  const query = (req.query ?? {}) as { type?: PersonaHistoryType; limit?: string };
  const personaType: PersonaHistoryType =
    query.type === "negative" || query.type === "positive" ? query.type : "positive";
  const limit = parseHistoryLimit(query.limit);

  try {
    const entries = await fetchPersonaHistory(personaType, limit);
    res.send({
      status: "ok",
      type: personaType,
      entries,
    });
  } catch (error) {
    respondWithHistoryError(res, error, "persona history");
  }
});

app.get("/history/stream-context", async (req, res) => {
  const query = (req.query ?? {}) as { limit?: string };
  const limit = parseHistoryLimit(query.limit);
  try {
    const entries = await fetchStreamContextHistory(limit);
    res.send({
      status: "ok",
      entries,
    });
  } catch (error) {
    respondWithHistoryError(res, error, "stream context history");
  }
});

app.post("/settings/bot-names", async (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).send({ error: "Invalid payload" });
    return;
  }

  const payload = req.body as { presetName?: string; botNames?: string[] };
  const presetName = typeof payload.presetName === "string" ? payload.presetName.trim() : "";
  const botNames = Array.isArray(payload.botNames) ? payload.botNames : botSettings.botNames;

  if (!presetName) {
    res.status(400).send({ error: "presetName is required" });
    return;
  }

  if (!Array.isArray(botNames) || botNames.length === 0) {
    res.status(400).send({ error: "botNames array is required and cannot be empty" });
    return;
  }

  const sanitizedNames = botNames
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter((name) => name.length > 0)
    .map((name) => name.replace(/\s+/g, ""))
    .slice(0, MAX_BOT_COUNT);

  if (sanitizedNames.length === 0) {
    res.status(400).send({ error: "At least one valid bot name is required" });
    return;
  }

  try {
    await insertBotNamePreset(presetName, sanitizedNames);
    res.status(201).send({
      status: "created",
      message: "Bot name preset saved successfully",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[History] Failed to insert bot name preset", {
      error: errorMessage,
      stack: errorStack,
      presetName,
      botNamesCount: sanitizedNames.length,
    });
    res.status(500).send({
      error: "Failed to save bot name preset",
      details: errorMessage,
    });
  }
});

app.get("/settings/bot-names", async (req, res) => {
  const query = (req.query ?? {}) as { limit?: string };
  const limit = parseHistoryLimit(query.limit, 50);
  try {
    const presets = await fetchBotNamePresets(limit);
    res.send({
      status: "ok",
      presets,
    });
  } catch (error) {
    console.error("[History] Failed to fetch bot name presets", error);
    res.status(500).send({ error: "Failed to load bot name presets" });
  }
});

app.post("/settings/bot-names/load", async (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).send({ error: "Invalid payload" });
    return;
  }

  const payload = req.body as { id?: string };
  const presetId = typeof payload.id === "string" ? payload.id.trim() : "";

  if (!presetId) {
    res.status(400).send({ error: "id is required" });
    return;
  }

  try {
    const preset = await fetchBotNamePresetById(presetId);
    if (!preset) {
      res.status(404).send({ error: "Preset not found" });
      return;
    }

    const sanitizedNames = ensureBotNames(preset.bot_names, preset.bot_names.length);
    const targetCount = sanitizeBotCount(sanitizedNames.length, sanitizedNames.length);
    botSettings.botNames = ensureBotNames(sanitizedNames, targetCount);
    botSettings.numBots = botSettings.botNames.length;

    restartAIResponders();

    res.status(200).send({
      status: "loaded",
      settings: getPublicBotSettings(),
    });
  } catch (error) {
    console.error("[History] Failed to load bot name preset", error);
    res.status(500).send({ error: "Failed to load bot name preset" });
  }
});

app.post("/settings/presets", async (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).send({ error: "Invalid payload" });
    return;
  }

  const payload = req.body as {
    presetName?: string;
    botsPresetId?: string;
    botNames?: string[];
    positivePersona?: string;
    negativePersona?: string;
    temperature?: number;
    weightPositive?: number;
    weightNegative?: number;
    streamContext?: string;
  };

  const presetName = typeof payload.presetName === "string" ? payload.presetName.trim() : "";
  if (!presetName) {
    res.status(400).send({ error: "presetName is required" });
    return;
  }

  try {
    // Handle bot preset
    let botsPresetId: string | null = null;
    if (payload.botsPresetId) {
      botsPresetId = payload.botsPresetId.trim();
      // Verify it exists
      const existing = await fetchBotNamePresetById(botsPresetId);
      if (!existing) {
        res.status(404).send({ error: "Referenced bot preset not found" });
        return;
      }
    } else if (Array.isArray(payload.botNames) && payload.botNames.length > 0) {
      const sanitizedNames = payload.botNames
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter((name) => name.length > 0)
        .map((name) => name.replace(/\s+/g, ""))
        .slice(0, MAX_BOT_COUNT);
      if (sanitizedNames.length > 0) {
        botsPresetId = await findOrCreateBotPreset(sanitizedNames);
      }
    }

    // Handle personas - ensure they exist in history
    let positivePersonaId: string | null = null;
    if (typeof payload.positivePersona === "string" && payload.positivePersona.trim()) {
      positivePersonaId = await ensurePersonaInHistory("positive", payload.positivePersona);
    }

    let negativePersonaId: string | null = null;
    if (typeof payload.negativePersona === "string" && payload.negativePersona.trim()) {
      negativePersonaId = await ensurePersonaInHistory("negative", payload.negativePersona);
    }

    // Validate and set defaults for direct values
    const temperature = typeof payload.temperature === "number" && Number.isFinite(payload.temperature)
      ? Math.max(0, Math.min(2, payload.temperature))
      : 0.8;

    const weightPositive = typeof payload.weightPositive === "number" && Number.isFinite(payload.weightPositive)
      ? Math.max(0, Math.min(100, Math.round(payload.weightPositive)))
      : 50;

    const weightNegative = typeof payload.weightNegative === "number" && Number.isFinite(payload.weightNegative)
      ? Math.max(0, Math.min(100, Math.round(payload.weightNegative)))
      : 50;

    const streamContext = typeof payload.streamContext === "string" ? payload.streamContext.trim() : "";

    // Save the preset
    const presetId = await insertSettingsPreset(
      presetName,
      botsPresetId,
      positivePersonaId,
      negativePersonaId,
      temperature,
      weightPositive,
      weightNegative,
      streamContext,
    );

    res.status(201).send({
      status: "created",
      id: presetId,
      message: "Settings preset saved successfully",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[History] Failed to insert settings preset", {
      error: errorMessage,
      presetName,
    });
    res.status(500).send({
      error: "Failed to save settings preset",
      details: errorMessage,
    });
  }
});

app.get("/settings/presets", async (req, res) => {
  const query = (req.query ?? {}) as { limit?: string };
  const limit = parseHistoryLimit(query.limit, 50);
  try {
    const presets = await fetchSettingsPresets(limit);
    res.send({
      status: "ok",
      presets,
    });
  } catch (error) {
    console.error("[History] Failed to fetch settings presets", error);
    res.status(500).send({ error: "Failed to load settings presets" });
  }
});

app.put("/settings/presets/:id", async (req, res) => {
  const presetId = req.params.id?.trim() || "";
  if (!presetId) {
    res.status(400).send({ error: "Preset ID is required" });
    return;
  }

  if (!req.body || typeof req.body !== "object") {
    res.status(400).send({ error: "Invalid payload" });
    return;
  }

  const payload = req.body as {
    presetName?: string;
    botsPresetId?: string;
    botNames?: string[];
    positivePersona?: string;
    negativePersona?: string;
    temperature?: number;
    weightPositive?: number;
    weightNegative?: number;
    streamContext?: string;
  };

  try {
    // Verify preset exists
    const existingPreset = await fetchSettingsPresetById(presetId);
    if (!existingPreset) {
      res.status(404).send({ error: "Preset not found" });
      return;
    }

    // Handle bot preset
    let botsPresetId: string | null = existingPreset.bots_preset_id;
    if (payload.botsPresetId !== undefined) {
      if (payload.botsPresetId) {
        botsPresetId = payload.botsPresetId.trim();
        // Verify it exists
        const existing = await fetchBotNamePresetById(botsPresetId);
        if (!existing) {
          res.status(404).send({ error: "Referenced bot preset not found" });
          return;
        }
      } else {
        botsPresetId = null;
      }
    } else if (Array.isArray(payload.botNames) && payload.botNames.length > 0) {
      const sanitizedNames = payload.botNames
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter((name) => name.length > 0)
        .map((name) => name.replace(/\s+/g, ""))
        .slice(0, MAX_BOT_COUNT);
      if (sanitizedNames.length > 0) {
        botsPresetId = await findOrCreateBotPreset(sanitizedNames);
      }
    }

    // Handle personas - ensure they exist in history
    let positivePersonaId: string | null = existingPreset.positive_persona_id;
    if (typeof payload.positivePersona === "string") {
      if (payload.positivePersona.trim()) {
        positivePersonaId = await ensurePersonaInHistory("positive", payload.positivePersona);
      } else {
        positivePersonaId = null;
      }
    }

    let negativePersonaId: string | null = existingPreset.negative_persona_id;
    if (typeof payload.negativePersona === "string") {
      if (payload.negativePersona.trim()) {
        negativePersonaId = await ensurePersonaInHistory("negative", payload.negativePersona);
      } else {
        negativePersonaId = null;
      }
    }

    // Validate and set defaults for direct values
    const presetName = typeof payload.presetName === "string" ? payload.presetName.trim() : existingPreset.preset_name;
    const temperature = typeof payload.temperature === "number" && Number.isFinite(payload.temperature)
      ? Math.max(0, Math.min(2, payload.temperature))
      : existingPreset.temperature;

    const weightPositive = typeof payload.weightPositive === "number" && Number.isFinite(payload.weightPositive)
      ? Math.max(0, Math.min(100, Math.round(payload.weightPositive)))
      : existingPreset.weight_positive;

    const weightNegative = typeof payload.weightNegative === "number" && Number.isFinite(payload.weightNegative)
      ? Math.max(0, Math.min(100, Math.round(payload.weightNegative)))
      : existingPreset.weight_negative;

    const streamContext = typeof payload.streamContext === "string" ? payload.streamContext.trim() : existingPreset.stream_context;

    // Update the preset
    await updateSettingsPreset(
      presetId,
      presetName,
      botsPresetId,
      positivePersonaId,
      negativePersonaId,
      temperature,
      weightPositive,
      weightNegative,
      streamContext,
    );

    res.status(200).send({
      status: "updated",
      message: "Settings preset updated successfully",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[History] Failed to update settings preset", {
      error: errorMessage,
      presetId,
    });
    res.status(500).send({
      error: "Failed to update settings preset",
      details: errorMessage,
    });
  }
});

app.post("/settings/presets/load", async (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).send({ error: "Invalid payload" });
    return;
  }

  const payload = req.body as { id?: string };
  const presetId = typeof payload.id === "string" ? payload.id.trim() : "";

  if (!presetId) {
    res.status(400).send({ error: "id is required" });
    return;
  }

  try {
    const preset = await fetchSettingsPresetById(presetId);
    if (!preset) {
      res.status(404).send({ error: "Preset not found" });
      return;
    }

    const updates: Partial<typeof botSettings> = {};

    // Apply bot names if available
    if (preset.bot_names && Array.isArray(preset.bot_names) && preset.bot_names.length > 0) {
      const sanitizedNames = ensureBotNames(preset.bot_names, preset.bot_names.length);
      const targetCount = sanitizeBotCount(sanitizedNames.length, sanitizedNames.length);
      updates.botNames = ensureBotNames(sanitizedNames, targetCount);
      updates.numBots = updates.botNames.length;
    }

    // Apply temperature
    if (Number.isFinite(preset.temperature)) {
      updates.temperature = Math.max(0, Math.min(2, preset.temperature));
    }

    // Apply stream context
    if (typeof preset.stream_context === "string") {
      updates.streamContext = preset.stream_context;
    }

    // Apply prompt bodies if personas are available
    if (preset.positive_persona || preset.negative_persona) {
      const currentPrompts = mapPromptBodies(botSettings.promptBodies);
      const positiveInstructions = preset.positive_persona || currentPrompts.get("positive")?.instructions || "";
      const negativeInstructions = preset.negative_persona || currentPrompts.get("negative")?.instructions || "";

      const weightPositive = Number.isFinite(preset.weight_positive) ? preset.weight_positive : 50;
      const weightNegative = Number.isFinite(preset.weight_negative) ? preset.weight_negative : 50;

      updates.promptBodies = [
        {
          id: "positive",
          label: "Positive",
          instructions: positiveInstructions,
          weight: weightPositive,
        },
        {
          id: "negative",
          label: "Negative",
          instructions: negativeInstructions,
          weight: weightNegative,
        },
      ];
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      applyBotSettings(updates);
      restartAIResponders();
    }

    res.status(200).send({
      status: "loaded",
      settings: getPublicBotSettings(),
    });
  } catch (error) {
    console.error("[History] Failed to load settings preset", error);
    res.status(500).send({ error: "Failed to load settings preset" });
  }
});

app.post("/speech/transcribe", upload.single("audio"), async (req, res) => {
  if (!OPENAI_API_KEY || !openAIClient) {
    res.status(503).send({ error: "OPENAI_API_KEY not configured" });
    return;
  }

  const fileUpload = (req as Request & { file?: Express.Multer.File }).file;
  if (!fileUpload) {
    res.status(400).send({ error: "audio file is required" });
    return;
  }

  try {
    // Determine file extension and MIME type based on uploaded file
    const mimeType = fileUpload.mimetype || "audio/webm";
    let extension = "webm";
    let finalMimeType = mimeType;
    
    // Handle iOS audio formats
    if (mimeType === "audio/m4a" || mimeType === "audio/x-m4a" || mimeType === "audio/mp4") {
      extension = "m4a";
      finalMimeType = "audio/m4a";
    } else if (mimeType === "audio/caf" || mimeType === "audio/x-caf") {
      extension = "caf";
      finalMimeType = "audio/caf";
    } else if (mimeType === "audio/webm") {
      extension = "webm";
      finalMimeType = "audio/webm";
    } else {
      // Default to webm if unknown
      extension = "webm";
      finalMimeType = "audio/webm";
    }

    const file = await toFile(
      fileUpload.buffer,
      fileUpload.originalname || `speech.${extension}`,
      {
        type: finalMimeType,
      },
    );

    const transcription = await openAIClient.audio.transcriptions.create({
      file,
      model: OPENAI_TRANSCRIPTION_MODEL,
      response_format: "json",
    });

    const text = transcription.text?.trim() ?? "";
    res.send({ status: "ok", text });
  } catch (error) {
    const maybeResponse = (error as { response?: { status?: number; statusText?: string; data?: unknown } }).response;
    if (maybeResponse) {
      console.error("[Speech] Transcription failed:", {
        status: maybeResponse.status,
        statusText: maybeResponse.statusText,
        data: maybeResponse.data,
      });
    } else {
      console.error("[Speech] Transcription failed:", error);
    }
    res.status(500).send({ error: "Failed to transcribe audio" });
  }
});

app.post("/realtime/transcript", (req, res) => {
  if (Date.now() < sttSuppressedUntil) {
    res.status(202).send({ status: "suppressed" });
    return;
  }

  const content =
    typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    res.status(400).send({ error: "content is required" });
    return;
  }

  const username =
    typeof req.body?.username === "string" && req.body.username.trim().length > 0
      ? req.body.username.trim()
      : STREAMER_USERNAME;

  const message = createMessageFromPayload({
    username,
    content,
    role: "streamer",
  });
  appendMessage(message);
  res.status(202).send({ status: "accepted", message });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const chatHistory: ChatMessage[] = [];
const messageListeners = new Set<MessageListener>();
let sttSuppressedUntil = 0;
let activeInjection: { content: string; expiresAt: number } | null = null;

interface BotSettings {
  numBots: number;
  temperature: number;
  botNames: string[];
  promptBodies: PromptBody[];
  streamContext: string;
}

const botSettings: BotSettings = {
  numBots: DEFAULT_BOT_COUNT,
  temperature: DEFAULT_BOT_TEMPERATURE,
  botNames: [],
  promptBodies: getDefaultPromptBodies(),
  streamContext: DEFAULT_STREAM_CONTEXT,
};

let activeBotHandles: AIResponderHandle[] = [];

function broadcastMessage(message: ChatMessage) {
  const payload = JSON.stringify({ type: "chat_message", data: message });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastPurge() {
  const payload = JSON.stringify({ type: "chat_purge" });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function notifyMessageListeners(message: ChatMessage) {
  messageListeners.forEach((listener) => {
    try {
      listener(message);
    } catch (error) {
      console.error("[Server] Message listener failed", error);
    }
  });
}

function onMessage(listener: MessageListener) {
  messageListeners.add(listener);
  return () => messageListeners.delete(listener);
}

function getRecentMessages() {
  return [...chatHistory];
}

function getSessionSummary() {
  return "";
}

function appendMessage(message: ChatMessage) {
  chatHistory.push(message);
  if (chatHistory.length > CHAT_HISTORY_LIMIT) {
    chatHistory.splice(0, chatHistory.length - CHAT_HISTORY_LIMIT);
  }
  broadcastMessage(message);
  notifyMessageListeners(message);
}

interface IncomingMessagePayload {
  username: string;
  content: string;
  role?: ChatRole;
}

function createMessageFromPayload(payload: IncomingMessagePayload): ChatMessage {
  const role = payload.role && ROLES.includes(payload.role) ? payload.role : "viewer";
  const username = payload.username.trim();
  const content = payload.content.trim();
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    username,
    role,
    content,
  };
}

function injectInstructionMessage({
  content,
  username = INJECTION_USERNAME,
  role = "streamer",
}: {
  content: string;
  username?: string;
  role?: ChatRole;
}): ChatMessage {
  const message = createMessageFromPayload({
    username,
    content,
    role,
  });
  const normalizedName = username.trim().toLowerCase();
  if (normalizedName === INJECTION_USERNAME.toLowerCase()) {
    const expiresAt = Date.now() + INJECTION_SUPPRESSION_MS;
    sttSuppressedUntil = expiresAt;
    activeInjection = {
      content,
      expiresAt,
    };
  }
  appendMessage(message);
  return message;
}

function getActiveInjectionInstruction(): string | null {
  if (!activeInjection) {
    return null;
  }

  if (Date.now() > activeInjection.expiresAt) {
    activeInjection = null;
    return null;
  }

  return activeInjection.content;
}

const BOT_SEGMENT_SENTENCE_REGEX = /[^.!?]+[.!?]+/g;
const BOT_SEGMENT_MAX_LENGTH = 90;
const BOT_SEGMENT_MIN_LENGTH = 3;
const BOT_SEGMENT_MAX_COUNT = 5;
const BOT_SEGMENT_BASE_DELAY_MS = 220;
const BOT_SEGMENT_DELAY_JITTER_MS = 360;

function splitBotContentIntoSegments(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  const candidateSentences: string[] = [];
  const lines = trimmed.split(/\s*\n+\s*/);

  lines.forEach((line) => {
    const normalized = line.trim();
    if (!normalized) {
      return;
    }

    BOT_SEGMENT_SENTENCE_REGEX.lastIndex = 0;
    let consumedIndex = 0;
    let match: RegExpExecArray | null;

    // eslint-disable-next-line no-cond-assign
    while ((match = BOT_SEGMENT_SENTENCE_REGEX.exec(normalized)) !== null) {
      candidateSentences.push(match[0].trim());
      consumedIndex = BOT_SEGMENT_SENTENCE_REGEX.lastIndex;
    }

    const remainder = normalized.slice(consumedIndex).trim();
    if (remainder) {
      candidateSentences.push(remainder);
    }
  });

  if (candidateSentences.length === 0) {
    candidateSentences.push(trimmed);
  }

  const segments: string[] = [];

  candidateSentences.forEach((sentence) => {
    if (sentence.length <= BOT_SEGMENT_MAX_LENGTH) {
      segments.push(sentence);
      return;
    }

    const words = sentence.split(/\s+/);
    let buffer = "";
    words.forEach((word) => {
      const candidate = buffer ? `${buffer} ${word}` : word;
      if (candidate.length <= BOT_SEGMENT_MAX_LENGTH) {
        buffer = candidate;
        return;
      }
      if (buffer) {
        segments.push(buffer);
      }
      buffer = word;
    });

    if (buffer) {
      segments.push(buffer);
    }
  });

  const filtered = segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= BOT_SEGMENT_MIN_LENGTH);

  if (filtered.length <= BOT_SEGMENT_MAX_COUNT) {
    return filtered;
  }

  const limited = filtered.slice(0, BOT_SEGMENT_MAX_COUNT - 1);
  const overflow = filtered.slice(BOT_SEGMENT_MAX_COUNT - 1);
  limited.push(overflow.join(" ").trim());
  return limited;
}

function emitBotContentBurst(username: string, content: string) {
  const segments = splitBotContentIntoSegments(content);
  if (segments.length === 0) {
    return;
  }

  let cumulativeDelay = 0;

  segments.forEach((segment, index) => {
    const delay =
      index === 0
        ? 0
        : BOT_SEGMENT_BASE_DELAY_MS +
          Math.floor(Math.random() * BOT_SEGMENT_DELAY_JITTER_MS);
    cumulativeDelay += delay;

    setTimeout(() => {
      const message = createMessageFromPayload({
        username,
        content: segment,
        role: "bot",
      });
      appendMessage(message);
    }, cumulativeDelay);
  });
}

app.post("/inject", (req, res) => {
  const { username, content, role } = req.body as IncomingMessagePayload;

  const trimmedContent = typeof content === "string" ? content.trim() : "";
  if (!trimmedContent) {
    res.status(400).send({ error: "content is required" });
    return;
  }

  const trimmedUsername =
    typeof username === "string" && username.trim().length > 0 ? username.trim() : INJECTION_USERNAME;

  const message = injectInstructionMessage({
    username: trimmedUsername,
    content: trimmedContent,
    role,
  });

  res.status(202).send({ status: "accepted", message });
});

app.post("/injection", (req, res) => {
  const rawContent = typeof req.body?.content === "string" ? req.body.content : "";
  const content = rawContent.trim();

  if (!content) {
    res.status(400).send({ error: "content is required" });
    return;
  }

  const message = injectInstructionMessage({ content });

  res.status(202).send({ status: "accepted", message });
});

app.post("/chat/purge", (req, res) => {
  chatHistory.length = 0;
  activeInjection = null;
  sttSuppressedUntil = 0;
  broadcastPurge();
  res.status(200).send({ status: "purged" });
});

wss.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      type: "chat_history",
      data: chatHistory,
    }),
  );
});

const BOT_NAME_PREFIXES = [
  "Glitch",
  "Neon",
  "Pixel",
  "Turbo",
  "Shadow",
  "Echo",
  "Nova",
  "Hyper",
  "Quantum",
  "Cyber",
  "Rogue",
  "Pulse",
];

const BOT_NAME_SUFFIXES = [
  "Caster",
  "Storm",
  "Spark",
  "Flux",
  "Shift",
  "Drift",
  "Vibe",
  "Rush",
  "Loop",
  "Phantom",
  "Groove",
  "Whisper",
];

function generateBotNames(count: number): string[] {
  const names: string[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    let candidate = buildBotName(i);
    let attempt = 0;
    while (used.has(candidate) && attempt < 10) {
      candidate = `${buildBotName((i + attempt + 1) % (BOT_NAME_PREFIXES.length * BOT_NAME_SUFFIXES.length))}_${attempt + 2}`;
      attempt += 1;
    }
    if (used.has(candidate)) {
      candidate = `${BOT_USERNAME_SEED}${i + 1}`;
    }
    used.add(candidate);
    names.push(candidate);
  }
  return names;
}

function buildBotName(index: number): string {
  const prefix = BOT_NAME_PREFIXES[index % BOT_NAME_PREFIXES.length];
  const suffixIndex = Math.floor(index / BOT_NAME_PREFIXES.length) % BOT_NAME_SUFFIXES.length;
  const suffix = BOT_NAME_SUFFIXES[suffixIndex];
  return `${prefix}${suffix}`;
}

function ensureBotNames(existing: string[], targetCount: number): string[] {
  const sanitizedExisting = existing
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => name.replace(/\s+/g, ""));

  const uniqueExisting: string[] = [];
  const seen = new Set<string>();
  sanitizedExisting.forEach((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      uniqueExisting.push(name);
    }
  });

  const result = uniqueExisting.slice(0, targetCount);
  const used = new Set(result);

  if (result.length === targetCount) {
    return result;
  }

  const generated = generateBotNames(targetCount);
  for (const candidate of generated) {
    if (result.length >= targetCount) {
      break;
    }
    if (!used.has(candidate)) {
      used.add(candidate);
      result.push(candidate);
    }
  }

  while (result.length < targetCount) {
    const fallback = `${BOT_USERNAME_SEED}${result.length + 1}`;
    if (!used.has(fallback)) {
      used.add(fallback);
      result.push(fallback);
    } else {
      const alternative = `${fallback}_${result.length + 1}`;
      if (!used.has(alternative)) {
        used.add(alternative);
        result.push(alternative);
      } else {
        result.push(`${BOT_USERNAME_SEED}_${Date.now()}`);
      }
    }
  }

  return result;
}

function sanitizeBotCount(value: unknown, fallback = 1): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(MAX_BOT_COUNT, Math.max(0, Math.floor(parsed)));
}

function sanitizeTemperature(value: unknown, fallback = 0.8): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(2, Math.max(0, parsed));
}

function sanitizePersona(value: unknown, fallback = DEFAULT_PROMPT_BODIES[0].instructions): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed.length > 2_000) {
    return trimmed.slice(0, 2_000);
  }
  return trimmed;
}

function sanitizeStreamContext(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length > 2_000) {
    return trimmed.slice(0, 2_000);
  }
  return trimmed;
}

function clampPromptWeight(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseFloat(String(value ?? ""));
  const baseline = Number.isFinite(parsed) ? parsed : fallback;
  if (!Number.isFinite(baseline)) {
    return 50;
  }
  return Math.max(0, Math.min(100, Math.round(baseline)));
}

function sanitizePromptBody(candidate: unknown, fallback: PromptBody): PromptBody {
  const source =
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? (candidate as Record<string, unknown>)
      : {};

  const instructions = sanitizePersona(source.instructions, fallback.instructions);
  const weight = clampPromptWeight(source.weight, fallback.weight);

  return {
    id: fallback.id,
    label: fallback.label,
    instructions,
    weight,
  };
}

function sanitizePromptBodies(value: unknown, fallbackBodies: PromptBody[]): PromptBody[] {
  const fallbackByKey = new Map<PromptKey, PromptBody>();
  PROMPT_KEYS.forEach((key, index) => {
    const fallback =
      fallbackBodies.find((body) => body.id === key) ??
      DEFAULT_PROMPT_BODIES.find((body) => body.id === key);
    if (fallback) {
      fallbackByKey.set(key, { ...fallback });
    }
  });

  const incomingArray = Array.isArray(value) ? value : [];
  const incomingById = new Map<PromptKey, unknown>();

  incomingArray.forEach((entry, index) => {
    const entryId = typeof (entry as { id?: string })?.id === "string" ? (entry as { id?: string }).id : undefined;
    if (entryId && PROMPT_KEYS.includes(entryId as PromptKey)) {
      incomingById.set(entryId as PromptKey, entry);
    } else if (index < PROMPT_KEYS.length) {
      incomingById.set(PROMPT_KEYS[index], entry);
    }
  });

  if (value && typeof value === "object" && !Array.isArray(value)) {
    PROMPT_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value as Record<string, unknown>, key)) {
        incomingById.set(key, (value as Record<string, unknown>)[key]);
      }
    });
  }

  const sanitizedBodies = PROMPT_KEYS.map((key) => {
    const fallback = fallbackByKey.get(key) ?? DEFAULT_PROMPT_BODIES.find((body) => body.id === key)!;
    const candidate = incomingById.has(key) ? incomingById.get(key) : undefined;
    return sanitizePromptBody(candidate, fallback);
  });

  const primary = sanitizedBodies[0];
  const secondary = sanitizedBodies[1];
  const adjustedPrimaryWeight = clampPromptWeight(primary.weight, primary.weight);
  sanitizedBodies[0] = { ...primary, weight: adjustedPrimaryWeight };
  sanitizedBodies[1] = {
    ...secondary,
    weight: Math.max(0, Math.min(100, 100 - adjustedPrimaryWeight)),
  };

  return sanitizedBodies;
}

function buildPersonaAssignments(count: number, promptBodies: PromptBody[]): string[] {
  if (count <= 0) {
    return [];
  }

  const sanitized = sanitizePromptBodies(promptBodies, promptBodies);
  const primary = sanitized[0];
  const secondary = sanitized[1] ?? sanitized[0];

  if (count === 1) {
    return [primary.instructions];
  }

  const primaryWeight = Math.max(0, primary.weight);
  const secondaryWeight = Math.max(0, secondary.weight);
  const totalWeight = primaryWeight + secondaryWeight;

  if (totalWeight <= 0) {
    return Array.from({ length: count }, () => primary.instructions);
  }

  let primaryCount = Math.round((primaryWeight / totalWeight) * count);
  primaryCount = Math.min(count, Math.max(0, primaryCount));

  let secondaryCount = count - primaryCount;

  if (primaryWeight > 0 && primaryCount === 0) {
    primaryCount = 1;
    secondaryCount = count - primaryCount;
  }

  if (secondaryWeight > 0 && secondaryCount === 0) {
    secondaryCount = 1;
    primaryCount = count - secondaryCount;
  }

  const personas = [
    ...Array.from({ length: primaryCount }, () => primary.instructions),
    ...Array.from({ length: secondaryCount }, () => secondary.instructions),
  ];

  while (personas.length < count) {
    personas.push(primary.instructions);
  }

  return personas;
}

function getPublicBotSettings() {
  botSettings.botNames = ensureBotNames(botSettings.botNames, botSettings.numBots);
  return {
    numBots: botSettings.numBots,
    temperature: botSettings.temperature,
    botNames: [...botSettings.botNames],
    promptBodies: botSettings.promptBodies.map((body) => ({ ...body })),
    streamContext: botSettings.streamContext,
  };
}

function stopActiveAIResponders() {
  activeBotHandles.forEach((handle) => {
    try {
      handle.stop();
    } catch (error) {
      console.error("[AI] Failed to stop responder", error);
    }
  });
  activeBotHandles = [];
}

function restartAIResponders() {
  stopActiveAIResponders();

  if (botSettings.numBots <= 0) {
    console.info("[AI] Bot responders disabled (numBots <= 0)");
    return;
  }

  botSettings.botNames = ensureBotNames(botSettings.botNames, botSettings.numBots);

  const replyChance = Number.isFinite(AI_REPLY_CHANCE)
    ? Math.max(0, Math.min(1, AI_REPLY_CHANCE))
    : 0.15;
  const minInterval = Number.isFinite(AI_MIN_INTERVAL_MS)
    ? Math.max(1_000, AI_MIN_INTERVAL_MS)
    : 8_000;
  const maxContext = Number.isFinite(AI_MAX_CONTEXT)
    ? Math.max(5, AI_MAX_CONTEXT)
    : 15;

  const personas = buildPersonaAssignments(botSettings.numBots, botSettings.promptBodies);

  activeBotHandles = launchMultipleAIResponders({
    count: botSettings.numBots,
    nameGenerator: (index) => botSettings.botNames[index] ?? `${BOT_USERNAME_SEED}${index + 1}`,
    personas,
    model: OPENAI_MODEL,
    replyChance,
    triggerKeywords: ["bot", "ai", "robot", "assistant"],
    minResponseIntervalMs: minInterval,
    maxContextMessages: maxContext,
    temperature: botSettings.temperature,
    onMessage,
    getRecentMessages,
    getSessionSummary,
    emitBotMessage: (username, content) => {
      emitBotContentBurst(username, content);
    },
    streamContext: botSettings.streamContext,
    getActiveInjection: getActiveInjectionInstruction,
  });

  console.info(`[AI] Launched ${activeBotHandles.length} bot responder(s)`);
}

function applyBotSettings(
  updates: Partial<
    Pick<BotSettings, "numBots" | "temperature" | "promptBodies" | "streamContext" | "botNames">
  >,
) {
  let changed = false;
  let processed = false;

  if (Object.prototype.hasOwnProperty.call(updates, "numBots")) {
    const sanitized = sanitizeBotCount(updates.numBots, botSettings.numBots);
    if (sanitized !== botSettings.numBots) {
      botSettings.numBots = sanitized;
      changed = true;
    }
    // Always ensure bot names match the current count
    botSettings.botNames = ensureBotNames(botSettings.botNames, botSettings.numBots);
    processed = true;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "temperature")) {
    const sanitizedTemp = sanitizeTemperature(updates.temperature, botSettings.temperature);
    if (sanitizedTemp !== botSettings.temperature) {
      botSettings.temperature = sanitizedTemp;
      changed = true;
    }
    processed = true;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "promptBodies")) {
    const sanitizedPrompts = sanitizePromptBodies(
      updates.promptBodies ?? botSettings.promptBodies,
      botSettings.promptBodies,
    );

    const promptsChanged =
      sanitizedPrompts.length !== botSettings.promptBodies.length ||
      sanitizedPrompts.some((body, index) => {
        const existing = botSettings.promptBodies[index];
        if (!existing) {
          return true;
        }
        return (
          body.instructions !== existing.instructions || body.weight !== existing.weight
        );
      });

    botSettings.promptBodies = sanitizedPrompts;
    if (promptsChanged) {
      changed = true;
    }
    processed = true;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "streamContext")) {
    const sanitizedContext = sanitizeStreamContext(
      updates.streamContext,
      botSettings.streamContext,
    );
    if (sanitizedContext !== botSettings.streamContext) {
      botSettings.streamContext = sanitizedContext;
      changed = true;
    }
    processed = true;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "botNames")) {
    const incomingNames = updates.botNames ?? [];
    const sanitizedNames = ensureBotNames(incomingNames, botSettings.numBots);
    const namesChanged =
      sanitizedNames.length !== botSettings.botNames.length ||
      sanitizedNames.some((name, index) => botSettings.botNames[index] !== name);
    if (namesChanged) {
      botSettings.botNames = sanitizedNames;
      changed = true;
    }
    processed = true;
  }

  if (changed) {
    restartAIResponders();
  } else if (processed) {
    // Ensure botNames reflects current count even if unchanged
    botSettings.botNames = ensureBotNames(botSettings.botNames, botSettings.numBots);
  }

  return changed;
}

httpServer.listen(PORT, () => {
  console.log(`Fake chat overlay server listening on http://localhost:${PORT}`);
  restartAIResponders();
});

