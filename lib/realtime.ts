import type { RealtimeEvent } from "./types";

/**
 * Realtime transport abstraction.
 *
 * Two backends, chosen automatically:
 *  - Supabase Realtime broadcast  -> cross-device / OBS (used when NEXT_PUBLIC_SUPABASE_* env is set)
 *  - BroadcastChannel             -> zero-config, same-browser (dev + in-panel preview fallback)
 *
 * Both expose the same tiny interface so nothing else in the app knows which is live.
 */
export interface RealtimeChannel {
  send(event: RealtimeEvent): void;
  subscribe(handler: (event: RealtimeEvent) => void): () => void;
  readonly backend: "supabase" | "broadcastchannel";
  close(): void;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabase(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON);
}

const EVENT_NAME = "fc";

/** BroadcastChannel backend — works across tabs/windows of the same browser, no backend. */
function createBroadcastChannel(room: string): RealtimeChannel {
  const bc = new BroadcastChannel(`fakechat:${room}`);
  const handlers = new Set<(e: RealtimeEvent) => void>();
  bc.onmessage = (ev) => {
    const data = ev.data as RealtimeEvent;
    handlers.forEach((h) => h(data));
  };
  return {
    backend: "broadcastchannel",
    send: (event) => bc.postMessage(event),
    subscribe: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close: () => bc.close(),
  };
}

/** Supabase Realtime broadcast backend — cross-device, low latency, powers OBS. */
async function createSupabaseChannel(room: string): Promise<RealtimeChannel> {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
    realtime: { params: { eventsPerSecond: 20 } },
  });
  const channel = client.channel(`fakechat:${room}`, {
    config: { broadcast: { self: false } },
  });
  const handlers = new Set<(e: RealtimeEvent) => void>();
  channel.on("broadcast", { event: EVENT_NAME }, (payload) => {
    handlers.forEach((h) => h(payload.payload as RealtimeEvent));
  });
  await channel.subscribe();
  return {
    backend: "supabase",
    send: (event) => {
      void channel.send({ type: "broadcast", event: EVENT_NAME, payload: event });
    },
    subscribe: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close: () => {
      void client.removeChannel(channel);
    },
  };
}

/** Open the best available realtime channel for a room. */
export async function openChannel(room: string): Promise<RealtimeChannel> {
  if (hasSupabase()) {
    try {
      return await createSupabaseChannel(room);
    } catch (err) {
      console.warn("[realtime] Supabase channel failed, falling back to BroadcastChannel", err);
    }
  }
  return createBroadcastChannel(room);
}
