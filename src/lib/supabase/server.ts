/**
 * Server-side Supabase client factory (groundwork only).
 *
 * ⚠️ SERVER-ONLY. The service role key bypasses RLS, so this module must only
 * be imported from server code (Route Handlers / Server Actions). Never import
 * it into a Client Component. When the online backend lands, this is the only
 * path that writes match_state_json, match_events, state_version, accepted and
 * rejection_code — clients submit action intents only.
 *
 * Lazy + dependency-light so the app builds without `@supabase/supabase-js`
 * installed and without env vars set. Nothing in the game imports this yet.
 *
 * See docs/SUPABASE_PLAN.md.
 */

import {
  SUPABASE_JS_MODULE,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
  getSupabasePublicConfig,
  getSupabaseServiceRoleKey,
} from "./config";

/**
 * Creates a service-role Supabase client (bypasses RLS), or throws a clear
 * error when env vars are missing / the SDK is not installed.
 */
export const createSupabaseServiceRoleClient = async (): Promise<unknown> => {
  const config = getSupabasePublicConfig();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (config === null || serviceRoleKey === null) {
    throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
  }

  // Runtime-only import; SDK is not a build-time dependency yet.
  const supabase = (await import(SUPABASE_JS_MODULE)) as {
    createClient: (url: string, key: string, options?: unknown) => unknown;
  };

  return supabase.createClient(config.url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
