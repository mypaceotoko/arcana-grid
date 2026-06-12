-- Task 8A: Supabase foundation for ARCANA GRID.
-- This migration creates initial master/user tables, RLS policies, timestamp
-- helpers, and a profile creation trigger for Supabase Auth users.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 40
  ),
  constraint profiles_avatar_url_length check (
    avatar_url is null or char_length(avatar_url) <= 2048
  )
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  character_key text not null,
  name text not null,
  description text not null default '',
  default_artwork_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint characters_character_key_unique unique (character_key),
  constraint characters_character_key_format check (
    character_key ~ '^[a-z0-9][a-z0-9_:-]{1,63}$'
  ),
  constraint characters_name_length check (char_length(name) between 1 and 80),
  constraint characters_default_artwork_url_length check (
    default_artwork_url is null or char_length(default_artwork_url) <= 2048
  )
);

create table public.card_variants (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete restrict,
  card_key text not null,
  card_name text not null,
  movement_type text not null,
  movement_data jsonb not null,
  base_attack integer not null,
  base_defense integer not null,
  attribute text not null,
  ability_data jsonb not null default '{}'::jsonb,
  artwork_url text,
  thumbnail_url text,
  rarity text not null default 'common',
  rules_version_from text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_variants_character_card_key_unique unique (character_id, card_key),
  constraint card_variants_card_key_format check (
    card_key ~ '^[a-z0-9][a-z0-9_:-]{1,95}$'
  ),
  constraint card_variants_card_name_length check (char_length(card_name) between 1 and 100),
  constraint card_variants_movement_type_check check (
    movement_type in ('orthogonal', 'diagonal', 'adjacent', 'special_offset')
  ),
  constraint card_variants_movement_data_object check (jsonb_typeof(movement_data) = 'object'),
  constraint card_variants_base_attack_nonnegative check (base_attack >= 0),
  constraint card_variants_base_defense_nonnegative check (base_defense >= 0),
  constraint card_variants_attribute_check check (
    attribute in ('fire', 'water', 'lightning', 'earth', 'light', 'dark', 'neutral')
  ),
  constraint card_variants_ability_data_object check (jsonb_typeof(ability_data) = 'object'),
  constraint card_variants_artwork_url_length check (
    artwork_url is null or char_length(artwork_url) <= 2048
  ),
  constraint card_variants_thumbnail_url_length check (
    thumbnail_url is null or char_length(thumbnail_url) <= 2048
  ),
  constraint card_variants_rarity_length check (char_length(rarity) between 1 and 64),
  constraint card_variants_rules_version_from_length check (
    char_length(rules_version_from) between 1 and 80
  )
);

create table public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_variant_id uuid not null references public.card_variants(id) on delete restrict,
  quantity integer not null default 1,
  obtained_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_cards_user_variant_unique unique (user_id, card_variant_id),
  constraint user_cards_quantity_positive check (quantity > 0)
);

create table public.game_rule_sets (
  id uuid primary key default gen_random_uuid(),
  game_mode text not null,
  rules_version text not null,
  config jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_rule_sets_mode_version_unique unique (game_mode, rules_version),
  constraint game_rule_sets_game_mode_check check (game_mode in ('tactical_duel')),
  constraint game_rule_sets_rules_version_length check (char_length(rules_version) between 1 and 80),
  constraint game_rule_sets_config_object check (jsonb_typeof(config) = 'object')
);

create index characters_active_idx on public.characters (is_active) where is_active;
create index card_variants_character_id_idx on public.card_variants (character_id);
create index card_variants_active_idx on public.card_variants (is_active) where is_active;
create index card_variants_rules_version_from_idx on public.card_variants (rules_version_from);
create index user_cards_user_id_idx on public.user_cards (user_id);
create index user_cards_card_variant_id_idx on public.user_cards (card_variant_id);
create index game_rule_sets_active_idx on public.game_rule_sets (is_active) where is_active;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger characters_set_updated_at
before update on public.characters
for each row execute function public.set_updated_at();

create trigger card_variants_set_updated_at
before update on public.card_variants
for each row execute function public.set_updated_at();

create trigger user_cards_set_updated_at
before update on public.user_cards
for each row execute function public.set_updated_at();

create trigger game_rule_sets_set_updated_at
before update on public.game_rule_sets
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', '')
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user_profile();

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.card_variants enable row level security;
alter table public.user_cards enable row level security;
alter table public.game_rule_sets enable row level security;

create policy "Authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "Authenticated users can read active characters"
on public.characters
for select
to authenticated
using (is_active);

create policy "Authenticated users can read active card variants"
on public.card_variants
for select
to authenticated
using (is_active);

create policy "Users can read own cards"
on public.user_cards
for select
to authenticated
using (user_id = auth.uid());

create policy "Authenticated users can read active rule sets"
on public.game_rule_sets
for select
to authenticated
using (is_active);

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.characters to authenticated;
grant select on public.card_variants to authenticated;
grant select on public.user_cards to authenticated;
grant select on public.game_rule_sets to authenticated;
grant all on public.profiles to service_role;
grant all on public.characters to service_role;
grant all on public.card_variants to service_role;
grant all on public.user_cards to service_role;
grant all on public.game_rule_sets to service_role;
