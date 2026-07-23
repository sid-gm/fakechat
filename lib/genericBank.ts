import genericData from "./chatbank/generic.json";

export interface GenericLine {
  t: string;
  n: number;
}

/** Hand-labeled generic (topic-agnostic) chat lines from the TwitchChat dataset. */
export const GENERIC_BANK = genericData as GenericLine[];

/**
 * Reaction emotes = crowd-speak. These are what viewers spam when reacting to a
 * specific moment, so they belong to the LLM/reaction layer, NOT idle ambient.
 * (The user explicitly labeled pog/kekw/omegalul/gg as NOT generic.)
 */
export const REACTION_EMOTES = [
  "POG", "POGGERS", "KEKW", "OMEGALUL", "LULW", "GG", "EZ", "W",
  "PogChamp", "monkaS", "Pepega", "o7", "PepeLaugh", "WutFace",
];

/**
 * Ambient picker: samples one generic line at a time with two anti-crowd-speak
 * guards so idle chat reads as many independent people typing, not a synced burst:
 *   1. Dampened frequency weight (n^alpha) — common lines lean more likely, but the
 *      long tail still breathes, so it isn't just "lul/lol" over and over.
 *   2. Recent-window suppression — never repeats any of the last `recent` lines,
 *      which is what actually prevents "lul lul lul" clustering.
 */
export function createAmbientPicker(opts?: { recent?: number; alpha?: number }) {
  const recentSize = opts?.recent ?? 12;
  const alpha = opts?.alpha ?? 0.33;
  const bank = GENERIC_BANK;
  const weights = bank.map((b) => Math.pow(Math.max(1, b.n), alpha));
  const total = weights.reduce((a, b) => a + b, 0);
  const recent: string[] = [];

  const sampleOnce = (): string => {
    let r = Math.random() * total;
    for (let i = 0; i < bank.length; i++) {
      r -= weights[i];
      if (r <= 0) return bank[i].t;
    }
    return bank[bank.length - 1].t;
  };

  return function next(): string {
    let pick = sampleOnce();
    for (let tries = 0; tries < 8 && recent.includes(pick); tries++) {
      pick = sampleOnce();
    }
    recent.push(pick);
    if (recent.length > recentSize) recent.shift();
    return pick;
  };
}
