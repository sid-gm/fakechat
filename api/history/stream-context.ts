import type { VercelRequest, VercelResponse } from "../../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../../src/api/utils";
import { fetchStreamContextHistory } from "../../src/storage/history";

function parseHistoryLimit(value: unknown, fallback = 10) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    errorResponse(res, "Method not allowed", 405);
    return;
  }

  try {
    const query = req.query ?? {};
    const limit = parseHistoryLimit(query.limit);

    const entries = await fetchStreamContextHistory(limit);
    jsonResponse(res, {
      status: "ok",
      entries,
    });
  } catch (error) {
    console.error(`[History] Failed to load stream context history`, error);
    errorResponse(res, `Failed to load stream context history: ${error instanceof Error ? error.message : String(error)}`);
  }
}

