import { afterEach, describe, expect, it } from "vitest";

import {
  getSupabaseAdminEnvStatus,
  getSupabasePublicEnvStatus,
  requireSupabaseAdminEnv,
  requireSupabasePublicEnv,
} from "@/lib/supabase";

const ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const originalEnv = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
) as Record<(typeof ENV_NAMES)[number], string | undefined>;

const clearSupabaseEnv = () => {
  ENV_NAMES.forEach((name) => {
    delete process.env[name];
  });
};

afterEach(() => {
  ENV_NAMES.forEach((name) => {
    const value = originalEnv[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  });
});

describe("Supabase environment validation", () => {
  it("reports missing public environment without throwing during status checks", () => {
    clearSupabaseEnv();

    expect(getSupabasePublicEnvStatus()).toEqual({
      configured: false,
      missing: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    });
  });

  it("throws a clear error only when the public client environment is required", () => {
    clearSupabaseEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

    expect(() => requireSupabasePublicEnv()).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY.*\.env\.example/,
    );
  });

  it("separates admin-only service role validation from public validation", () => {
    clearSupabaseEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    expect(requireSupabasePublicEnv()).toEqual({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
    expect(getSupabaseAdminEnvStatus()).toEqual({
      configured: false,
      missing: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    expect(() => requireSupabaseAdminEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
