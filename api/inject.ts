import type { VercelRequest, VercelResponse } from "../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../src/api/utils";
import { appendChatMessage, getActiveInjection, setActiveInjection, setSttSuppressedUntil } from "../src/storage/kv";
import { processMessageForAI } from "../src/api/aiProcessor";
import { ChatMessage, ChatRole } from "../src/chat/types";
import crypto from "crypto";

const ROLES: ChatRole[] = ["viewer", "bot", "moderator", "streamer"];
const INJECTION_USERNAME = "Injection";
const INJECTION_SUPPRESSION_MS = 6000;

function createMessageFromPayload(payload: {
  username: string;
  content: string;
  role?: ChatRole;
}): ChatMessage {
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

async function injectInstructionMessage({
  content,
  username = INJECTION_USERNAME,
  role = "streamer",
}: {
  content: string;
  username?: string;
  role?: ChatRole;
}): Promise<ChatMessage> {
  const message = createMessageFromPayload({
    username,
    content,
    role,
  });
  const normalizedName = username.trim().toLowerCase();
  if (normalizedName === INJECTION_USERNAME.toLowerCase()) {
    const expiresAt = Date.now() + INJECTION_SUPPRESSION_MS;
    await setSttSuppressedUntil(expiresAt);
    await setActiveInjection({
      content,
      expiresAt,
    });
  }
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

  const { username, content, role } = req.body as {
    username?: string;
    content?: string;
    role?: ChatRole;
  };

  const trimmedContent = typeof content === "string" ? content.trim() : "";
  if (!trimmedContent) {
    errorResponse(res, "content is required", 400);
    return;
  }

  const trimmedUsername =
    typeof username === "string" && username.trim().length > 0 ? username.trim() : INJECTION_USERNAME;

  try {
    const message = await injectInstructionMessage({
      username: trimmedUsername,
      content: trimmedContent,
      role,
    });

    // Trigger AI processing asynchronously (fire and forget)
    processMessageForAI(message).catch((error) => {
      console.error("[AI] Failed to process message for AI", error);
    });

    jsonResponse(res, { status: "accepted", message }, 202);
  } catch (error) {
    errorResponse(res, `Failed to inject message: ${error instanceof Error ? error.message : String(error)}`);
  }
}

