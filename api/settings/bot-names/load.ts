import type { VercelRequest, VercelResponse } from "../../../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../../../src/api/utils";
import { fetchBotNamePresetById } from "../../../src/storage/history";
import { getBotSettings, setBotSettings, getPublicBotSettings } from "../../../src/api/botSettings";
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
}

