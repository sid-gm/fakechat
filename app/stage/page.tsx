"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ChatMessage, RealtimeEvent } from "@/lib/types";
import { openChannel, type RealtimeChannel } from "@/lib/realtime";
import { VideoStage, type ChatCorner, type VideoSource } from "@/components/VideoStage";

const MAX = 60;

function Stage() {
  const params = useSearchParams();
  const room = params.get("room") || "default";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [source, setSource] = useState<VideoSource>("off");
  const [corner, setCorner] = useState<ChatCorner>("tr");
  const chanRef = useRef<RealtimeChannel | null>(null);

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
        if (event.type === "chat_purge") setMessages([]);
        else if (event.type === "chat_message")
          setMessages((prev) => [...prev, event.data].slice(-MAX));
      });
    });
    return () => {
      alive = false;
      chan?.close();
    };
  }, [room]);

  return (
    <main className="fixed inset-0 flex items-center justify-center bg-black p-2">
      <div className="w-full max-w-[min(100vw,177.7vh)]">
        <VideoStage
          messages={messages}
          source={source}
          onSourceChange={setSource}
          corner={corner}
          onCornerChange={setCorner}
        />
      </div>
    </main>
  );
}

export default function StagePage() {
  return (
    <Suspense fallback={null}>
      <Stage />
    </Suspense>
  );
}
