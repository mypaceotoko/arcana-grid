-- ARCANA GRID — Initial online-match schema (DESIGN DRAFT)
--
-- ⚠️ This file is a DESIGN ARTIFACT only. It is intentionally NOT applied to any
-- Supabase project yet. It documents the intended tables, columns, indexes and
-- Row Level Security (RLS) approach for the first online-match MVP so that a
-- future "Task S1/S2" PR can review and apply it deliberately.
--
-- Principles (see docs/SUPABASE_PLAN.md):
--   * The rules engine stays authoritative. The server applies
--     applyTacticalDuelAction / startTacticalDuelMatch and persists the result.
--   * Clients send action intents only. They never write match_state_json,
--     match_events, or state_version directly.
--   * Secret information (opponent hidden cards) is never exposed through a
--     row a client can read. Clients read per-viewer PlayerMatchViews that the
--     server builds, NOT the canonical match_state_json.
--   * Optimistic concurrency uses state_version / expected_state_version.
--   * Guest play is supported: match_players.user_id is nullable.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums (kept narrow; mirror the rules engine string unions)
-- ---------------------------------------------------------------------------
do $$ begin
  create type match_status as enum ('waiting', 'setup', 'active', 'finished', 'aborted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type match_player_slot as enum ('north', 'south');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- One row per authenticated user. Guests do NOT have a profile row.
-- Mirrors auth.users by id so RLS can use auth.uid() directly.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- matches
-- The authoritative match record. match_state_json holds the canonical
-- MatchState (full, includes opponent secrets) and is therefore SERVER-ONLY:
-- no client-facing RLS policy may select match_state_json. Clients must read
-- per-viewer PlayerMatchViews built by the server instead.
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id                     uuid primary key default gen_random_uuid(),
  mode                   text not null default 'tactical_duel',
  status                 match_status not null default 'waiting',
  rules_version          text not null,
  current_turn_player_id uuid,                 -- references match_players.id (set after start)
  state_version          integer not null default 1,
  match_state_json       jsonb not null,       -- canonical MatchState (SERVER-ONLY, contains secrets)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  finished_at            timestamptz
);

create index if not exists matches_status_idx on public.matches (status);
create index if not exists matches_updated_at_idx on public.matches (updated_at desc);

-- ---------------------------------------------------------------------------
-- match_players
-- Two rows per match (north / south). user_id is nullable to allow guests;
-- guest_name is used when user_id is null. A future check can enforce
-- "user_id is not null OR guest_name is not null".
-- ---------------------------------------------------------------------------
create table if not exists public.match_players (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches (id) on delete cascade,
  player_slot match_player_slot not null,
  user_id     uuid references auth.users (id) on delete set null, -- nullable: guests allowed
  guest_name  text,                                               -- nullable: used for guests
  joined_at   timestamptz not null default now(),
  unique (match_id, player_slot)
);

create index if not exists match_players_match_id_idx on public.match_players (match_id);
create index if not exists match_players_user_id_idx on public.match_players (user_id);

alter table public.matches
  add constraint matches_current_turn_player_fk
  foreign key (current_turn_player_id) references public.match_players (id) on delete set null;

-- ---------------------------------------------------------------------------
-- match_actions
-- Append-only log of submitted action intents. The SERVER validates each
-- action through the rules engine, then sets accepted + rejection_code.
-- payload_json stores the GameAction intent (no secret card data). Clients may
-- INSERT their own intents but never UPDATE accepted / rejection_code.
-- ---------------------------------------------------------------------------
create table if not exists public.match_actions (
  id                     uuid primary key default gen_random_uuid(),
  match_id               uuid not null references public.matches (id) on delete cascade,
  player_id              uuid not null references public.match_players (id) on delete cascade,
  action_type            text not null,        -- MOVE_UNIT | ATTACK_FLAG | DEPLOY_RESERVE | SUBMIT_INITIAL_PLACEMENT | CONCEDE_MATCH
  expected_state_version integer not null,     -- optimistic concurrency guard
  payload_json           jsonb not null,       -- GameAction intent (no opponent secrets)
  created_at             timestamptz not null default now(),
  accepted               boolean not null default false,
  rejection_code         text                  -- nullable RuleError code when rejected
);

create index if not exists match_actions_match_id_created_idx on public.match_actions (match_id, created_at);

-- ---------------------------------------------------------------------------
-- match_events
-- Append-only log of resolved GameEvents emitted by the reducer, in order.
-- state_version is the version AFTER the event's action resolved. Clients may
-- read events for matches they belong to. GameEvents are already safe public
-- info (unit ids, coordinates, revealed numbers) — they never carry unrevealed
-- card names/stats — so they can drive Realtime playback like /debug/local-match.
-- ---------------------------------------------------------------------------
create table if not exists public.match_events (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches (id) on delete cascade,
  state_version integer not null,
  event_type    text not null,
  payload_json  jsonb not null,       -- GameEventPayload (safe public info only)
  created_at    timestamptz not null default now()
);

create index if not exists match_events_match_id_version_idx on public.match_events (match_id, state_version);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at before update on public.matches
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- ROW LEVEL SECURITY (RLS) — DESIGN NOTES
-- ===========================================================================
-- Enable RLS on every table. The service role key (used only on the server)
-- bypasses RLS and is the ONLY path that writes match_state_json, match_events,
-- state_version, accepted and rejection_code.
--
--   alter table public.profiles       enable row level security;
--   alter table public.matches        enable row level security;
--   alter table public.match_players  enable row level security;
--   alter table public.match_actions  enable row level security;
--   alter table public.match_events   enable row level security;
--
-- profiles
--   * select/update own row:  using ( id = auth.uid() )
--
-- matches
--   * IMPORTANT: do NOT expose match_state_json to clients. Either keep all
--     client SELECT off this table and serve views via server endpoints, OR
--     expose a column-limited VIEW (id, mode, status, rules_version,
--     current_turn_player_id, state_version, timestamps) WITHOUT
--     match_state_json. The canonical secret-bearing column stays server-only.
--   * A participant predicate (reused below):
--       exists (
--         select 1 from public.match_players mp
--         where mp.match_id = matches.id and mp.user_id = auth.uid()
--       )
--
-- match_players
--   * select: participants of the same match may read both rows (slot + name).
--   * insert: handled by the server when creating/joining (service role), so a
--     guest with no user_id can still be seated. (No direct client insert.)
--
-- match_actions
--   * insert (own intent only):
--       with check (
--         exists (select 1 from public.match_players mp
--                 where mp.id = match_actions.player_id
--                   and mp.match_id = match_actions.match_id
--                   and mp.user_id = auth.uid())
--       )
--   * select: participants may read the action log for their match.
--   * update/delete: DENY for clients. Only the service role sets accepted /
--     rejection_code after validating through the rules engine.
--
-- match_events
--   * select: participants may read events for their match (drives Realtime).
--   * insert/update/delete: DENY for clients. Only the service role appends
--     reducer output.
--
-- Guests: because guest seats have user_id = null, guest reads/writes cannot be
-- authorized by auth.uid(). For the MVP, guest matches are mediated entirely by
-- server endpoints (service role) keyed by an unguessable match/session token,
-- rather than by client-side RLS. RLS above protects authenticated users; the
-- server enforces guest access.
