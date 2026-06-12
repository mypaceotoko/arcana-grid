# Supabase client modules

- `client.ts`: Browser / Client Component client. Uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `server.ts`: Server Component / Route Handler client. Imports `server-only` and uses cookie-aware `@supabase/ssr` server client creation.
- `admin.ts`: Server-only administrative client. Imports `server-only` and requires `SUPABASE_SERVICE_ROLE_KEY`.
- `env.ts`: Runtime environment validation helpers. They throw only when a Supabase client is created, so the app can build before a Supabase project exists.

Do not import `admin.ts` from Client Components. The service role key must remain server-only.

Generated database types should be written to `database.generated.ts` after connecting Supabase. Do not hand-write a fake generated schema.
