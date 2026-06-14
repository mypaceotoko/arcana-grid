/**
 * Browser-side Supabase client factory (groundwork only).
 *
 * Uses the public URL + anon key. RLS must protect all data — never assume the
 * browser is trusted. This is deliberately lazy and dependency-light so the app
 * builds without `@supabase/supabase-js` installed and without env vars set.
 * Nothing in the game (reducer, /debug/local-match) imports this yet.
 *
 * See docs/SUPABASE_PLAN.md.
 */

import {
  SUPABASE_JS_MODULE,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
  getSupabasePublicConfig,
} from "./config";

/**
 * Creates a browser Supabase client, or throws a clear error when env vars are
 * missing / the SDK is not installed. Async because the SDK is imported lazily.
 */
export const createSupabaseBrowserClient = async (): Promise<unknown> => {
  const config = getSupabasePublicConfig();
  if (config === null) {
    throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
  }

  // Runtime-only import; SDK is not a build-time dependency yet.
  const supabase = (await import(SUPABASE_JS_MODULE)) as {
    createClient: (url: string, key: string, options?: unknown) => unknown;
  };

  return supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
};
