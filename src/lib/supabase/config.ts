/**
 * Supabase environment configuration helpers.
 *
 * These intentionally read `process.env` lazily and return `null` when the
 * variables are absent, so the project still typechecks, lints, tests and
 * builds with NO Supabase env vars set. Nothing here connects to Supabase or
 * touches the game rules engine yet — this is groundwork only.
 *
 * See docs/SUPABASE_PLAN.md.
 */

export type SupabasePublicConfig = {
  /** Public project URL. Safe to expose to the browser. */
  url: string;
  /** Public anon key. Safe to expose to the browser; RLS protects the data. */
  anonKey: string;
};

/** Returns the browser-safe public config, or `null` when env vars are unset. */
export const getSupabasePublicConfig = (): SupabasePublicConfig | null => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    typeof url !== "string" ||
    url.length === 0 ||
    typeof anonKey !== "string" ||
    anonKey.length === 0
  ) {
    return null;
  }

  return { url, anonKey };
};

/** True when the public browser config is fully present. */
export const isSupabaseConfigured = (): boolean =>
  getSupabasePublicConfig() !== null;

/**
 * Returns the SERVER-ONLY service role key, or `null` when unset.
 * ⚠️ Never call this from client code; the key bypasses RLS.
 */
export const getSupabaseServiceRoleKey = (): string | null => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return typeof key === "string" && key.length > 0 ? key : null;
};

/** True when both the public config and the service role key are present. */
export const isSupabaseServerConfigured = (): boolean =>
  getSupabasePublicConfig() !== null && getSupabaseServiceRoleKey() !== null;

/**
 * Module specifier for the Supabase JS SDK. Typed as `string` (not a string
 * literal) on purpose: the SDK is not a dependency yet, so a literal dynamic
 * import would fail typecheck/build. Keeping it a `string` lets the lazy
 * `import(SUPABASE_JS_MODULE)` resolve only at runtime once the package and env
 * are actually configured.
 */
export const SUPABASE_JS_MODULE: string = "@supabase/supabase-js";

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (and SUPABASE_SERVICE_ROLE_KEY on the server) and install @supabase/supabase-js before using the online match backend.";
