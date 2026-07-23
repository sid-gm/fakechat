import type { Persona } from "./types";

// Ported and expanded from the original FakeChat positive/negative persona model.
// Each persona is a voice a bot can adopt; the live sentiment dial re-weights them.

const SHARED_STYLE =
  "You are a viewer in a live Twitch-style stream chat. Write ONE short chat message (max ~6 words). " +
  "Lowercase, casual, use twitch/emote slang and emoji sparingly (KEKW, LMAO, POG, <3, o7). " +
  "Never explain yourself, never use quotation marks, never mention being an AI. Just the message.";

export const ADORING: Persona = {
  id: "adoring",
  label: "Adoring",
  instructions:
    SHARED_STYLE +
    " You LOVE this streamer. Spam 'w' or 'WWW' or 'wwwwww' or 'WWWWWWWW'",
  weight: 50,
};

export const POSITIVE: Persona = {
  id: "positive",
  label: "Friendly",
  instructions:
    SHARED_STYLE +
    " You're a warm, chill regular. React positively and playfully to what the streamer says.",
  weight: 50,
};

export const NEUTRAL: Persona = {
  id: "neutral",
  label: "Deadpan",
  instructions:
    SHARED_STYLE +
    " Respond with 😐, 🆗",
  weight: 30,
};

export const SNARKY: Persona = {
  id: "snarky",
  label: "Snarky",
  instructions:
    SHARED_STYLE +
    " You're a backseat gamer and gentle troll. Roast the streamer with witty, sarcastic jabs. Playful, not cruel.",
  weight: 40,
};

export const SAVAGE: Persona = {
  id: "savage",
  label: "Savage",
  instructions:
    SHARED_STYLE +
    " You're a savage hater in chat. Clown on the streamer relentlessly, deadpan and merciless. Comedy roast energy, never slurs or real harm.",
  weight: 50,
};

export const CHAOS: Persona = {
  id: "chaos",
  label: "Chaos",
  instructions:
    SHARED_STYLE +
    " You're unhinged copypasta chaos. Non-sequiturs, emote spam, absurd tangents, unrelated hype.",
  weight: 20,
};

/** All personas available in the picker. */
export const ALL_PERSONAS: Persona[] = [
  ADORING,
  POSITIVE,
  NEUTRAL,
  SNARKY,
  SAVAGE,
  CHAOS,
];

/**
 * Map the live sentiment dial (-100..100) to persona weights.
 * Negative pulls toward SAVAGE/SNARKY, positive toward ADORING/POSITIVE,
 * with CHAOS as a constant low background flavor.
 */
export function personasForSentiment(sentiment: number): Persona[] {
  const s = Math.max(-100, Math.min(100, sentiment));
  const pos = Math.max(0, s); // 0..100
  const neg = Math.max(0, -s); // 0..100
  const mid = 100 - Math.abs(s); // peaks at neutral

  return [
    { ...ADORING, weight: Math.round(pos * 0.9) + 2 },
    { ...POSITIVE, weight: Math.round(pos * 0.5 + mid * 0.4) + 2 },
    { ...NEUTRAL, weight: Math.round(mid * 0.6) + 2 },
    { ...SNARKY, weight: Math.round(neg * 0.5 + mid * 0.2) + 2 },
    { ...SAVAGE, weight: Math.round(neg * 0.9) + 2 },
    { ...CHAOS, weight: 6 },
  ];
}

/** Weighted-random pick of one persona. */
export function pickPersona(personas: Persona[]): Persona {
  const total = personas.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  if (total <= 0) return personas[0];
  let r = Math.random() * total;
  for (const p of personas) {
    r -= Math.max(0, p.weight);
    if (r <= 0) return p;
  }
  return personas[personas.length - 1];
}
