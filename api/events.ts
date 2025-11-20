import type { VercelRequest, VercelResponse } from "../src/types/vercel";
import { getChatHistory, appendChatMessage } from "../src/storage/kv";
import { ChatMessage } from "../src/chat/types";

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Cache-Control");

  // Send initial chat history
  try {
    const history = await getChatHistory();
    res.write(`data: ${JSON.stringify({ type: "chat_history", data: history })}\n\n`);
  } catch (error) {
    console.error("[SSE] Failed to get chat history", error);
    res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to load history" })}\n\n`);
  }

  // Keep connection alive with heartbeat
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (error) {
      clearInterval(heartbeatInterval);
    }
  }, 30000); // Every 30 seconds

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(heartbeatInterval);
    res.end();
  });

  // Note: In a serverless environment, we can't maintain persistent connections
  // Clients will need to reconnect periodically or use polling
  // For real-time updates, consider using a message queue or pub/sub service
}

