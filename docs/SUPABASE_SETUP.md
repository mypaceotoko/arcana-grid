# Supabase Setup (Task 8A)

Task 8A adds the connection foundation for future online 2-player matches. It does **not** add Auth UI, room creation/joining, Realtime, Presence, online match state tables, Storage migration, ranking, rewards, or gacha.

## Official package choice

Supabase's current Next.js SSR guide uses `@supabase/ssr` helpers such as `createBrowserClient` and `createServerClient` for cookie-aware browser/server clients. Supabase's JavaScript reference installs `@supabase/supabase-js` for the underlying JS client. ARCANA GRID therefore adds only:

- `@supabase/supabase-js`
- `@supabase/ssr`

No deprecated auth-helper package or additional Supabase wrapper is required for this task.

## Environment variables

Copy `.env.example` to `.env.local` after creating a Supabase project:

```bash
cp .env.example .env.local
```

Set these values locally and in Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
ENABLE_DEBUG_PAGES=false
```

Security rules:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be used by browser and SSR clients.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it with `NEXT_PUBLIC_`.
- Never import the admin client from Client Components.
- Never commit `.env.local` or real secrets.
- Missing Supabase variables throw clear errors only when a Supabase client is created, so the existing top page and debug pages can still build before a Supabase project exists.

## Client modules

- `src/lib/supabase/client.ts`: Browser client for Client Components; uses `createBrowserClient` and public env only.
- `src/lib/supabase/server.ts`: Server Component / Route Handler client; imports `server-only`, uses `createServerClient`, and wires Next.js cookies.
- `src/lib/supabase/admin.ts`: Server-only administrative client; imports `server-only`, uses `createClient`, requires `SUPABASE_SERVICE_ROLE_KEY`, disables persisted auth sessions, and is intended for trusted server operations.
- `src/lib/supabase/env.ts`: Environment validation helpers.

## Local Supabase

The project does not assume a global Supabase CLI installation. Use the npm scripts, which run the CLI through `npx`:

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:stop
```

`npm run supabase:reset` applies migrations and runs `supabase/seed.sql` against the local database.

## Migrations and seed

Task 8A creates:

- `supabase/config.toml`
- `supabase/migrations/20260612000000_task_8a_supabase_foundation.sql`
- `supabase/seed.sql`

Do not apply migrations by pasting SQL manually in the Dashboard. Schema changes must be committed as migration files.

### Initial tables

- `profiles`: `auth.users.id`-backed public profile rows.
- `characters`: active/inactive character master data.
- `card_variants`: card master data aligned with current engine concepts such as `movement_type`, `movement_data`, attack/defense, attribute, rarity, and `rules_version_from`.
- `user_cards`: per-user card ownership with a unique `(user_id, card_variant_id)` pair.
- `game_rule_sets`: versioned game mode rule configuration with unique `(game_mode, rules_version)`.

### RLS policy summary

RLS is enabled for every table.

- `profiles`: authenticated users can read profiles needed for public profile display; users can insert/update only their own row.
- `characters`: authenticated users can read active rows.
- `card_variants`: authenticated users can read active rows.
- `user_cards`: users can read only their own ownership rows.
- `game_rule_sets`: authenticated users can read active rows.
- Master data writes have no client write policy.
- `user_cards` insert/update/delete has no authenticated client policy. Future server routes/actions should validate intent and use trusted server-side operations.

The service role bypasses RLS and must be limited to trusted server code. Do not rely only on hiding UI; RLS is the baseline database boundary.

### Profile auto-creation

The migration installs `public.handle_new_auth_user_profile()` as an `after insert on auth.users` trigger. It is `security definer` and pins `search_path = public, pg_temp` to avoid unsafe search path resolution. If the insert into `profiles` fails, the Auth insert transaction can fail as well; this is intentional for consistency and should be monitored when Auth UI is introduced.

## Seed policy for game-rule values

`supabase/seed.sql` inserts `tactical_duel` / `tactical_duel.v1` with values matching `TACTICAL_DUEL_RULE_CONFIG`. TypeScript remains the in-app rules-engine source for current local gameplay. SQL seed values are for database verification and future online configuration loading; when rules change, introduce a new `rules_version` through a documented code + migration/seed update instead of editing values independently in multiple places.

## Database type generation

Because Task 8A does not connect to a real Supabase project, it does not hand-write a fake generated `Database` schema file. After local Supabase is running or after linking a remote project, generate types with:

```bash
npm run supabase:types
```

The command writes to:

```text
src/lib/supabase/database.generated.ts
```

For a remote linked project, use the Supabase CLI's project-ref flow if needed, for example:

```bash
npx supabase@latest gen types typescript --project-id <project-ref> > src/lib/supabase/database.generated.ts
```

Commit the generated file only after it is generated from the real schema.

## Vercel environment variables

In Vercel Project Settings, set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENABLE_DEBUG_PAGES` if the deployment uses it

Use Production/Preview/Development scopes deliberately. The service role key must remain server-only and must not appear in client bundles or logs.

## Not implemented yet

- Login / signup UI
- Room creation
- Room joining
- Online match state tables
- Realtime
- Presence
- Online match flow
- Debug state persistence in Supabase
- Card image Storage migration
- Ranking / rewards / gacha
