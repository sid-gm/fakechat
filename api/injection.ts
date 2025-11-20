import type { VercelRequest, VercelResponse } from "../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../src/api/utils";
import { appendChatMessage, getActiveInjection, setActiveInjection, setSttSuppressedUntil } from "../src/storage/kv";
import { processMessageForAI } from "../src/api/aiProcessor";
import { ChatMessage } from "../src/chat/types";
import crypto from "crypto";

const INJECTION_USERNAME = "Injection";
const INJECTION_SUPPRESSION_MS = 6000;

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

async function injectInstructionMessage({
  content,
}: {
  content: string;
}): Promise<ChatMessage> {
  const message = createMessageFromPayload({
    username: INJECTION_USERNAME,
    content,
    role: "streamer",
  });
  const expiresAt = Date.now() + INJECTION_SUPPRESSION_MS;
  await setSttSuppressedUntil(expiresAt);
  await setActiveInjection({
    content,
    expiresAt,
  });
  await appendChatMessage(message);
  return message;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    errorResponse(res, "Method not allowed", 405);
    return;
  }

  const body = req.body as { content?: string } | undefined;
  const rawContent = typeof body?.content === "string" ? body.content : "";
  const content = rawContent.trim();

  if (!content) {
    errorResponse(res, "content is required", 400);
    return;
  }

  try {
    const message = await injectInstructionMessage({ content });
    
    // Trigger AI processing asynchronously (fire and forget)
    processMessageForAI(message).catch((error) => {
      console.error("[AI] Failed to process message for AI", error);
    });

    jsonResponse(res, { status: "accepted", message }, 202);
  } catch (error) {
    errorResponse(res, `Failed to inject message: ${error instanceof Error ? error.message : String(error)}`);
  }
}

