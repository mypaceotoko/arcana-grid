// Temporary compile-time declarations for environments where the package registry
// blocks installing Supabase packages. The real package types are used once
// `npm install` can fetch @supabase/ssr and @supabase/supabase-js.
declare module "@supabase/ssr" {
  export type CookieOptions = Record<string, unknown>;

  export function createBrowserClient(
    supabaseUrl: string,
    supabaseKey: string,
  ): unknown;

  export function createServerClient(
    supabaseUrl: string,
    supabaseKey: string,
    options: {
      cookies: {
        getAll(): { name: string; value: string }[];
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: CookieOptions;
          }[],
        ): void;
      };
    },
  ): unknown;
}

declare module "@supabase/supabase-js" {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>,
  ): unknown;
}
