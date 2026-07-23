"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/types";
import { colorForName } from "@/lib/chatUtils";

const ROLE_BADGE: Record<string, { label: string; className: string } | null> = {
  streamer: { label: "HOST", className: "bg-rose-500 text-white" },
  moderator: { label: "MOD", className: "bg-emerald-500 text-white" },
  bot: null,
  viewer: null,
};

export function ChatList({
  messages,
  variant = "panel",
}: {
  messages: ChatMessage[];
  variant?: "panel" | "overlay";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // Keep the chat pinned to its newest message by scrolling ONLY this container
  // (never scrollIntoView, which would scroll the whole page/window).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const isOverlay = variant === "overlay";

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={
        isOverlay
          ? "flex flex-col justify-end gap-1.5 h-full overflow-hidden px-3 py-2"
          : "flex flex-col gap-1 h-full overflow-y-auto px-3 py-2"
      }
    >
      {messages.map((m) => {
        const badge = ROLE_BADGE[m.role];
        const nameColor =
          m.role === "streamer" ? "#ff6b8b" : colorForName(m.username);
        return (
          <div
            key={m.id}
            className={
              isOverlay
                ? "fc-msg text-[15px] leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                : "fc-msg text-[13px] leading-snug"
            }
          >
            {badge && (
              <span
                className={`inline-block mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold align-middle ${badge.className}`}
              >
                {badge.label}
              </span>
            )}
            <span className="font-bold" style={{ color: nameColor }}>
              {m.username}
            </span>
            <span className={isOverlay ? "text-white/60" : "text-white/40"}>: </span>
            <span className={isOverlay ? "text-white" : "text-white/90"}>
              {m.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}
