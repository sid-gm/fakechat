import type { VercelRequest, VercelResponse } from "../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../src/api/utils";
import { getPublicBotSettings, applyBotSettings, type PromptBody } from "../src/api/botSettings";

const MAX_BOT_COUNT = 25;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method === "GET") {
    try {
      const settings = await getPublicBotSettings();
      jsonResponse(res, {
        status: "ok",
        settings,
      });
    } catch (error) {
      errorResponse(res, `Failed to get settings: ${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }

  if (req.method === "POST") {
    if (!req.body || typeof req.body !== "object") {
      errorResponse(res, "Invalid payload", 400);
      return;
    }

    const payload = req.body as Record<string, unknown>;
    const updates: Partial<{
      numBots: number;
      temperature: number;
      promptBodies: PromptBody[];
      streamContext: string;
      botNames: string[];
    }> = {};

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
      errorResponse(res, "No settings provided", 400);
      return;
    }

    try {
      const changed = await applyBotSettings(updates);
      const settings = await getPublicBotSettings();
      jsonResponse(res, {
        status: changed ? "updated" : "unchanged",
        settings,
      }, changed ? 202 : 200);
    } catch (error) {
      errorResponse(res, `Failed to update settings: ${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }

  errorResponse(res, "Method not allowed", 405);
}

