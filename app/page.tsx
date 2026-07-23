"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_BOT_SETTINGS,
  DEFAULT_CONTROL_STATE,
  type BotSettings,
  type ControlState,
  type ModelId,
} from "@/lib/types";
import { ADORING, SAVAGE, NEUTRAL, CHAOS } from "@/lib/personas";
import { useBrain } from "@/lib/useBrain";
import { useSpeech } from "@/lib/useSpeech";
import { VideoStage, type ChatCorner, type VideoSource } from "@/components/VideoStage";
import { ActionButton, Card, Field, Toggle } from "@/components/ui";

function sentimentLabel(s: number): { label: string; color: string } {
  if (s <= -60) return { label: "Savage", color: "#ff4d4d" };
  if (s <= -20) return { label: "Snarky", color: "#ff9f1c" };
  if (s < 20) return { label: "Neutral", color: "#adb5bd" };
  if (s < 60) return { label: "Friendly", color: "#8ce99a" };
  return { label: "Adoring", color: "#38d9a9" };
}

export default function ControlPanel() {
  const [room] = useState("live");
  const [settings, setSettings] = useState<BotSettings>(DEFAULT_BOT_SETTINGS);
  const [control, setControl] = useState<ControlState>(DEFAULT_CONTROL_STATE);
  const [injectionText, setInjectionText] = useState("");
  const [sayText, setSayText] = useState("");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [videoSource, setVideoSource] = useState<VideoSource>("off");
  const [chatCorner, setChatCorner] = useState<ChatCorner>("tr");

  useEffect(() => setOrigin(window.location.origin), []);

  const brain = useBrain({ room, settings, control });
  const speech = useSpeech((text) => brain.postStreamerText(text));

  const sent = sentimentLabel(control.sentiment);
  const overlayUrl = origin ? `${origin}/overlay?room=${room}` : "";
  const stageUrl = origin ? `${origin}/stage?room=${room}` : "";

  const setControlPartial = (p: Partial<ControlState>) =>
    setControl((c) => ({ ...c, ...p }));
  const setSettingsPartial = (p: Partial<BotSettings>) =>
    setSettings((s) => ({ ...s, ...p }));

  // LIVE = ambient chat runs. Mic (LLM listening) is a separate, opt-in trigger.
  const toggleLive = (v: boolean) => {
    setControlPartial({ live: v });
    if (!v && speech.listening) speech.stop();
  };
  const toggleMic = () => {
    if (speech.listening) speech.stop();
    else if (speech.supported) speech.start();
  };

  const sendInjection = () => {
    const t = injectionText.trim();
    if (!t) return;
    setControlPartial({ activeInjection: t });
    brain.fire({ injection: t, count: 2 });
  };

  const say = () => {
    const t = sayText.trim();
    if (!t) return;
    brain.postStreamerText(t);
    setSayText("");
  };

  const copyOverlay = async () => {
    if (!overlayUrl) return;
    await navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const backendLabel = useMemo(() => {
    if (!brain.ready) return "connecting…";
    return brain.backend === "supabase"
      ? "Supabase (cross-device)"
      : "BroadcastChannel (this browser)";
  }, [brain.ready, brain.backend]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            FakeChat <span className="text-white/30">control</span>
          </h1>
          <p className="text-xs text-white/40">
            realtime: {backendLabel}
            {" · "}
            mic:{" "}
            {speech.supported
              ? speech.listening
                ? "listening"
                : "ready"
              : "unsupported (use Chrome)"}
          </p>
        </div>
        <Toggle
          on={control.live}
          onChange={toggleLive}
          label={control.live ? "LIVE" : "Paused"}
        />
      </header>

      {brain.aiError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {brain.aiError}
        </div>
      )}

      {/* Composited stage (video + chat overlay) */}
      <VideoStage
        messages={brain.messages}
        source={videoSource}
        onSourceChange={setVideoSource}
        corner={chatCorner}
        onCornerChange={setChatCorner}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT column */}
        <div className="flex flex-col gap-4">
          {/* Sentiment dial */}
          <Card
            title="Chat sentiment"
            right={
              <span className="text-sm font-bold" style={{ color: sent.color }}>
                {sent.label}
              </span>
            }
          >
            <input
              type="range"
              min={-100}
              max={100}
              value={control.sentiment}
              onChange={(e) => setControlPartial({ sentiment: Number(e.target.value) })}
              className="w-full"
              style={{
                background:
                  "linear-gradient(90deg,#ff4d4d,#ff9f1c,#adb5bd,#8ce99a,#38d9a9)",
              }}
            />
            <div className="mt-1 flex justify-between text-[10px] font-medium uppercase tracking-wide text-white/30">
              <span>Savage</span>
              <span>Neutral</span>
              <span>Adoring</span>
            </div>
          </Card>

          {/* Intensity */}
          <Card
            title="Intensity"
            right={<span className="text-sm text-white/60">{control.intensity}</span>}
          >
            <input
              type="range"
              min={0}
              max={100}
              value={control.intensity}
              onChange={(e) => setControlPartial({ intensity: Number(e.target.value) })}
              className="w-full bg-white/15"
            />
            <p className="mt-1 text-[11px] text-white/30">
              How chatty &amp; reactive the room is.
            </p>
          </Card>

          {/* Quick-fire actions */}
          <Card title="Quick fire">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ActionButton
                tone="good"
                onClick={() =>
                  brain.fire({ persona: ADORING, injection: "hype the streamer up hard", count: 2 })
                }
              >
                🔥 Hype
              </ActionButton>
              <ActionButton
                tone="bad"
                onClick={() =>
                  brain.fire({ persona: SAVAGE, injection: "pile on and roast the streamer", count: 2 })
                }
              >
                💀 Roast
              </ActionButton>
              <ActionButton
                tone="neutral"
                onClick={() =>
                  brain.fire({ persona: NEUTRAL, injection: "act confused about what just happened", count: 2 })
                }
              >
                ❓ Confused
              </ActionButton>
              <ActionButton
                tone="wild"
                onClick={() =>
                  brain.fire({ persona: CHAOS, injection: "react to something absurd", count: 2 })
                }
              >
                🤪 Absurd
              </ActionButton>
              <ActionButton tone="neutral" onClick={() => brain.emoteSpam(8)}>
                ⚡ Emotes
              </ActionButton>
            </div>
          </Card>

          {/* Operator override / injection */}
          <Card
            title="Operator override"
            right={
              control.activeInjection ? (
                <button
                  onClick={() => setControlPartial({ activeInjection: null })}
                  className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200"
                >
                  ACTIVE — clear
                </button>
              ) : null
            }
          >
            <div className="flex gap-2">
              <input
                value={injectionText}
                onChange={(e) => setInjectionText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendInjection()}
                placeholder="e.g. pretend I just fell out of my chair"
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/30"
              />
              <ActionButton tone="wild" onClick={sendInjection}>
                Send
              </ActionButton>
            </div>
            <p className="mt-1 text-[11px] text-white/30">
              Forces bots to follow your directive on their next lines.
            </p>
          </Card>
        </div>

        {/* RIGHT column */}
        <div className="flex flex-col gap-4">
          {/* Manual say + mic trigger (the LLM "listen" mode) */}
          <Card
            title="Say something (feeds chat as you)"
            right={
              <button
                onClick={toggleMic}
                disabled={!speech.supported}
                className={`rounded px-2 py-0.5 text-[11px] font-bold disabled:opacity-40 ${
                  speech.listening
                    ? "bg-rose-500/25 text-rose-200"
                    : "bg-white/10 text-white/60 hover:text-white"
                }`}
              >
                {speech.listening ? "🔴 mic on" : "🎙 mic"}
              </button>
            }
          >
            <div className="flex gap-2">
              <input
                value={sayText}
                onChange={(e) => setSayText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && say()}
                placeholder="type what you'd say out loud…"
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/30"
              />
              <ActionButton onClick={say}>Send</ActionButton>
            </div>
            {speech.listening && speech.interim && (
              <p className="mt-2 text-sm italic text-white/40">🎙 {speech.interim}</p>
            )}
            {speech.error && (
              <p className="mt-2 text-xs text-amber-300/80">{speech.error}</p>
            )}
          </Card>

          {/* Settings */}
          <Card title="Settings">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Model">
                <div className="flex gap-2">
                  {(
                    [
                      ["claude-haiku-4-5", "Haiku 4.5 · fast"],
                      ["claude-sonnet-5", "Sonnet 5 · rich"],
                    ] as [ModelId, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setSettingsPartial({ model: id })}
                      className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${
                        settings.model === id
                          ? "border-white/40 bg-white/10 text-white"
                          : "border-white/10 bg-black/20 text-white/50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={`Chat size: ${settings.numBots} chatters`}>
                <input
                  type="range"
                  min={3}
                  max={80}
                  value={settings.numBots}
                  onChange={(e) => setSettingsPartial({ numBots: Number(e.target.value) })}
                  className="w-full bg-white/15"
                />
              </Field>
              <Field label={`Creativity (temp ${settings.temperature.toFixed(1)})`}>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={Math.round(settings.temperature * 10)}
                  onChange={(e) =>
                    setSettingsPartial({ temperature: Number(e.target.value) / 10 })
                  }
                  className="w-full bg-white/15"
                />
              </Field>
              <Field label="Stream context">
                <input
                  value={settings.streamContext}
                  onChange={(e) => setSettingsPartial({ streamContext: e.target.value })}
                  placeholder="e.g. playing Elden Ring, first time"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/30"
                />
              </Field>
            </div>
          </Card>

          {/* Output / OBS */}
          <Card title="Output">
            <div className="flex gap-2">
              <input
                readOnly
                value={overlayUrl}
                className="flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/60"
              />
              <ActionButton onClick={copyOverlay}>{copied ? "✓" : "Copy"}</ActionButton>
            </div>
            <div className="mt-2 flex gap-3 text-xs">
              <a
                href={stageUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="text-white/50 underline hover:text-white/90"
              >
                ↗ pop-out stage (video + chat)
              </a>
              <a
                href={overlayUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="text-white/40 underline hover:text-white/70"
              >
                ↗ transparent chat overlay
              </a>
            </div>
            {brain.backend === "broadcastchannel" && (
              <p className="mt-2 text-[11px] text-amber-300/70">
                Pop-out surfaces sync across tabs in this browser. For OBS / other devices, add Supabase env vars.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
