"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal Web Speech API typings (not in the standard TS lib).
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechResult {
  supported: boolean;
  listening: boolean;
  interim: string;
  /** Increments each time a final sentence is emitted. */
  error: string | null;
  start(): void;
  stop(): void;
}

/**
 * Streaming speech-to-text via the browser's Web Speech API.
 * Calls `onFinal` with each finalized sentence the moment it lands — no upload,
 * no chunking, ~0.3s latency. Auto-restarts to keep a continuous session alive.
 */
export function useSpeech(onFinal: (text: string) => void): UseSpeechResult {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantOnRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(getCtor() !== null);
  }, []);

  const build = useCallback((): SpeechRecognitionLike | null => {
    const Ctor = getCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) {
          const finalText = text.trim();
          if (finalText) onFinalRef.current(finalText);
        } else {
          interimText += text;
        }
      }
      setInterim(interimText);
    };

    rec.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      setError(ev.error);
    };

    rec.onend = () => {
      // Chrome ends sessions periodically; restart if the operator still wants it on.
      if (wantOnRef.current) {
        try {
          rec.start();
        } catch {
          /* already starting */
        }
      } else {
        setListening(false);
        setInterim("");
      }
    };

    return rec;
  }, []);

  const start = useCallback(() => {
    if (recRef.current) return;
    const rec = build();
    if (!rec) {
      setError("Speech recognition not supported in this browser (use Chrome or Edge).");
      return;
    }
    recRef.current = rec;
    wantOnRef.current = true;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      /* start races are safe to ignore */
    }
  }, [build]);

  const stop = useCallback(() => {
    wantOnRef.current = false;
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    setInterim("");
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, interim, error, start, stop };
}
