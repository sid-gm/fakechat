// @vercel/kv is available at runtime in Vercel
// We need to import it dynamically or use require
import dotenv from "dotenv";

// Load environment variables for local development
dotenv.config();

type KVClient = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<void>;
  del(key: string): Promise<void>;
};

let kvClient: KVClient | null = null;
let kvInitialized = false;

// Lazy initialization of KV client
function getKvClient(): KVClient {
  if (kvClient) {
    return kvClient;
  }

  // Check if required environment variables are available
  const hasKvEnvVars = 
    typeof process.env.KV_REST_API_URL === "string" && 
    process.env.KV_REST_API_URL.length > 0 &&
    typeof process.env.KV_REST_API_TOKEN === "string" && 
    process.env.KV_REST_API_TOKEN.length > 0;

  if (hasKvEnvVars) {
    try {
      // Try to import @vercel/kv - it will be available in Vercel runtime
      const client = require("@vercel/kv").kv;
      kvClient = client;
      kvInitialized = true;
      return client;
    } catch (error) {
      console.error("[KV] Failed to initialize @vercel/kv:", error);
      // Fallback for local development
      const fallback: KVClient = {
        get: async () => null,
        set: async () => {},
        del: async () => {},
      };
      kvClient = fallback;
      return fallback;
    }
  } else {
    // Environment variables not available - use fallback
    if (!kvInitialized) {
      console.warn("[KV] Missing KV_REST_API_URL or KV_REST_API_TOKEN environment variables. Using fallback (no-op) implementation.");
      console.warn("[KV] KV_REST_API_URL:", process.env.KV_REST_API_URL ? "SET" : "MISSING");
      console.warn("[KV] KV_REST_API_TOKEN:", process.env.KV_REST_API_TOKEN ? "SET" : "MISSING");
      kvInitialized = true;
    }
    const fallback: KVClient = {
      get: async () => null,
      set: async () => {},
      del: async () => {},
    };
    kvClient = fallback;
    return fallback;
  }
}
import { ChatMessage } from "../chat/types";

const CHAT_HISTORY_KEY = "chat:history";
const BOT_SETTINGS_KEY = "bot:settings";
const ACTIVE_INJECTION_KEY = "chat:injection";
const STT_SUPPRESSED_KEY = "chat:stt_suppressed";
const CHAT_HISTORY_TTL = 86400; // 24 hours in seconds

export interface BotSettings {
  numBots: number;
  temperature: number;
  botNames: string[];
  promptBodies: Array<{
    id: string;
    label: string;
    instructions: string;
    weight: number;
  }>;
  streamContext: string;
}

export async function getChatHistory(): Promise<ChatMessage[]> {
  try {
    const kv = getKvClient();
    const history = await kv.get<ChatMessage[]>(CHAT_HISTORY_KEY);
    return history || [];
  } catch (error) {
    console.error("[KV] Failed to get chat history", error);
    return [];
  }
}

export async function appendChatMessage(message: ChatMessage): Promise<void> {
  try {
    const kv = getKvClient();
    const history = await getChatHistory();
    history.push(message);
    
    // Keep only last 100 messages
    const trimmed = history.slice(-100);
    
    await kv.set(CHAT_HISTORY_KEY, trimmed, { ex: CHAT_HISTORY_TTL });
  } catch (error) {
    console.error("[KV] Failed to append chat message", error);
    throw error;
  }
}

export async function clearChatHistory(): Promise<void> {
  try {
    const kv = getKvClient();
    await kv.del(CHAT_HISTORY_KEY);
  } catch (error) {
    console.error("[KV] Failed to clear chat history", error);
    throw error;
  }
}

export async function getBotSettings(): Promise<BotSettings | null> {
  try {
    const kv = getKvClient();
    const settings = await kv.get<BotSettings>(BOT_SETTINGS_KEY);
    return settings;
  } catch (error) {
    console.error("[KV] Failed to get bot settings", error);
    return null;
  }
}

export async function setBotSettings(settings: BotSettings): Promise<void> {
  try {
    const kv = getKvClient();
    await kv.set(BOT_SETTINGS_KEY, settings);
  } catch (error) {
    console.error("[KV] Failed to set bot settings", error);
    throw error;
  }
}

export interface ActiveInjection {
  content: string;
  expiresAt: number;
}

export async function getActiveInjection(): Promise<ActiveInjection | null> {
  try {
    const kv = getKvClient();
    const injection = await kv.get<ActiveInjection>(ACTIVE_INJECTION_KEY);
    if (!injection) {
      return null;
    }
    
    // Check if expired
    if (Date.now() > injection.expiresAt) {
      await kv.del(ACTIVE_INJECTION_KEY);
      return null;
    }
    
    return injection;
  } catch (error) {
    console.error("[KV] Failed to get active injection", error);
    return null;
  }
}

export async function setActiveInjection(injection: ActiveInjection | null): Promise<void> {
  try {
    const kv = getKvClient();
    if (injection) {
      // Calculate TTL in seconds
      const ttl = Math.max(1, Math.floor((injection.expiresAt - Date.now()) / 1000));
      await kv.set(ACTIVE_INJECTION_KEY, injection, { ex: ttl });
    } else {
      await kv.del(ACTIVE_INJECTION_KEY);
    }
  } catch (error) {
    console.error("[KV] Failed to set active injection", error);
    throw error;
  }
}

export async function getSttSuppressedUntil(): Promise<number> {
  try {
    const kv = getKvClient();
    const timestamp = await kv.get<number>(STT_SUPPRESSED_KEY);
    return timestamp || 0;
  } catch (error) {
    console.error("[KV] Failed to get STT suppressed timestamp", error);
    return 0;
  }
}

export async function setSttSuppressedUntil(timestamp: number): Promise<void> {
  try {
    const kv = getKvClient();
    if (timestamp > 0) {
      const ttl = Math.max(1, Math.floor((timestamp - Date.now()) / 1000));
      await kv.set(STT_SUPPRESSED_KEY, timestamp, { ex: ttl });
    } else {
      await kv.del(STT_SUPPRESSED_KEY);
    }
  } catch (error) {
    console.error("[KV] Failed to set STT suppressed timestamp", error);
    throw error;
  }
}

