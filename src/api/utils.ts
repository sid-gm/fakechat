import type { VercelRequest, VercelResponse } from "../types/vercel";

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function handleCors(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

export function jsonResponse(res: VercelResponse, data: unknown, status = 200) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader(...Object.entries(corsHeaders())[0]);
  res.status(status).json(data);
}

export function errorResponse(res: VercelResponse, message: string, status = 500) {
  jsonResponse(res, { error: message }, status);
}

