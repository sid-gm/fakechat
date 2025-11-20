# Fake Chat Overlay

An OBS-ready, Twitch-style chat overlay powered by a Node.js backend. The server simulates live chatter, injects messages via REST, and generates AI replies using OpenAI. The front-end overlay is a lightweight HTML/CSS/JS bundle that you can load in OBS as a Browser Source.

## Features

- Express + WebSocket server that streams chat messages to connected overlays
- Interval-based fake chatter plus manual injection via UI or REST (with forced operator overrides)
- Optional OpenAI integration for AI-driven bot replies with configurable persona
- Broadcaster console that records your mic, transcribes with Whisper, and injects sentences live
- Injection console that sends instant directions which override STT for a few seconds
- Web overlay with transparent background, animated messages, badges, and username colors

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and fill in your values. At minimum, set `OPENAI_API_KEY` to enable AI responses. Without a key, the overlay still runs with fake chatter and manual injection.

3. **Run in development**

   ```bash
   npm run dev
   ```

   The server listens on `http://localhost:3000` by default. Open `http://localhost:3000/view` in a browser or add it as an OBS Browser Source.

4. **Build for production**

   ```bash
   npm run build
   npm start
   ```

## Offline History Database

Persona prompt history and stream context history are stored locally in a SQLite database so you can develop without Supabase:

1. The database file lives in `/Users/sidsantbak/Desktop/FakeChat/offlinedb/history.sqlite` by default (override with `OFFLINE_DB_DIR`).
2. Run `npm run db:init` once if you want to pre-create the database and tables. The server also initializes it automatically on demand.
3. The same database is used when inserting persona changes or stream context updates via the `/settings` endpoint and when reading history via `/history/*`.

## REST & WebSocket API

- `GET /` — Health response with basic status.
- `GET /view` — Overlay HTML page (also served statically).
- `GET /broadcaster` — Unified broadcaster console for mic capture, transcript monitoring, settings configuration, and chat injection. All functionality is now integrated into this single page.
- `POST /injection` — Broadcast an instruction that chat responds to immediately and suppress STT for six seconds. Bots treat these overrides as pre-approved, safe directives and follow them without moralizing or refusing. Use it for playful, non-harmful improvisation only.

  ```json
  {
    "content": "pretend like I just said something super absurd. react accordingly."
  }
  ```

- `POST /inject` — Low-level endpoint to inject a message directly into the chat timeline.

  ```json
  {
    "username": "PixelPioneer",
    "content": "This overlay is fire!",
    "role": "viewer" // viewer | bot | moderator | streamer (optional, defaults to viewer)
  }
  ```

- `POST /speech/transcribe` — Accepts mic recordings, runs Whisper, and returns text.
- `POST /realtime/transcript` — Used by the broadcaster UI to forward finalized sentences into chat as the `streamer` role.

WebSocket clients connect to the same origin (`ws://localhost:3000`). Upon connection they receive a `chat_history` payload, followed by `chat_message` payloads for new events.

## Customization

Environment variables allow you to tune behavior:

- `PORT` — HTTP/WebSocket port (default `3000`)
- `BOT_USERNAME`, `BOT_PERSONA` — Change the AI bot identity and tone
- `OPENAI_MODEL` — Pick any compatible OpenAI Chat Completions model
- `AI_REPLY_CHANCE` — Baseline probability to reply when no keywords are present
- `AI_MIN_INTERVAL_MS` — Cooldown between AI replies
- `AI_MAX_CONTEXT` — Number of recent messages passed to the model for context
- `OPENAI_TRANSCRIPTION_MODEL` — Whisper/STT model used for broadcaster transcription (default `whisper-1`)
- `STREAMER_USERNAME` — Display name used when posting `streamer` role messages (defaults to `Streamer`)

## OBS Tips

- Add a Browser Source pointing to `http://localhost:3000/view`
- Set the background color to fully transparent (already handled by CSS)
- Adjust the source size to fit your layout; the overlay is responsive
- The overlay ignores pointer events, so interactions fall through to layers beneath

## Live Mic Pipeline

1. Set `OPENAI_API_KEY` (plus optional `OPENAI_TRANSCRIPTION_MODEL`) in `.env`, then restart the server.
2. Visit `http://localhost:3000/broadcaster` and choose a display name.
3. Click **Start Recording**; a take is captured until you hit **Stop** (or the tab ends the recording).
4. Each take is uploaded to `/speech/transcribe`, Whisper returns text, the console splits it into sentences, and each sentence is injected as the `streamer` role so bots can react in real time.

## License

MIT

