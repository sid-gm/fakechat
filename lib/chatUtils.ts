import type { ChatMessage, Role } from "./types";

// ---- IDs ----
export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---- Username colors (Twitch-style, deterministic per name) ----
const COLORS = [
  "#ff4d4d", "#ff9f1c", "#ffd21c", "#8ce99a", "#38d9a9",
  "#4dabf7", "#748ffc", "#b197fc", "#f783ac", "#e599f7",
  "#63e6be", "#ffa94d", "#69db7c", "#4dd4ff", "#ff8787",
];

export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

// ---- Fake chatter names ----
const PREFIX = [
  "Pixel", "Glitch", "Neon", "Turbo", "Cosmic", "Shadow", "Vapor", "Frost",
  "Blaze", "Nova", "Cyber", "Retro", "Lunar", "Echo", "Rift", "Zen",
  "Static", "Quantum", "Hyper", "Grim", "Salty", "Based", "Sleepy", "Feral",
];
const SUFFIX = [
  "Pioneer", "Caster", "Wolf", "Byte", "Goblin", "Ghost", "Raider", "Fox",
  "Knight", "Punk", "Sage", "Drift", "Storm", "Blade", "Muffin", "Gremlin",
  "Enjoyer", "Lord", "69", "Xx", "TV", "Main", "Diff", "Andy",
];

export function generateBotNames(count: number, seed = 0): string[] {
  const names = new Set<string>();
  let i = seed;
  while (names.size < count && i < seed + count * 20) {
    const p = PREFIX[(i * 7 + 3) % PREFIX.length];
    const s = SUFFIX[(i * 13 + 5) % SUFFIX.length];
    const tail = i % 3 === 0 ? String((i * 17) % 100) : "";
    names.add(`${p}${s}${tail}`);
    i++;
  }
  return [...names].slice(0, count);
}

// ---- Message factory ----
export function makeMessage(
  username: string,
  content: string,
  role: Role = "viewer",
): ChatMessage {
  return {
    id: uid(),
    timestamp: Date.now(),
    username: username.trim() || "viewer",
    role,
    content: content.trim(),
  };
}

/**
 * Split a bot's raw reply into 1-2 short chat lines so long replies read like
 * real chat bursts instead of a paragraph.
 */
export function splitIntoChatLines(content: string): string[] {
  const cleaned = content.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return [cleaned].filter(Boolean);
  const parts = cleaned.match(/[^.!?]+[.!?]*/g) ?? [cleaned];
  const lines: string[] = [];
  for (const raw of parts) {
    const line = raw.trim();
    if (!line) continue;
    lines.push(line);
    if (lines.length >= 2) break;
  }
  return lines.length ? lines : [cleaned];
}
