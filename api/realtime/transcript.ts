import type { VercelRequest, VercelResponse } from "../../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../../src/api/utils";
import { appendChatMessage, getSttSuppressedUntil } from "../../src/storage/kv";
import { processMessageForAI } from "../../src/api/aiProcessor";
import { ChatMessage } from "../../src/chat/types";
import crypto from "crypto";

const STREAMER_USERNAME = process.env.STREAMER_USERNAME?.trim() || "Streamer";

function createMessageFromPayload(payload: {
  username: string;
  content: string;
  role?: "viewer" | "bot" | "moderator" | "streamer";
}): ChatMessage {
  const role = payload.role || "streamer";
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    errorResponse(res, "Method not allowed", 405);
    return;
  }

  const suppressedUntil = await getSttSuppressedUntil();
  if (Date.now() < suppressedUntil) {
    jsonResponse(res, { status: "suppressed" }, 202);
    return;
  }

  const body = req.body as { content?: string; username?: string } | undefined;
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    errorResponse(res, "content is required", 400);
    return;
  }

  const username =
    typeof body?.username === "string" && body.username.trim().length > 0
      ? body.username.trim()
      : STREAMER_USERNAME;

  try {
    const message = createMessageFromPayload({
      username,
      content,
      role: "streamer",
    });
    await appendChatMessage(message);
    
    // Trigger AI processing asynchronously (fire and forget)
    processMessageForAI(message).catch((error) => {
      console.error("[AI] Failed to process message for AI", error);
    });

    jsonResponse(res, { status: "accepted", message }, 202);
  } catch (error) {
    errorResponse(res, `Failed to process transcript: ${error instanceof Error ? error.message : String(error)}`);
  }
}

