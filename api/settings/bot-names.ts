import type { VercelRequest, VercelResponse } from "../../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../../src/api/utils";
import { insertBotNamePreset, fetchBotNamePresets, fetchBotNamePresetById } from "../../src/storage/history";
import { getBotSettings, setBotSettings, getPublicBotSettings } from "../../src/api/botSettings";
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
      const presets = await fetchBotNamePresets(limit);
      jsonResponse(res, {
        status: "ok",
        presets,
      });
    } catch (error) {
      console.error("[History] Failed to fetch bot name presets", error);
      errorResponse(res, "Failed to load bot name presets");
    }
    return;
  }

  if (req.method === "POST") {
    if (!req.body || typeof req.body !== "object") {
      errorResponse(res, "Invalid payload", 400);
      return;
    }

    const payload = req.body as { presetName?: string; botNames?: string[]; id?: string };
    
    // Check if this is a load operation (has id but no presetName)
    if (payload.id && !payload.presetName) {
      const presetId = typeof payload.id === "string" ? payload.id.trim() : "";

      if (!presetId) {
        errorResponse(res, "id is required", 400);
        return;
      }

      try {
        const preset = await fetchBotNamePresetById(presetId);
        if (!preset) {
          errorResponse(res, "Preset not found", 404);
          return;
        }

        const sanitizedNames = ensureBotNames(preset.bot_names, preset.bot_names.length);
        const targetCount = sanitizeBotCount(sanitizedNames.length, sanitizedNames.length);
        
        const currentSettings = await getBotSettings();
        const settings = currentSettings || await getPublicBotSettings();
        
        settings.botNames = ensureBotNames(sanitizedNames, targetCount);
        settings.numBots = settings.botNames.length;

        await setBotSettings(settings);

        const publicSettings = await getPublicBotSettings();
        jsonResponse(res, {
          status: "loaded",
          settings: publicSettings,
        });
      } catch (error) {
        console.error("[History] Failed to load bot name preset", error);
        errorResponse(res, "Failed to load bot name preset");
      }
      return;
    }

    // Otherwise, this is a create operation
    const presetName = typeof payload.presetName === "string" ? payload.presetName.trim() : "";
    const currentSettings = await getBotSettings();
    const botNames = Array.isArray(payload.botNames) ? payload.botNames : (currentSettings?.botNames || []);

    if (!presetName) {
      errorResponse(res, "presetName is required", 400);
      return;
    }

    if (!Array.isArray(botNames) || botNames.length === 0) {
      errorResponse(res, "botNames array is required and cannot be empty", 400);
      return;
    }

    const sanitizedNames = botNames
      .map((name) => (typeof name === "string" ? name.trim() : ""))
      .filter((name) => name.length > 0)
      .map((name) => name.replace(/\s+/g, ""))
      .slice(0, MAX_BOT_COUNT);

    if (sanitizedNames.length === 0) {
      errorResponse(res, "At least one valid bot name is required", 400);
      return;
    }

    try {
      await insertBotNamePreset(presetName, sanitizedNames);
      jsonResponse(res, {
        status: "created",
        message: "Bot name preset saved successfully",
      }, 201);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[History] Failed to insert bot name preset", {
        error: errorMessage,
        presetName,
        botNamesCount: sanitizedNames.length,
      });
      errorResponse(res, `Failed to save bot name preset: ${errorMessage}`);
    }
    return;
  }

  errorResponse(res, "Method not allowed", 405);
}


