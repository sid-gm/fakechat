# FakeChat

Overlay an AI-driven fake chat on top of your live recordings. The chat reacts to
what you say (via your mic), and you steer it in real time — dial it from **savage**
to **adoring**, fire off hype/roast/absurd bursts, or push an operator override that
the bots must obey on their next lines.

Rebuilt as a Next.js webapp: **browser-native speech-to-text**, **Claude via the
Vercel AI Gateway**, and a **realtime overlay** you can drop into OBS.

## Architecture (client-as-brain)

The control panel is the brain. It runs while you stream, so it owns the timing:

```
Control panel (browser)                Vercel (stateless)        Overlay (OBS / tab)
 ├─ Web Speech API STT  ──────┐
 ├─ sentiment + intensity     │  POST /api/generate
 ├─ ambient chatter loop  ────┼──────────────►  AI Gateway → Claude Haiku 4.5 / Sonnet 5
 └─ broadcasts messages ──────┘                       │
                                                      ▼
                              realtime channel  ◄──── returns one chat line
                              (Supabase / BroadcastChannel)  ─────────────►  renders chat
```

- **Video stage**: the panel composites your **camera or screen share** with the chat
  overlaid in a corner (like a real Twitch layout) — no OBS needed to *see* the result.
  Fullscreen it or open the chromeless `/stage` route to screen-record a clean 16:9 output.
- **STT**: Web Speech API — interim transcripts as you talk, no upload (~0.3s). Chrome/Edge.
- **LLM**: routed through the Vercel AI Gateway as `anthropic/claude-haiku-4.5`
  (fast, default) or `anthropic/claude-sonnet-5` (richer). Swap the model live in the UI.
- **Realtime**: Supabase Realtime *broadcast* when configured (cross-device, OBS), else
  BroadcastChannel (same-browser, zero-config — good for dev and the in-panel preview).

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in AI_GATEWAY_API_KEY (see below)
npm run dev
```

Open `http://localhost:3000` for the control panel. Flip **LIVE**, allow the mic,
and talk — or use the **Say something** box / **Quick fire** buttons to test without
a mic. The **⚡ Emotes** button and manual sends work with **no API key**.

### Enable AI replies

Bots need the Vercel AI Gateway. Create a key at
`https://vercel.com/[team]/~/ai-gateway/api-keys` and set it in `.env.local`:

```env
AI_GATEWAY_API_KEY=your_key_here
```

(On a Vercel deployment this is provided automatically via OIDC — no key needed.)

### Enable the OBS overlay (cross-device)

BroadcastChannel only reaches tabs in the *same* browser, so OBS (a separate
Chromium) needs a shared channel. Create a free Supabase project and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

No database tables are required — we use Realtime *broadcast*. Then in OBS add a
**Browser Source** pointing at the overlay URL shown in the panel
(`/overlay?room=live`). The overlay background is transparent.

## Deploy

```bash
npm i -g vercel && vercel        # preview
vercel --prod                    # production
```

Set `AI_GATEWAY_API_KEY` (or rely on OIDC) and the two `NEXT_PUBLIC_SUPABASE_*`
vars in the Vercel project. See `vercel:env` / `vercel deploy` for the flow.

## Controls

| Control | What it does |
|---|---|
| **Sentiment dial** | Re-weights bot personas from Savage → Neutral → Adoring |
| **Intensity** | How chatty/reactive the room is (reply chance + ambient cadence) |
| **Quick fire** | Instant Hype / Roast / Confused / Absurd bursts, or raw emote spam |
| **Operator override** | A directive the bots must follow literally on their next lines |
| **Model** | Haiku 4.5 (fast) ↔ Sonnet 5 (rich), live-switchable |
| **Bots / Creativity / Stream context** | Room size, temperature, what you're doing |
| **Video stage** | Camera / screen source, chat corner, fullscreen — the composited output |

## Roadmap

- Presets (save/load persona + sentiment configs) — port from the old SQLite model
- Persist chat history to Supabase Postgres (currently ephemeral broadcast)
- Streaming token-by-token rendering for a "typing" feel
- Per-bot model assignment; more persona packs
