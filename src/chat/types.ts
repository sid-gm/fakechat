export type ChatRole = "viewer" | "bot" | "moderator" | "streamer";

export interface ChatMessage {
  id: string;
  timestamp: number;
  username: string;
  role: ChatRole;
  content: string;
}

