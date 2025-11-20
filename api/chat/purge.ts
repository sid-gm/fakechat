import type { VercelRequest, VercelResponse } from "../../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../../src/api/utils";
import { clearChatHistory, setActiveInjection, setSttSuppressedUntil } from "../../src/storage/kv";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    errorResponse(res, "Method not allowed", 405);
    return;
  }

  try {
    await clearChatHistory();
    await setActiveInjection(null);
    await setSttSuppressedUntil(0);
    jsonResponse(res, { status: "purged" });
  } catch (error) {
    errorResponse(res, `Failed to purge chat: ${error instanceof Error ? error.message : String(error)}`);
  }
}

