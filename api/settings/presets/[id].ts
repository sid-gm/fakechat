import type { VercelRequest, VercelResponse } from "../../../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../../../src/api/utils";
import {
  updateSettingsPreset,
  fetchSettingsPresetById,
  fetchBotNamePresetById,
  findOrCreateBotPreset,
  ensurePersonaInHistory,
  type PersonaHistoryType,
} from "../../../src/storage/history";

const MAX_BOT_COUNT = 25;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "PUT") {
    errorResponse(res, "Method not allowed", 405);
    return;
  }

  const presetId = (req.query.id as string)?.trim() || "";
  if (!presetId) {
    errorResponse(res, "Preset ID is required", 400);
    return;
  }

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
  };

  try {
    // Verify preset exists
    const existingPreset = await fetchSettingsPresetById(presetId);
    if (!existingPreset) {
      errorResponse(res, "Preset not found", 404);
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
          errorResponse(res, "Referenced bot preset not found", 404);
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
        positivePersonaId = await ensurePersonaInHistory("positive" as PersonaHistoryType, payload.positivePersona);
      } else {
        positivePersonaId = null;
      }
    }

    let negativePersonaId: string | null = existingPreset.negative_persona_id;
    if (typeof payload.negativePersona === "string") {
      if (payload.negativePersona.trim()) {
        negativePersonaId = await ensurePersonaInHistory("negative" as PersonaHistoryType, payload.negativePersona);
      } else {
        negativePersonaId = null;
      }
    }

    // Validate and set defaults for direct values
    const presetName =
      typeof payload.presetName === "string" ? payload.presetName.trim() : existingPreset.preset_name;
    const temperature =
      typeof payload.temperature === "number" && Number.isFinite(payload.temperature)
        ? Math.max(0, Math.min(2, payload.temperature))
        : existingPreset.temperature;
    const weightPositive =
      typeof payload.weightPositive === "number" && Number.isFinite(payload.weightPositive)
        ? Math.max(0, Math.min(100, Math.round(payload.weightPositive)))
        : existingPreset.weight_positive;
    const weightNegative =
      typeof payload.weightNegative === "number" && Number.isFinite(payload.weightNegative)
        ? Math.max(0, Math.min(100, Math.round(payload.weightNegative)))
        : existingPreset.weight_negative;
    const streamContext =
      typeof payload.streamContext === "string" ? payload.streamContext.trim() : existingPreset.stream_context;

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

    jsonResponse(res, {
      status: "updated",
      message: "Settings preset updated successfully",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[History] Failed to update settings preset", {
      error: errorMessage,
      presetId,
    });
    errorResponse(res, `Failed to update settings preset: ${errorMessage}`);
  }
}

