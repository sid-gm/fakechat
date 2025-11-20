import type { VercelRequest, VercelResponse } from "../../../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../../../src/api/utils";
import { fetchSettingsPresetById } from "../../../src/storage/history";
import { getBotSettings, setBotSettings, getPublicBotSettings, applyBotSettings } from "../../../src/api/botSettings";
import { ensureBotNames } from "../../../src/api/botSettings";

function sanitizeBotCount(value: unknown, fallback = 1): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(25, Math.max(0, Math.floor(parsed)));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    errorResponse(res, "Method not allowed", 405);
    return;
  }

  if (!req.body || typeof req.body !== "object") {
    errorResponse(res, "Invalid payload", 400);
    return;
  }

  const payload = req.body as { id?: string };
  const presetId = typeof payload.id === "string" ? payload.id.trim() : "";

  if (!presetId) {
    errorResponse(res, "id is required", 400);
    return;
  }

  try {
    const preset = await fetchSettingsPresetById(presetId);
    if (!preset) {
      errorResponse(res, "Preset not found", 404);
      return;
    }

    const updates: Partial<{
      numBots: number;
      botNames: string[];
      temperature: number;
      streamContext: string;
      promptBodies: Array<{
        id: string;
        label: string;
        instructions: string;
        weight: number;
      }>;
    }> = {};

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
      const positiveInstructions = preset.positive_persona || "";
      const negativeInstructions = preset.negative_persona || "";

      const weightPositive = Number.isFinite(preset.weight_positive) ? preset.weight_positive : 50;
      const weightNegative = Number.isFinite(preset.weight_negative) ? preset.weight_negative : 50;

      updates.promptBodies = [
        {
          id: "positive" as const,
          label: "Positive",
          instructions: positiveInstructions,
          weight: weightPositive,
        },
        {
          id: "negative" as const,
          label: "Negative",
          instructions: negativeInstructions,
          weight: weightNegative,
        },
      ];
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await applyBotSettings(updates);
    }

    const publicSettings = await getPublicBotSettings();
    jsonResponse(res, {
      status: "loaded",
      settings: publicSettings,
    });
  } catch (error) {
    console.error("[History] Failed to load settings preset", error);
    errorResponse(res, "Failed to load settings preset");
  }
}

