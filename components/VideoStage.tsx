"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { ChatList } from "./ChatList";

export type VideoSource = "off" | "camera" | "screen";
export type ChatCorner = "tr" | "tl" | "br" | "bl";

const CORNER_CLASS: Record<ChatCorner, string> = {
  tr: "top-3 right-3",
  tl: "top-3 left-3",
  br: "bottom-3 right-3",
  bl: "bottom-3 left-3",
};

/**
 * The composited "what you'd record" surface: a live video (webcam or screen)
 * with the fake chat overlaid in a corner, matching a Twitch-style layout.
 */
export function VideoStage({
  messages,
  source,
  onSourceChange,
  corner = "tr",
  onCornerChange,
  chatWidth = 34,
  showToolbar = true,
}: {
  messages: ChatMessage[];
  source: VideoSource;
  onSourceChange: (s: VideoSource) => void;
  corner?: ChatCorner;
  onCornerChange?: (c: ChatCorner) => void;
  chatWidth?: number;
  showToolbar?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function start() {
      stopStream();
      if (source === "off") return;
      try {
        const stream =
          source === "camera"
            ? await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
              })
            : await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
              });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        // If the user ends screen share from the browser UI, reset to off.
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          onSourceChange("off");
        });
      } catch (err) {
        if (!cancelled) {
          setError(
            source === "camera"
              ? "Camera blocked or unavailable. Allow camera access."
              : "Screen share cancelled or unavailable.",
          );
          onSourceChange("off");
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const goFullscreen = () => {
    stageRef.current?.requestFullscreen?.();
  };

  return (
    <div className="flex flex-col gap-2">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {(
              [
                ["off", "Off"],
                ["camera", "📷 Camera"],
                ["screen", "🖥 Screen"],
              ] as [VideoSource, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => onSourceChange(id)}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  source === id
                    ? "bg-white/15 text-white"
                    : "bg-black/20 text-white/50 hover:text-white/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {onCornerChange && (
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              {(
                [
                  ["tl", "◤"],
                  ["tr", "◥"],
                  ["bl", "◣"],
                  ["br", "◢"],
                ] as [ChatCorner, string][]
              ).map(([id, glyph]) => (
                <button
                  key={id}
                  title={`Chat ${id}`}
                  onClick={() => onCornerChange(id)}
                  className={`px-2.5 py-1.5 text-xs ${
                    corner === id
                      ? "bg-white/15 text-white"
                      : "bg-black/20 text-white/40 hover:text-white/80"
                  }`}
                >
                  {glyph}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={goFullscreen}
            className="ml-auto rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white/60 hover:text-white"
          >
            ⤢ Fullscreen
          </button>
        </div>
      )}

      <div
        ref={stageRef}
        className="relative aspect-video w-full overflow-hidden rounded-xl bg-black"
      >
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />

        {source === "off" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-white/30">
            <span className="text-3xl">🎥</span>
            <span className="text-sm">
              Pick <b className="text-white/60">Camera</b> or{" "}
              <b className="text-white/60">Screen</b> to preview with chat overlaid
            </span>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-0 top-0 bg-rose-500/80 px-3 py-1.5 text-center text-xs text-white">
            {error}
          </div>
        )}

        {/* Chat overlay */}
        <div
          className={`absolute ${CORNER_CLASS[corner]} max-h-[62%] overflow-hidden`}
          style={{ width: `${chatWidth}%`, minWidth: 200 }}
        >
          <ChatList messages={messages} variant="overlay" />
        </div>
      </div>
    </div>
  );
}
