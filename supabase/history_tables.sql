-- Enable pgcrypto for gen_random_uuid (safe if already enabled)
create extension if not exists "pgcrypto";

create table if not exists public.persona_prompt_history (
  id uuid primary key default gen_random_uuid(),
  persona_type text not null check (persona_type in ('positive', 'negative')),
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists persona_prompt_history_type_created_at_idx
  on public.persona_prompt_history (persona_type, created_at desc);

create table if not exists public.stream_context_history (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists stream_context_history_created_at_idx
  on public.stream_context_history (created_at desc);

create table if not exists public.bot_name_presets (
  id uuid primary key default gen_random_uuid(),
  preset_name text not null,
  bot_names jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists bot_name_presets_created_at_idx
  on public.bot_name_presets (created_at desc);

create table if not exists public.settings_presets (
  id uuid primary key default gen_random_uuid(),
  preset_name text not null,
  bots_preset_id uuid references public.bot_name_presets(id) on delete set null,
  positive_persona_id uuid references public.persona_prompt_history(id) on delete set null,
  negative_persona_id uuid references public.persona_prompt_history(id) on delete set null,
  temperature real,
  weight_positive integer,
  weight_negative integer,
  stream_context text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists settings_presets_created_at_idx
  on public.settings_presets (created_at desc);






