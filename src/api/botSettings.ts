import type { BotSettings } from "../storage/kv";
import {
  insertPersonaHistory,
  insertStreamContextHistory,
  type PersonaHistoryType,
} from "../storage/history";

export interface PromptBody {
  id: "positive" | "negative";
  label: string;
  instructions: string;
  weight: number;
}

const MAX_BOT_COUNT = 25;
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
const BOT_USERNAME_SEED = process.env.BOT_USERNAME?.trim() || "AiChatter";

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

export function ensureBotNames(existing: string[], targetCount: number): string[] {
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

  const instructions =
    typeof source.instructions === "string" && source.instructions.trim()
      ? source.instructions.trim().slice(0, 2_000)
      : fallback.instructions;
  const weight = clampPromptWeight(source.weight, fallback.weight);

  return {
    id: fallback.id as "positive" | "negative",
    label: fallback.label,
    instructions,
    weight,
  };
}

const PROMPT_KEYS: Array<"positive" | "negative"> = ["positive", "negative"];

function sanitizePromptBodies(value: unknown, fallbackBodies: PromptBody[]): PromptBody[] {
  const fallbackByKey = new Map<"positive" | "negative", PromptBody>();
  PROMPT_KEYS.forEach((key, index) => {
    const fallback =
      fallbackBodies.find((body) => body.id === key) ??
      fallbackBodies[index] ??
      {
        id: key,
        label: key === "positive" ? "Positive" : "Negative",
        instructions: "",
        weight: 50,
      };
    fallbackByKey.set(key, { ...fallback });
  });

  const incomingArray = Array.isArray(value) ? value : [];
  const incomingById = new Map<"positive" | "negative", unknown>();

  incomingArray.forEach((entry, index) => {
    const entryId =
      typeof (entry as { id?: string })?.id === "string"
        ? ((entry as { id?: string }).id as "positive" | "negative")
        : undefined;
    if (entryId && PROMPT_KEYS.includes(entryId)) {
      incomingById.set(entryId, entry);
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
    const fallback =
      fallbackByKey.get(key) ??
      ({
        id: key,
        label: key === "positive" ? "Positive" : "Negative",
        instructions: "",
        weight: 50,
      } as PromptBody);
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

  // TypeScript needs explicit assertion here because the id property comes from the key
  return sanitizedBodies as PromptBody[];
}

const DEFAULT_PROMPT_BODIES: PromptBody[] = [
  {
    id: "positive",
    label: "Positive",
    instructions:
      process.env.BOT_PERSONA?.trim() ||
      "you are a supportive hype co-host who keeps morale high, celebrates wins, and encourages the streamer and chat.",
    weight: 50,
  },
  {
    id: "negative",
    label: "Negative",
    instructions:
      process.env.BOT_NEGATIVE_PERSONA?.trim() ||
      "you are a sarcastic contrarian co-host who playfully roasts the streamer and viewers, leaning into chaotic, negative banter.",
    weight: 50,
  },
];

export async function getDefaultBotSettings(): Promise<BotSettings> {
  const DEFAULT_BOT_COUNT = sanitizeBotCount(
    Number.parseInt(process.env.AI_BOT_COUNT ?? "1", 10),
    1,
  );
  const DEFAULT_BOT_TEMPERATURE = sanitizeTemperature(
    Number.parseFloat(process.env.AI_TEMPERATURE ?? "0.8"),
    0.8,
  );

  return {
    numBots: DEFAULT_BOT_COUNT,
    temperature: DEFAULT_BOT_TEMPERATURE,
    botNames: ensureBotNames([], DEFAULT_BOT_COUNT),
    promptBodies: DEFAULT_PROMPT_BODIES.map((body) => ({ ...body })),
    streamContext: "",
  };
}

async function getBotSettingsInternal(): Promise<BotSettings | null> {
  const kvModule = await import("../storage/kv");
  return await kvModule.getBotSettings();
}

async function setBotSettingsInternal(settings: BotSettings): Promise<void> {
  const kvModule = await import("../storage/kv");
  await kvModule.setBotSettings(settings);
}

export async function getBotSettings(): Promise<BotSettings | null> {
  return await getBotSettingsInternal();
}

export async function setBotSettings(settings: BotSettings): Promise<void> {
  await setBotSettingsInternal(settings);
}

export async function getPublicBotSettings(): Promise<BotSettings> {
  const settings = await getBotSettingsInternal();
  const current = settings || (await getDefaultBotSettings());
  
  current.botNames = ensureBotNames(current.botNames, current.numBots);
  
  return {
    numBots: current.numBots,
    temperature: current.temperature,
    botNames: [...current.botNames],
    promptBodies: current.promptBodies.map((body) => ({ ...body })),
    streamContext: current.streamContext,
  };
}

export async function applyBotSettings(
  updates: Partial<
    Pick<BotSettings, "numBots" | "temperature" | "promptBodies" | "streamContext" | "botNames">
  >,
): Promise<boolean> {
  const current = await getBotSettingsInternal();
  const settings = current || (await getDefaultBotSettings());
  
  let changed = false;
  const previousPrompts = new Map(
    settings.promptBodies.map((body) => [body.id, body.instructions]),
  );
  const previousStreamContext = settings.streamContext;

  if (Object.prototype.hasOwnProperty.call(updates, "numBots")) {
    const sanitized = sanitizeBotCount(updates.numBots, settings.numBots);
    if (sanitized !== settings.numBots) {
      settings.numBots = sanitized;
      changed = true;
    }
    settings.botNames = ensureBotNames(settings.botNames, settings.numBots);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "temperature")) {
    const sanitizedTemp = sanitizeTemperature(updates.temperature, settings.temperature);
    if (sanitizedTemp !== settings.temperature) {
      settings.temperature = sanitizedTemp;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, "promptBodies")) {
    const sanitizedPrompts = sanitizePromptBodies(
      updates.promptBodies ?? (settings.promptBodies as PromptBody[]),
      settings.promptBodies as PromptBody[],
    );

    const promptsChanged =
      sanitizedPrompts.length !== settings.promptBodies.length ||
      sanitizedPrompts.some((body, index) => {
        const existing = settings.promptBodies[index];
        if (!existing) {
          return true;
        }
        return (
          body.instructions !== existing.instructions || body.weight !== existing.weight
        );
      });

    settings.promptBodies = sanitizedPrompts as PromptBody[];
    if (promptsChanged) {
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, "streamContext")) {
    const sanitizedContext = sanitizeStreamContext(updates.streamContext, settings.streamContext);
    if (sanitizedContext !== settings.streamContext) {
      settings.streamContext = sanitizedContext;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, "botNames")) {
    const incomingNames = updates.botNames ?? [];
    const sanitizedNames = ensureBotNames(incomingNames, settings.numBots);
    const namesChanged =
      sanitizedNames.length !== settings.botNames.length ||
      sanitizedNames.some((name, index) => settings.botNames[index] !== name);
    if (namesChanged) {
      settings.botNames = sanitizedNames;
      changed = true;
    }
  }

  // Always ensure bot names match count
  settings.botNames = ensureBotNames(settings.botNames, settings.numBots);

  // Save to KV
  await setBotSettingsInternal(settings);

  // Save history for changed personas and stream context
  const historyTasks: Promise<void>[] = [];

  const positiveBefore = previousPrompts.get("positive")?.trim() || "";
  const positiveAfter = settings.promptBodies.find((b) => b.id === "positive")?.instructions.trim() || "";
  if (positiveAfter && positiveAfter !== positiveBefore) {
    historyTasks.push(
      insertPersonaHistory("positive" as PersonaHistoryType, positiveAfter).catch((error) => {
        console.error("[History] Failed to insert positive persona entry", error);
      }),
    );
  }

  const negativeBefore = previousPrompts.get("negative")?.trim() || "";
  const negativeAfter = settings.promptBodies.find((b) => b.id === "negative")?.instructions.trim() || "";
  if (negativeAfter && negativeAfter !== negativeBefore) {
    historyTasks.push(
      insertPersonaHistory("negative" as PersonaHistoryType, negativeAfter).catch((error) => {
        console.error("[History] Failed to insert negative persona entry", error);
      }),
    );
  }

  const newStreamContext = settings.streamContext.trim();
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

  return changed;
}

