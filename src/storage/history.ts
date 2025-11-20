import { getSupabaseAdminClient } from "./supabase";

export type PersonaHistoryType = "positive" | "negative";

export interface PersonaHistoryEntry {
  id: string;
  persona_type: PersonaHistoryType;
  body: string;
  created_at: string;
}

export interface StreamContextHistoryEntry {
  id: string;
  body: string;
  created_at: string;
}

export interface BotNamePresetEntry {
  id: string;
  preset_name: string;
  bot_names: string[];
  created_at: string;
}

export interface SettingsPresetEntry {
  id: string;
  preset_name: string;
  bots_preset_id: string | null;
  positive_persona_id: string | null;
  negative_persona_id: string | null;
  temperature: number;
  weight_positive: number;
  weight_negative: number;
  stream_context: string;
  created_at: string;
}

export interface SettingsPresetWithData extends SettingsPresetEntry {
  bot_names?: string[];
  positive_persona?: string;
  negative_persona?: string;
}

function normalizeLimit(limit: number, defaultValue = 10) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return defaultValue;
  }
  return Math.min(100, Math.max(1, Math.floor(limit)));
}

export async function insertPersonaHistory(
  personaType: PersonaHistoryType,
  body: string,
): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const { error } = await client.from("persona_prompt_history").insert({
    persona_type: personaType,
    body: body.trim(),
  });

  if (error) {
    throw new Error(`Failed to insert persona history: ${error.message}`);
  }
}

export async function insertStreamContextHistory(body: string): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const { error } = await client.from("stream_context_history").insert({
    body: body.trim(),
  });

  if (error) {
    throw new Error(`Failed to insert stream context history: ${error.message}`);
  }
}

export async function fetchPersonaHistory(
  personaType: PersonaHistoryType,
  limit = 10,
): Promise<PersonaHistoryEntry[]> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const normalizedLimit = normalizeLimit(limit);
  const { data, error } = await client
    .from("persona_prompt_history")
    .select("*")
    .eq("persona_type", personaType)
    .order("created_at", { ascending: false })
    .limit(normalizedLimit);

  if (error) {
    throw new Error(`Failed to fetch persona history: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    persona_type: row.persona_type as PersonaHistoryType,
    body: row.body,
    created_at: row.created_at,
  }));
}

export async function fetchStreamContextHistory(
  limit = 10,
): Promise<StreamContextHistoryEntry[]> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const normalizedLimit = normalizeLimit(limit);
  const { data, error } = await client
    .from("stream_context_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(normalizedLimit);

  if (error) {
    throw new Error(`Failed to fetch stream context history: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
  }));
}

export async function insertBotNamePreset(
  presetName: string,
  botNames: string[],
): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const { error } = await client.from("bot_name_presets").insert({
    preset_name: presetName.trim(),
    bot_names: botNames,
  });

  if (error) {
    throw new Error(`Failed to insert bot name preset: ${error.message}`);
  }
}

export async function fetchBotNamePresets(
  limit = 50,
): Promise<BotNamePresetEntry[]> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const normalizedLimit = normalizeLimit(limit, 50);
  const { data, error } = await client
    .from("bot_name_presets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(normalizedLimit);

  if (error) {
    throw new Error(`Failed to fetch bot name presets: ${error.message}`);
  }

  return (data || []).map((row) => {
    let botNames: string[] = [];
    if (Array.isArray(row.bot_names)) {
      botNames = row.bot_names;
    } else if (typeof row.bot_names === "string") {
      try {
        botNames = JSON.parse(row.bot_names);
        if (!Array.isArray(botNames)) {
          botNames = [];
        }
      } catch {
        botNames = [];
      }
    }

    return {
      id: row.id,
      preset_name: row.preset_name,
      bot_names: botNames,
      created_at: row.created_at,
    };
  });
}

export async function fetchBotNamePresetById(
  id: string,
): Promise<BotNamePresetEntry | null> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const { data, error } = await client
    .from("bot_name_presets")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to fetch bot name preset: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  let botNames: string[] = [];
  if (Array.isArray(data.bot_names)) {
    botNames = data.bot_names;
  } else if (typeof data.bot_names === "string") {
    try {
      botNames = JSON.parse(data.bot_names);
      if (!Array.isArray(botNames)) {
        botNames = [];
      }
    } catch {
      botNames = [];
    }
  }

  return {
    id: data.id,
    preset_name: data.preset_name,
    bot_names: botNames,
    created_at: data.created_at,
  };
}

export async function ensurePersonaInHistory(
  personaType: PersonaHistoryType,
  body: string,
): Promise<string> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const trimmedBody = body.trim();
  if (!trimmedBody) {
    throw new Error(`Persona body cannot be empty for type ${personaType}`);
  }

  // Check if exact match exists
  const { data: existing } = await client
    .from("persona_prompt_history")
    .select("id")
    .eq("persona_type", personaType)
    .eq("body", trimmedBody)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create new entry
  const { data: newEntry, error } = await client
    .from("persona_prompt_history")
    .insert({
      persona_type: personaType,
      body: trimmedBody,
    })
    .select("id")
    .single();

  if (error || !newEntry) {
    throw new Error(`Failed to ensure persona in history: ${error?.message || "Unknown error"}`);
  }

  return newEntry.id;
}

export async function findOrCreateBotPreset(
  botNames: string[],
): Promise<string> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const sanitizedNames = botNames
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter((name) => name.length > 0)
    .sort();

  if (sanitizedNames.length === 0) {
    throw new Error("At least one bot name is required");
  }

  // Check if exact match exists
  const { data: existing } = await client
    .from("bot_name_presets")
    .select("id")
    .eq("bot_names", JSON.stringify(sanitizedNames))
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create new preset
  const presetName = `Bot Preset ${sanitizedNames.length} bots`;
  const { data: newPreset, error } = await client
    .from("bot_name_presets")
    .insert({
      preset_name: presetName,
      bot_names: sanitizedNames,
    })
    .select("id")
    .single();

  if (error || !newPreset) {
    throw new Error(`Failed to create bot preset: ${error?.message || "Unknown error"}`);
  }

  return newPreset.id;
}

export async function insertSettingsPreset(
  presetName: string,
  botsPresetId: string | null,
  positivePersonaId: string | null,
  negativePersonaId: string | null,
  temperature: number,
  weightPositive: number,
  weightNegative: number,
  streamContext: string,
): Promise<string> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const { data, error } = await client
    .from("settings_presets")
    .insert({
      preset_name: presetName.trim(),
      bots_preset_id: botsPresetId,
      positive_persona_id: positivePersonaId,
      negative_persona_id: negativePersonaId,
      temperature,
      weight_positive: weightPositive,
      weight_negative: weightNegative,
      stream_context: streamContext.trim(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert settings preset: ${error?.message || "Unknown error"}`);
  }

  return data.id;
}

export async function updateSettingsPreset(
  id: string,
  presetName: string,
  botsPresetId: string | null,
  positivePersonaId: string | null,
  negativePersonaId: string | null,
  temperature: number,
  weightPositive: number,
  weightNegative: number,
  streamContext: string,
): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const { error } = await client
    .from("settings_presets")
    .update({
      preset_name: presetName.trim(),
      bots_preset_id: botsPresetId,
      positive_persona_id: positivePersonaId,
      negative_persona_id: negativePersonaId,
      temperature,
      weight_positive: weightPositive,
      weight_negative: weightNegative,
      stream_context: streamContext.trim(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update settings preset: ${error.message}`);
  }
}

export async function fetchSettingsPresets(
  limit = 50,
): Promise<SettingsPresetWithData[]> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const normalizedLimit = normalizeLimit(limit, 50);
  const { data, error } = await client
    .from("settings_presets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(normalizedLimit);

  if (error) {
    throw new Error(`Failed to fetch settings presets: ${error.message}`);
  }

  const presets: SettingsPresetWithData[] = [];

  for (const row of data || []) {
    const preset: SettingsPresetWithData = {
      id: row.id,
      preset_name: row.preset_name,
      bots_preset_id: row.bots_preset_id,
      positive_persona_id: row.positive_persona_id,
      negative_persona_id: row.negative_persona_id,
      temperature: row.temperature ?? 0.8,
      weight_positive: row.weight_positive ?? 50,
      weight_negative: row.weight_negative ?? 50,
      stream_context: row.stream_context ?? "",
      created_at: row.created_at,
    };

    // Fetch bot names if bots_preset_id exists
    if (row.bots_preset_id) {
      const { data: botPreset } = await client
        .from("bot_name_presets")
        .select("bot_names")
        .eq("id", row.bots_preset_id)
        .single();

      if (botPreset) {
        if (Array.isArray(botPreset.bot_names)) {
          preset.bot_names = botPreset.bot_names;
        } else if (typeof botPreset.bot_names === "string") {
          try {
            preset.bot_names = JSON.parse(botPreset.bot_names);
            if (!Array.isArray(preset.bot_names)) {
              preset.bot_names = [];
            }
          } catch {
            preset.bot_names = [];
          }
        }
      }
    }

    // Fetch positive persona if exists
    if (row.positive_persona_id) {
      const { data: persona } = await client
        .from("persona_prompt_history")
        .select("body")
        .eq("id", row.positive_persona_id)
        .single();

      if (persona) {
        preset.positive_persona = persona.body;
      }
    }

    // Fetch negative persona if exists
    if (row.negative_persona_id) {
      const { data: persona } = await client
        .from("persona_prompt_history")
        .select("body")
        .eq("id", row.negative_persona_id)
        .single();

      if (persona) {
        preset.negative_persona = persona.body;
      }
    }

    presets.push(preset);
  }

  return presets;
}

export async function fetchSettingsPresetById(
  id: string,
): Promise<SettingsPresetWithData | null> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const { data, error } = await client
    .from("settings_presets")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to fetch settings preset: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const preset: SettingsPresetWithData = {
    id: data.id,
    preset_name: data.preset_name,
    bots_preset_id: data.bots_preset_id,
    positive_persona_id: data.positive_persona_id,
    negative_persona_id: data.negative_persona_id,
    temperature: data.temperature ?? 0.8,
    weight_positive: data.weight_positive ?? 50,
    weight_negative: data.weight_negative ?? 50,
    stream_context: data.stream_context ?? "",
    created_at: data.created_at,
  };

  // Fetch bot names if bots_preset_id exists
  if (data.bots_preset_id) {
    const { data: botPreset } = await client
      .from("bot_name_presets")
      .select("bot_names")
      .eq("id", data.bots_preset_id)
      .single();

    if (botPreset) {
      if (Array.isArray(botPreset.bot_names)) {
        preset.bot_names = botPreset.bot_names;
      } else if (typeof botPreset.bot_names === "string") {
        try {
          preset.bot_names = JSON.parse(botPreset.bot_names);
          if (!Array.isArray(preset.bot_names)) {
            preset.bot_names = [];
          }
        } catch {
          preset.bot_names = [];
        }
      }
    }
  }

  // Fetch positive persona if exists
  if (data.positive_persona_id) {
    const { data: persona } = await client
      .from("persona_prompt_history")
      .select("body")
      .eq("id", data.positive_persona_id)
      .single();

    if (persona) {
      preset.positive_persona = persona.body;
    }
  }

  // Fetch negative persona if exists
  if (data.negative_persona_id) {
    const { data: persona } = await client
      .from("persona_prompt_history")
      .select("body")
      .eq("id", data.negative_persona_id)
      .single();

    if (persona) {
      preset.negative_persona = persona.body;
    }
  }

  return preset;
}
