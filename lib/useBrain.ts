"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BotSettings, ChatMessage, ControlState, Persona } from "./types";
import { openChannel, type RealtimeChannel } from "./realtime";
import { personasForSentiment, pickPersona } from "./personas";
import { createAmbientPicker, REACTION_EMOTES } from "./genericBank";
import {
  generateBotNames,
  makeMessage,
  splitIntoChatLines,
  uid,
} from "./chatUtils";

const MAX_MESSAGES = 120;
const MAX_CONCURRENT = 2;
const AMBIENT_PAUSE_MS = 2200; // yield ambient briefly around LLM/crowd-speak reactions

export interface BrainOptions {
  room: string;
  settings: BotSettings;
  control: ControlState;
}

export interface Brain {
  ready: boolean;
  backend: "supabase" | "broadcastchannel" | null;
  messages: ChatMessage[];
  aiError: string | null;
  /** Feed streamer speech (from STT or the manual box) into the room. */
  postStreamerText(text: string): void;
  /** Fire an immediate reaction burst with an optional persona + operator directive. */
  fire(opts?: { persona?: Persona; injection?: string; count?: number }): void;
  /** Crowd-speak: everyone spams a reaction emote at once (no LLM). */
  emoteSpam(count?: number): void;
  /** Inject a chat message directly as a given role. */
  injectRaw(username: string, content: string): void;
  purge(): void;
}

export function useBrain({ room, settings, control }: BrainOptions): Brain {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [backend, setBackend] = useState<Brain["backend"]>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const chanRef = useRef<RealtimeChannel | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const settingsRef = useRef(settings);
  const controlRef = useRef(control);
  const inFlightRef = useRef(0);
  const ambientPauseUntilRef = useRef(0);
  settingsRef.current = settings;
  controlRef.current = control;

  // ---- username pool, sized to the "chat size" setting (numBots) ----
  const namePoolRef = useRef<{ size: number; names: string[] }>({ size: -1, names: [] });
  if (namePoolRef.current.size !== settings.numBots) {
    const provided = settings.botNames.filter(Boolean);
    const need = Math.max(1, settings.numBots);
    namePoolRef.current = {
      size: settings.numBots,
      names: [
        ...provided,
        ...generateBotNames(Math.max(0, need - provided.length), 1),
      ].slice(0, need),
    };
  }
  const randomChatter = useCallback((avoid?: string): string => {
    const pool = namePoolRef.current.names;
    if (pool.length === 0) return "viewer";
    let name = pool[Math.floor(Math.random() * pool.length)];
    if (avoid && pool.length > 1) {
      for (let t = 0; t < 4 && name === avoid; t++) {
        name = pool[Math.floor(Math.random() * pool.length)];
      }
    }
    return name ?? "viewer";
  }, []);

  const pushLocal = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
    messagesRef.current = [...messagesRef.current, msg].slice(-MAX_MESSAGES);
  }, []);

  const broadcast = useCallback(
    (msg: ChatMessage) => {
      pushLocal(msg);
      chanRef.current?.send({ type: "chat_message", data: msg });
    },
    [pushLocal],
  );

  // ---- open realtime channel ----
  useEffect(() => {
    let alive = true;
    let chan: RealtimeChannel | null = null;
    openChannel(room).then((c) => {
      if (!alive) {
        c.close();
        return;
      }
      chan = c;
      chanRef.current = c;
      setBackend(c.backend);
      setReady(true);
    });
    return () => {
      alive = false;
      chan?.close();
      chanRef.current = null;
    };
  }, [room]);

  // ---- LLM generation for one bot line ----
  const generateLine = useCallback(
    async (persona: Persona, injection?: string): Promise<string | null> => {
      const s = settingsRef.current;
      const botUsername = randomChatter();
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            botUsername,
            persona: persona.instructions,
            streamContext: s.streamContext,
            model: s.model,
            temperature: s.temperature,
            injection: injection ?? controlRef.current.activeInjection ?? null,
            context: messagesRef.current.slice(-12).map((m) => ({
              username: m.username,
              role: m.role,
              content: m.content,
            })),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setAiError(body.error ?? `Generation error (${res.status})`);
          return null;
        }
        setAiError(null);
        const data = (await res.json()) as { content?: string };
        const content = data.content?.trim();
        if (!content) return null;
        const lines = splitIntoChatLines(content);
        lines.forEach((line, i) => {
          setTimeout(() => broadcast(makeMessage(botUsername, line, "bot")), i * 550);
        });
        return content;
      } catch (err) {
        console.error("[brain] generate failed", err);
        setAiError("Network error contacting the AI endpoint.");
        return null;
      }
    },
    [broadcast, randomChatter],
  );

  // ---- fire a reaction burst (LLM) ----
  const fire = useCallback(
    (opts?: { persona?: Persona; injection?: string; count?: number }) => {
      const c = controlRef.current;
      const personas = personasForSentiment(c.sentiment);
      const count = opts?.count ?? 1;
      ambientPauseUntilRef.current = Date.now() + AMBIENT_PAUSE_MS;
      for (let i = 0; i < count; i++) {
        if (inFlightRef.current >= MAX_CONCURRENT) break;
        inFlightRef.current++;
        const persona = opts?.persona ?? pickPersona(personas);
        setTimeout(() => {
          void generateLine(persona, opts?.injection).finally(() => {
            inFlightRef.current = Math.max(0, inFlightRef.current - 1);
          });
        }, i * 400);
      }
    },
    [generateLine],
  );

  // ---- streamer speech -> room + optional reactions ----
  const postStreamerText = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const s = settingsRef.current;
      const c = controlRef.current;
      broadcast(makeMessage("You", clean, "streamer"));
      if (!c.live) return;
      const replyChance = 0.2 + (c.intensity / 100) * 0.7;
      let reactions = 0;
      for (let i = 0; i < s.numBots && reactions < MAX_CONCURRENT; i++) {
        if (Math.random() < replyChance) reactions++;
      }
      if (reactions === 0) reactions = Math.random() < 0.6 ? 1 : 0;
      if (reactions > 0) fire({ count: reactions });
    },
    [broadcast, fire],
  );

  // ---- crowd-speak: synchronized reaction-emote spam ----
  const emoteSpam = useCallback(
    (count = 8) => {
      ambientPauseUntilRef.current = Date.now() + AMBIENT_PAUSE_MS;
      // Crowd-speak repeats on purpose: pick one or two emotes and let many spam them.
      const primary = REACTION_EMOTES[Math.floor(Math.random() * REACTION_EMOTES.length)];
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const emote = Math.random() < 0.75
            ? primary
            : REACTION_EMOTES[Math.floor(Math.random() * REACTION_EMOTES.length)];
          const reps = Math.random() < 0.35 ? `${emote} ${emote}` : emote;
          broadcast(makeMessage(randomChatter(), reps, "viewer"));
        }, i * 140 + Math.random() * 80);
      }
    },
    [broadcast, randomChatter],
  );

  const injectRaw = useCallback(
    (username: string, content: string) => {
      broadcast(makeMessage(username, content, "viewer"));
    },
    [broadcast],
  );

  const purge = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    chanRef.current?.send({ type: "chat_purge" });
  }, []);

  // ---- ambient chatter: procedural, desynchronized, no LLM ----
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const picker = createAmbientPicker({ recent: 12, alpha: 0.33 });
    let lastUser = "";

    const emitChunk = () => {
      const c = controlRef.current;
      const now = Date.now();
      if (c.live && now >= ambientPauseUntilRef.current) {
        const intensity = c.intensity;
        // chunk size = rand(0 .. maxChunk); maxChunk scales with intensity (up to 15)
        const maxChunk = 1 + Math.round((intensity / 100) * 14);
        const size = Math.floor(Math.random() * (maxChunk + 1));
        let delay = 0;
        for (let k = 0; k < size; k++) {
          // stagger each message so they arrive like independent typists, not a dump
          delay += 60 + Math.random() * 220;
          setTimeout(() => {
            if (cancelled) return;
            const cc = controlRef.current;
            if (!cc.live || Date.now() < ambientPauseUntilRef.current) return;
            const user = randomChatter(lastUser);
            lastUser = user;
            broadcast(makeMessage(user, picker(), "viewer"));
          }, delay);
        }
      }
      // schedule next chunk: shorter gaps at higher intensity, with randomness
      const intensity = controlRef.current.intensity;
      const gapBase = 5000 - (intensity / 100) * 4300; // 5000ms .. 700ms
      const gap = gapBase * (0.6 + Math.random()); // 0.6x .. 1.6x
      timer = setTimeout(emitChunk, Math.max(400, gap));
    };

    timer = setTimeout(emitChunk, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [broadcast, randomChatter]);

  return {
    ready,
    backend,
    messages,
    aiError,
    postStreamerText,
    fire,
    emoteSpam,
    injectRaw,
    purge,
  };
}

// re-export for the control panel action buttons
export { uid };
