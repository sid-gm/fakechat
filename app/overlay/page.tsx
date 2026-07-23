"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ChatMessage, RealtimeEvent } from "@/lib/types";
import { openChannel, type RealtimeChannel } from "@/lib/realtime";
import { ChatList } from "@/components/ChatList";

const MAX = 60;

function Overlay() {
  const params = useSearchParams();
  const room = params.get("room") || "default";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chanRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("fc-overlay");
    return () => document.documentElement.classList.remove("fc-overlay");
  }, []);

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
      c.subscribe((event: RealtimeEvent) => {
        if (event.type === "chat_purge") {
          setMessages([]);
        } else if (event.type === "chat_message") {
          setMessages((prev) => [...prev, event.data].slice(-MAX));
        }
      });
    });
    return () => {
      alive = false;
      chan?.close();
    };
  }, [room]);

  return (
    <main className="fixed inset-0 bg-transparent overflow-hidden">
      <ChatList messages={messages} variant="overlay" />
    </main>
  );
}

export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <Overlay />
    </Suspense>
  );
}
