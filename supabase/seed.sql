-- Minimal local seed for confirming Task 8A schema and tactical_duel rules.
-- Keep game-rule numbers synchronized intentionally with src/game/modes/tactical-duel/config.ts.
-- Do not treat SQL seed values as the canonical gameplay source; update through a
-- documented migration/seed workflow when a new rules_version is introduced.

insert into public.game_rule_sets (game_mode, rules_version, config, is_active)
values (
  'tactical_duel',
  'tactical_duel.v1',
  '{
    "gameMode": "tactical_duel",
    "rulesVersion": "tactical_duel.v1",
    "boardWidth": 8,
    "boardHeight": 8,
    "initialUnitCount": 6,
    "reserveUnitCount": 2,
    "initialPlacementDepth": 2,
    "flagMaxDamage": 3,
    "sameCharacterLimit": 1,
    "friendlyPassThrough": true,
    "friendlyStopAllowed": false,
    "enemyPassThrough": false,
    "revealOnFirstMove": true,
    "revealWhenAttacked": true,
    "keepRevealedUntilMatchEnd": true,
    "clampCurrentDefenseToZero": true
  }'::jsonb,
  true
)
on conflict (game_mode, rules_version) do update
set config = excluded.config,
    is_active = excluded.is_active;

insert into public.characters (character_key, name, description, default_artwork_url, is_active)
values (
  'debug_vanguard',
  'Debug Vanguard',
  'Minimal Task 8A seed character for local Supabase schema checks.',
  null,
  true
)
on conflict (character_key) do update
set name = excluded.name,
    description = excluded.description,
    default_artwork_url = excluded.default_artwork_url,
    is_active = excluded.is_active;

insert into public.card_variants (
  character_id,
  card_key,
  card_name,
  movement_type,
  movement_data,
  base_attack,
  base_defense,
  attribute,
  ability_data,
  artwork_url,
  thumbnail_url,
  rarity,
  rules_version_from,
  is_active
)
select
  id,
  'debug_vanguard:base',
  'Debug Vanguard',
  'orthogonal',
  '{"kind":"line","directions":[{"x":1,"y":0},{"x":-1,"y":0},{"x":0,"y":1},{"x":0,"y":-1}],"maxDistance":1}'::jsonb,
  1,
  1,
  'neutral',
  '{}'::jsonb,
  null,
  null,
  'common',
  'tactical_duel.v1',
  true
from public.characters
where character_key = 'debug_vanguard'
on conflict (character_id, card_key) do update
set card_name = excluded.card_name,
    movement_type = excluded.movement_type,
    movement_data = excluded.movement_data,
    base_attack = excluded.base_attack,
    base_defense = excluded.base_defense,
    attribute = excluded.attribute,
    ability_data = excluded.ability_data,
    artwork_url = excluded.artwork_url,
    thumbnail_url = excluded.thumbnail_url,
    rarity = excluded.rarity,
    rules_version_from = excluded.rules_version_from,
    is_active = excluded.is_active;
