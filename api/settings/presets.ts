import type { VercelRequest, VercelResponse } from "../../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../../src/api/utils";
import {
  insertSettingsPreset,
  fetchSettingsPresets,
  fetchSettingsPresetById,
  fetchBotNamePresetById,
  findOrCreateBotPreset,
  ensurePersonaInHistory,
  type PersonaHistoryType,
} from "../../src/storage/history";
import { getBotSettings, setBotSettings, getPublicBotSettings, applyBotSettings } from "../../src/api/botSettings";
import { ensureBotNames } from "../../src/api/botSettings";

const MAX_BOT_COUNT = 25;

function parseHistoryLimit(value: unknown, fallback = 50) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

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

  if (req.method === "GET") {
    try {
      const query = req.query ?? {};
      const limit = parseHistoryLimit(query.limit, 50);
      const presets = await fetchSettingsPresets(limit);
      jsonResponse(res, {
        status: "ok",
        presets,
      });
    } catch (error) {
      console.error("[History] Failed to fetch settings presets", error);
      errorResponse(res, "Failed to load settings presets");
    }
    return;
  }

  if (req.method === "POST") {
    if (!req.body || typeof req.body !== "object") {
      errorResponse(res, "Invalid payload", 400);
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
      id?: string;
    };

    // Check if this is a load operation (has id but no presetName)
    if (payload.id && !payload.presetName) {
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
      return;
    }

    // Otherwise, this is a create operation
    const presetName = typeof payload.presetName === "string" ? payload.presetName.trim() : "";
    if (!presetName) {
      errorResponse(res, "presetName is required", 400);
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
          errorResponse(res, "Referenced bot preset not found", 404);
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
        positivePersonaId = await ensurePersonaInHistory("positive" as PersonaHistoryType, payload.positivePersona);
      }

      let negativePersonaId: string | null = null;
      if (typeof payload.negativePersona === "string" && payload.negativePersona.trim()) {
        negativePersonaId = await ensurePersonaInHistory("negative" as PersonaHistoryType, payload.negativePersona);
      }

      // Validate and set defaults for direct values
      const temperature =
        typeof payload.temperature === "number" && Number.isFinite(payload.temperature)
          ? Math.max(0, Math.min(2, payload.temperature))
          : 0.8;

      const weightPositive =
        typeof payload.weightPositive === "number" && Number.isFinite(payload.weightPositive)
          ? Math.max(0, Math.min(100, Math.round(payload.weightPositive)))
          : 50;

      const weightNegative =
        typeof payload.weightNegative === "number" && Number.isFinite(payload.weightNegative)
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

      jsonResponse(
        res,
        {
          status: "created",
          id: presetId,
          message: "Settings preset saved successfully",
        },
        201,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[History] Failed to insert settings preset", {
        error: errorMessage,
        presetName,
      });
      errorResponse(res, `Failed to save settings preset: ${errorMessage}`);
    }
    return;
  }

  errorResponse(res, "Method not allowed", 405);
}


