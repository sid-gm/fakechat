# FakeChat API Summary for iOS App Planning

## Overview
This document summarizes the API endpoints and functionality available in the FakeChat server, highlighting what can be extracted for an iOS app implementation.

---

## API Endpoints (Available for iOS)

### 1. **Chat & Messaging**

#### `POST /inject`
- **Purpose**: Inject a message directly into chat timeline
- **Body**: 
  ```json
  {
    "username": "PixelPioneer",
    "content": "This overlay is fire!",
    "role": "viewer" // optional: viewer | bot | moderator | streamer
  }
  ```
- **Response**: `{ status: "accepted", message: {...} }`
- **iOS Ready**: ✅ Yes

#### `POST /injection`
- **Purpose**: Inject an instruction that suppresses STT for 6 seconds and forces AI bots to respond
- **Body**: 
  ```json
  {
    "content": "pretend like I just said something super absurd. react accordingly."
  }
  ```
- **Response**: `{ status: "accepted", message: {...} }`
- **iOS Ready**: ✅ Yes

#### `POST /chat/purge`
- **Purpose**: Clear all chat history and reset state
- **Response**: `{ status: "purged" }`
- **iOS Ready**: ✅ Yes

#### `POST /realtime/transcript`
- **Purpose**: Send finalized transcript sentences to chat as `streamer` role
- **Body**: 
  ```json
  {
    "content": "Hello chat!",
    "username": "Streamer" // optional
  }
  ```
- **Response**: `{ status: "accepted", message: {...} }`
- **Note**: Returns `{ status: "suppressed" }` if STT is currently suppressed
- **iOS Ready**: ✅ Yes

---

### 2. **Speech-to-Text (STT)**

#### `POST /speech/transcribe`
- **Purpose**: Transcribe audio using OpenAI Whisper
- **Content-Type**: `multipart/form-data`
- **Body**: 
  - `audio`: Audio file (webm format expected)
  - `username`: Optional display name
- **Response**: 
  ```json
  {
    "status": "ok",
    "text": "transcribed text here"
  }
  ```
- **Requirements**: `OPENAI_API_KEY` must be configured
- **iOS Ready**: ✅ Yes (but iOS will need to send audio in compatible format)

---

### 3. **Settings Management**

#### `GET /settings`
- **Purpose**: Get current bot settings
- **Response**: 
  ```json
  {
    "status": "ok",
    "settings": {
      "numBots": 1,
      "temperature": 0.8,
      "botNames": ["GlitchCaster"],
      "promptBodies": [
        {
          "id": "positive",
          "label": "Positive",
          "instructions": "you are a supportive...",
          "weight": 50
        },
        {
          "id": "negative",
          "label": "Negative",
          "instructions": "you are a sarcastic...",
          "weight": 50
        }
      ],
      "streamContext": ""
    }
  }
  ```
- **iOS Ready**: ✅ Yes

#### `POST /settings`
- **Purpose**: Update bot settings
- **Body**: Partial updates allowed:
  ```json
  {
    "numBots": 2,
    "temperature": 0.9,
    "botNames": ["Bot1", "Bot2"],
    "promptBodies": [...],
    "streamContext": "Playing a new game"
  }
  ```
- **Response**: 
  ```json
  {
    "status": "updated" | "unchanged",
    "settings": {...}
  }
  ```
- **iOS Ready**: ✅ Yes

---

### 4. **History & Presets**

#### `GET /history/personas`
- **Purpose**: Get persona prompt history
- **Query Params**: 
  - `type`: `"positive"` | `"negative"` (default: `"positive"`)
  - `limit`: Number (default: 10, max: 50)
- **Response**: 
  ```json
  {
    "status": "ok",
    "type": "positive",
    "entries": [
      {
        "id": "uuid",
        "persona_type": "positive",
        "body": "prompt text",
        "created_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
  ```
- **iOS Ready**: ✅ Yes

#### `GET /history/stream-context`
- **Purpose**: Get stream context history
- **Query Params**: 
  - `limit`: Number (default: 10, max: 50)
- **Response**: 
  ```json
  {
    "status": "ok",
    "entries": [
      {
        "id": "uuid",
        "body": "context text",
        "created_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
  ```
- **iOS Ready**: ✅ Yes

#### `POST /settings/bot-names`
- **Purpose**: Save a bot name preset
- **Body**: 
  ```json
  {
    "presetName": "My Preset",
    "botNames": ["Bot1", "Bot2", "Bot3"]
  }
  ```
- **Response**: `{ status: "created", message: "..." }`
- **iOS Ready**: ✅ Yes

#### `GET /settings/bot-names`
- **Purpose**: Get all bot name presets
- **Query Params**: 
  - `limit`: Number (default: 50)
- **Response**: 
  ```json
  {
    "status": "ok",
    "presets": [
      {
        "id": "uuid",
        "preset_name": "My Preset",
        "bot_names": ["Bot1", "Bot2"],
        "created_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
  ```
- **iOS Ready**: ✅ Yes

#### `POST /settings/bot-names/load`
- **Purpose**: Load a bot name preset into active settings
- **Body**: 
  ```json
  {
    "id": "preset-uuid"
  }
  ```
- **Response**: 
  ```json
  {
    "status": "loaded",
    "settings": {...}
  }
  ```
- **iOS Ready**: ✅ Yes

#### `POST /settings/presets`
- **Purpose**: Save a comprehensive settings preset (includes personas, temperature, weights, etc.)
- **Body**: 
  ```json
  {
    "presetName": "My Settings",
    "botsPresetId": "uuid", // optional, references bot name preset
    "botNames": ["Bot1", "Bot2"], // optional if botsPresetId provided
    "positivePersona": "you are positive...",
    "negativePersona": "you are negative...",
    "temperature": 0.8,
    "weightPositive": 50,
    "weightNegative": 50,
    "streamContext": "context here"
  }
  ```
- **Response**: 
  ```json
  {
    "status": "created",
    "id": "preset-uuid",
    "message": "Settings preset saved successfully"
  }
  ```
- **iOS Ready**: ✅ Yes

#### `GET /settings/presets`
- **Purpose**: Get all settings presets
- **Query Params**: 
  - `limit`: Number (default: 50)
- **Response**: 
  ```json
  {
    "status": "ok",
    "presets": [
      {
        "id": "uuid",
        "preset_name": "My Settings",
        "bot_names": ["Bot1", "Bot2"],
        "positive_persona": "prompt text",
        "negative_persona": "prompt text",
        "temperature": 0.8,
        "weight_positive": 50,
        "weight_negative": 50,
        "stream_context": "context",
        "created_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
  ```
- **iOS Ready**: ✅ Yes

#### `PUT /settings/presets/:id`
- **Purpose**: Update an existing settings preset
- **Body**: Same as `POST /settings/presets` (all fields optional)
- **Response**: `{ status: "updated", message: "..." }`
- **iOS Ready**: ✅ Yes

#### `POST /settings/presets/load`
- **Purpose**: Load a settings preset into active settings
- **Body**: 
  ```json
  {
    "id": "preset-uuid"
  }
  ```
- **Response**: 
  ```json
  {
    "status": "loaded",
    "settings": {...}
  }
  ```
- **iOS Ready**: ✅ Yes

---

### 5. **WebSocket API**

#### Connection
- **URL**: `ws://localhost:3000` (or `wss://` for HTTPS)
- **Purpose**: Real-time chat message streaming

#### Message Types

**Incoming (Server → Client):**
1. `chat_history` - Sent immediately on connection
   ```json
   {
     "type": "chat_history",
     "data": [/* array of ChatMessage */]
   }
   ```

2. `chat_message` - New message broadcast
   ```json
   {
     "type": "chat_message",
     "data": {
       "id": "uuid",
       "timestamp": 1234567890,
       "username": "BotName",
       "role": "bot" | "viewer" | "moderator" | "streamer",
       "content": "message text"
     }
   }
   ```

3. `chat_purge` - Chat cleared
   ```json
   {
     "type": "chat_purge"
   }
   ```

**Outgoing (Client → Server):**
- None currently - WebSocket is read-only

**iOS Ready**: ✅ Yes (use native WebSocket or library like Starscream)

---

## Client-Side Only Features (NOT in API)

### 1. **Audio Recording & Processing** (`broadcaster.js`)
- **Browser MediaRecorder API**: Captures microphone audio
- **Chunking Logic**: Splits audio into 5-second chunks
- **Delta Processing**: Compares consecutive transcriptions to extract new text
- **Sentence Splitting**: Uses regex to split transcript into sentences
- **Pending Buffer Management**: Holds incomplete sentences until punctuation
- **iOS Equivalent**: Use `AVAudioRecorder` or `AVAudioEngine` + manual chunking

### 2. **UI Rendering** (`view.js`)
- **Message Rendering**: Creates DOM elements for chat messages
- **Color Assignment**: Hash-based username color assignment (Twitch-style)
- **Badge Rendering**: Visual badges for bot/moderator/streamer roles
- **Scroll Management**: Auto-scroll with user scroll detection
- **Message Popup**: Click-to-view message details
- **iOS Equivalent**: Use `UITableView`/`UICollectionView` with custom cells

### 3. **Injection UI** (`injection.js`)
- **Template Pills**: Quick-select templates for common injections
- **Persist Mode**: Re-sends injection every 1.5 seconds for a duration
- **Timer Selection**: Custom duration picker (M:SS format)
- **iOS Equivalent**: Native UI controls (buttons, pickers, timers)

### 4. **Settings UI** (`settings.js`)
- **Form Validation**: Client-side validation for bot count, temperature, etc.
- **Template Chips**: Quick-insert prompt templates
- **History Pills**: Clickable history entries to restore prompts
- **Preset Modals**: Modal dialogs for preset selection
- **Auto-save**: Debounced auto-save for bot names
- **Change Detection**: Tracks if loaded preset has been modified
- **iOS Equivalent**: Native forms, table views, navigation controllers

### 5. **BroadcastChannel Communication**
- **Purpose**: Cross-tab communication (e.g., overlay can stop STT recording)
- **Message Type**: `{ type: "stop-stt" }`
- **iOS Equivalent**: Not needed (single app), or use NotificationCenter for internal communication

### 6. **CSS Styling**
- **Transparent Overlay**: Gradient backgrounds, backdrop blur
- **Animations**: Fade-in, slide-up animations
- **Responsive Design**: Flexbox layouts
- **iOS Equivalent**: Native UIKit styling, Core Animation

---

## Core Server Logic (Not Directly Exposed via API)

### 1. **AI Agent System** (`src/ai/agent.ts`)
- **Multiple Bot Responders**: Manages multiple AI bots with different personas
- **Response Logic**: 
  - Keyword detection (triggers 70% chance response)
  - Random chance (baseline probability)
  - Bot mention detection (always responds)
  - Injection message handling (always responds)
- **Context Management**: Maintains recent message history
- **Rate Limiting**: Minimum interval between responses
- **Persona Assignment**: Distributes positive/negative personas based on weights
- **iOS Equivalent**: This runs server-side, iOS just receives results via WebSocket

### 2. **Message Segmentation** (`server.ts`)
- **Bot Content Bursting**: Splits long bot responses into multiple messages with delays
- **Sentence Splitting**: Uses regex to split on punctuation
- **Word-level Splitting**: Falls back to word boundaries if sentences too long
- **iOS Equivalent**: Not needed (server handles this)

### 3. **Injection Suppression** (`server.ts`)
- **STT Suppression**: Blocks `/realtime/transcript` for 6 seconds after injection
- **Active Injection Tracking**: Maintains current injection instruction
- **iOS Equivalent**: Server handles this, iOS just receives suppression status

### 4. **Bot Name Generation** (`server.ts`)
- **Auto-generation**: Creates bot names from prefix/suffix combinations
- **Uniqueness**: Ensures no duplicate names
- **Fallback**: Uses `BOT_USERNAME_SEED` if generation fails
- **iOS Equivalent**: Server handles this, iOS can optionally override via API

---

## Database Schema (SQLite)

The server uses SQLite for local storage. Tables include:

1. **persona_prompt_history**
   - `id` (UUID)
   - `persona_type` (positive/negative)
   - `body` (text)
   - `created_at` (datetime)

2. **stream_context_history**
   - `id` (UUID)
   - `body` (text)
   - `created_at` (datetime)

3. **bot_name_presets**
   - `id` (UUID)
   - `preset_name` (text)
   - `bot_names` (JSON array)
   - `created_at` (datetime)

4. **settings_presets**
   - `id` (UUID)
   - `preset_name` (text)
   - `bots_preset_id` (UUID, nullable)
   - `positive_persona_id` (UUID, nullable)
   - `negative_persona_id` (UUID, nullable)
   - `temperature` (real)
   - `weight_positive` (integer)
   - `weight_negative` (integer)
   - `stream_context` (text)
   - `created_at` (datetime)

**iOS Note**: These are server-side only. iOS app doesn't need to replicate this database.

---

## What iOS App Needs to Implement

### ✅ Can Use API Directly:
1. All REST endpoints listed above
2. WebSocket connection for real-time chat
3. Settings management (CRUD operations)
4. Preset management (save/load)
5. History retrieval
6. Message injection
7. Chat purging

### 🔨 Needs iOS-Specific Implementation:
1. **Audio Recording**
   - Use `AVAudioRecorder` or `AVAudioEngine`
   - Record in chunks (5 seconds recommended)
   - Convert to format compatible with `/speech/transcribe` (may need webm conversion or server-side format support)

2. **Audio Upload**
   - Multipart form data upload
   - Handle transcription response
   - Process delta text (compare consecutive transcriptions)

3. **Sentence Processing**
   - Split transcript into sentences (regex: `/[^.!?]+[.!?]+/g`)
   - Send complete sentences to `/realtime/transcript`
   - Handle pending buffer for incomplete sentences

4. **UI Components**
   - Chat message list (UITableView/UICollectionView)
   - Settings forms (UITextField, UISlider, UITextView)
   - Injection interface (UITextView + buttons)
   - Preset selection (UITableView in modal)
   - History display (collection of clickable items)

5. **WebSocket Handling**
   - Connect to server WebSocket
   - Parse incoming messages (`chat_history`, `chat_message`, `chat_purge`)
   - Update UI reactively

6. **State Management**
   - Track recording state
   - Manage pending transcript buffer
   - Handle suppression status from API
   - Cache settings locally (optional)

---

## Environment Variables (Server Configuration)

These are server-side only, but iOS should be aware:
- `OPENAI_API_KEY`: Required for STT and AI responses
- `OPENAI_MODEL`: AI model (default: `gpt-4o-mini`)
- `OPENAI_TRANSCRIPTION_MODEL`: STT model (default: `whisper-1`)
- `PORT`: Server port (default: 3000)
- `BOT_USERNAME`: Default bot name seed
- `BOT_PERSONA`: Default positive persona
- `BOT_NEGATIVE_PERSONA`: Default negative persona
- `AI_REPLY_CHANCE`: Baseline response probability (default: 0.35)
- `AI_MIN_INTERVAL_MS`: Minimum time between AI responses (default: 5000)
- `AI_MAX_CONTEXT`: Max messages in context (default: 15)
- `STREAMER_USERNAME`: Display name for streamer role (default: "Streamer")

---

## Summary: API Coverage

**✅ Fully Available via API:**
- Chat injection (both types)
- Settings management (full CRUD)
- Preset management (bot names + comprehensive settings)
- History retrieval (personas + stream context)
- STT transcription
- Real-time chat streaming (WebSocket)
- Chat purging

**❌ Client-Side Only (iOS must implement):**
- Audio recording (use native APIs)
- Audio chunking & upload logic
- Transcript delta processing
- Sentence splitting & buffering
- UI rendering (native UIKit)
- Form validation (can be client-side or rely on server validation)
- Cross-tab communication (not needed in iOS)

**🔧 Server Logic (No iOS equivalent needed):**
- AI bot management
- Message segmentation
- Injection suppression
- Bot name generation
- Response probability logic

---

## Recommendations for iOS App

1. **Start with API integration**: All core functionality is available via REST + WebSocket
2. **Implement audio recording**: Use `AVAudioEngine` for real-time audio capture
3. **Handle audio format**: May need to convert iOS audio format to webm, or add server-side support for iOS formats (m4a, caf)
4. **Replicate client logic**: Implement transcript delta processing and sentence splitting
5. **Use native UI**: Replace web UI with UIKit/SwiftUI components
6. **Consider offline mode**: Cache settings locally, but sync with server when available
7. **Error handling**: Handle network errors, API errors, and WebSocket disconnections gracefully



