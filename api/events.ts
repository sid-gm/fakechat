import type { VercelRequest, VercelResponse } from "../src/types/vercel";
import { getChatHistory } from "../src/storage/kv";
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

  // Get initial chat history and send it
  let lastMessageTimestamp = 0;
  let lastMessageIds = new Set<string>();
  
  try {
    const history = await getChatHistory();
    res.write(`data: ${JSON.stringify({ type: "chat_history", data: history })}\n\n`);
    
    // Track the latest message timestamp and IDs
    if (history.length > 0) {
      lastMessageTimestamp = Math.max(...history.map(m => m.timestamp || 0));
      history.forEach(m => {
        if (m.id) {
          lastMessageIds.add(m.id);
        }
      });
    }
  } catch (error) {
    console.error("[SSE] Failed to get chat history", error);
    res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to load history" })}\n\n`);
  }

  // Poll for new messages every 1.5 seconds
  const pollInterval = setInterval(async () => {
    try {
      const history = await getChatHistory();
      
      // Find new messages (those with timestamp after lastMessageTimestamp or new IDs)
      const newMessages = history.filter((message) => {
        if (!message.id) return false;
        if (lastMessageIds.has(message.id)) return false;
        
        const messageTime = message.timestamp || 0;
        if (messageTime > lastMessageTimestamp) {
          return true;
        }
        
        // Also check by ID in case timestamps are the same
        return !lastMessageIds.has(message.id);
      });

      // Send new messages to client
      for (const message of newMessages) {
        if (message.id) {
          lastMessageIds.add(message.id);
        }
        if (message.timestamp && message.timestamp > lastMessageTimestamp) {
          lastMessageTimestamp = message.timestamp;
        }
        
        res.write(`data: ${JSON.stringify({ type: "chat_message", data: message })}\n\n`);
      }

      // Keep lastMessageIds set from growing too large
      if (lastMessageIds.size > 200) {
        const currentIds = new Set(history.map(m => m.id).filter(Boolean) as string[]);
        lastMessageIds = currentIds;
      }
    } catch (error) {
      console.error("[SSE] Failed to poll for new messages", error);
    }
  }, 1500); // Poll every 1.5 seconds

  // Keep connection alive with heartbeat
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (error) {
      clearInterval(heartbeatInterval);
      clearInterval(pollInterval);
    }
  }, 30000); // Every 30 seconds

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(heartbeatInterval);
    clearInterval(pollInterval);
    res.end();
  });
}


