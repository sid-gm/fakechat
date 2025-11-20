import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type { Database as SQLiteDatabase } from "better-sqlite3";

const DEFAULT_DB_DIR =
  process.env.OFFLINE_DB_DIR?.trim() ||
  "/Users/sidsantbak/Desktop/FakeChat/offlinedb";

const DB_DIRECTORY = path.resolve(DEFAULT_DB_DIR);
const DB_FILENAME = "history.sqlite";
const DB_PATH = path.join(DB_DIRECTORY, DB_FILENAME);

let database: SQLiteDatabase | null = null;

function ensureDirectoryExists() {
  if (!fs.existsSync(DB_DIRECTORY)) {
    fs.mkdirSync(DB_DIRECTORY, { recursive: true });
  }
}

function applyMigrations(instance: SQLiteDatabase) {
  instance.exec(
    `
      CREATE TABLE IF NOT EXISTS persona_prompt_history (
        id TEXT PRIMARY KEY,
        persona_type TEXT NOT NULL CHECK (persona_type IN ('positive', 'negative')),
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_persona_history_created_at
        ON persona_prompt_history (persona_type, datetime(created_at) DESC);

      CREATE TABLE IF NOT EXISTS stream_context_history (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_stream_context_created_at
        ON stream_context_history (datetime(created_at) DESC);

      CREATE TABLE IF NOT EXISTS bot_name_presets (
        id TEXT PRIMARY KEY,
        preset_name TEXT NOT NULL,
        bot_names TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_bot_name_presets_created_at
        ON bot_name_presets (datetime(created_at) DESC);

      CREATE TABLE IF NOT EXISTS settings_presets (
        id TEXT PRIMARY KEY,
        preset_name TEXT NOT NULL,
        bots_preset_id TEXT,
        positive_persona_id TEXT,
        negative_persona_id TEXT,
        temperature REAL,
        weight_positive INTEGER,
        weight_negative INTEGER,
        stream_context TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_settings_presets_created_at
        ON settings_presets (datetime(created_at) DESC);
    `,
  );
}

function bootstrapDatabase(): SQLiteDatabase {
  ensureDirectoryExists();
  const instance = new Database(DB_PATH);
  instance.pragma("journal_mode = WAL");
  applyMigrations(instance);
  return instance;
}

export function getHistoryDatabase(): SQLiteDatabase {
  if (!database) {
    database = bootstrapDatabase();
  }
  return database;
}

export function initializeHistoryDatabase(): string {
  getHistoryDatabase();
  return DB_PATH;
}

export function getHistoryDatabasePath() {
  return DB_PATH;
}


