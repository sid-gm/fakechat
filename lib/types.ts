// Core domain types for FakeChat.

export type Role = "viewer" | "bot" | "moderator" | "streamer";

export interface ChatMessage {
  id: string;
  timestamp: number;
  username: string;
  role: Role;
  content: string;
}

/** A persona is a system-prompt fragment plus a relative weight for how often it is used. */
export interface Persona {
  id: string;
  label: string;
  instructions: string;
  /** 0-100 relative weight when sampling which persona a bot uses. */
  weight: number;
}

/** Which Claude model the bots speak with (direct Anthropic API). */
export type ModelId = "claude-haiku-4-5" | "claude-sonnet-5";

export interface BotSettings {
  /** Number of simulated chatters that can react. */
  numBots: number;
  /** Model used for replies. Haiku = fast/cheap default, Sonnet = richer "hero" bots. */
  model: ModelId;
  temperature: number;
  botNames: string[];
  personas: Persona[];
  /** Free-text context about what is happening on stream. */
  streamContext: string;
}

/** Live operator controls that steer chat sentiment and pacing in real time. */
export interface ControlState {
  /** -100 (savage) .. 0 (neutral) .. +100 (adoring). Drives persona weighting. */
  sentiment: number;
  /** 0..100 — how chatty/reactive the room is (reply chance + ambient cadence). */
  intensity: number;
  /** Master on/off for AI reactions. */
  live: boolean;
  /** When set, an operator override that bots must follow immediately. */
  activeInjection: string | null;
}

/** Messages sent over the realtime transport between the control panel and overlays. */
export type RealtimeEvent =
  | { type: "chat_message"; data: ChatMessage }
  | { type: "chat_purge" };

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  numBots: 24,
  model: "claude-haiku-4-5",
  temperature: 0.9,
  botNames: [],
  personas: [], // filled from lib/personas at runtime
  streamContext: "",
};

export const DEFAULT_CONTROL_STATE: ControlState = {
  sentiment: 20,
  intensity: 55,
  live: false,
  activeInjection: null,
};
