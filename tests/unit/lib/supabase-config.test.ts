import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getSupabaseConfigStatus,
  getSupabasePublicConfig,
  getSupabaseServiceRoleKey,
  isSupabaseAnonKeyConfigured,
  isSupabaseConfigured,
  isSupabaseServerConfigured,
  isSupabaseServiceRoleKeyConfigured,
  isSupabaseUrlConfigured,
} from "../../../src/lib/supabase/config";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

describe("supabase config helpers", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("treats fully unset env as not configured without throwing", () => {
    expect(getSupabasePublicConfig()).toBeNull();
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseServiceRoleKey()).toBeNull();
    expect(isSupabaseServerConfigured()).toBe(false);
  });

  it("treats empty-string env as not configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("reports the public config once both browser vars are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
    expect(isSupabaseConfigured()).toBe(true);
    // Service role still missing -> server is not fully configured.
    expect(isSupabaseServerConfigured()).toBe(false);
  });

  it("reports server configured only when the service role key is also set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    expect(getSupabaseServiceRoleKey()).toBe("service-role");
    expect(isSupabaseServerConfigured()).toBe(true);
  });

  it("exposes per-variable booleans without throwing when unset", () => {
    expect(isSupabaseUrlConfigured()).toBe(false);
    expect(isSupabaseAnonKeyConfigured()).toBe(false);
    expect(isSupabaseServiceRoleKeyConfigured()).toBe(false);
  });

  it("reports the full config status when fully unset", () => {
    expect(getSupabaseConfigStatus()).toEqual({
      urlConfigured: false,
      anonKeyConfigured: false,
      serviceRoleKeyConfigured: false,
      publicConfigured: false,
      serverConfigured: false,
    });
  });

  it("reports the full config status when fully configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    expect(isSupabaseUrlConfigured()).toBe(true);
    expect(isSupabaseAnonKeyConfigured()).toBe(true);
    expect(isSupabaseServiceRoleKeyConfigured()).toBe(true);
    expect(getSupabaseConfigStatus()).toEqual({
      urlConfigured: true,
      anonKeyConfigured: true,
      serviceRoleKeyConfigured: true,
      publicConfigured: true,
      serverConfigured: true,
    });
  });

  it("never exposes the service role key value through the status summary", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "super-secret-service-role-key";

    const status = getSupabaseConfigStatus();
    expect(JSON.stringify(status)).not.toContain("super-secret-service-role-key");
  });
});
