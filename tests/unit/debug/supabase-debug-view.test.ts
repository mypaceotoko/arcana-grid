import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SUPABASE_ENV_UNCONFIGURED_MESSAGE,
  getSupabaseDebugView,
} from "../../../src/app/debug/supabase/view";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

describe("getSupabaseDebugView", () => {
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

  it("renders all rows as not-configured and shows the unconfigured message", () => {
    const view = getSupabaseDebugView();

    expect(view.rows).toEqual([
      { label: "Supabase public URL configured", value: false },
      { label: "Supabase anon key configured", value: false },
      { label: "Supabase server/service role configured", value: false },
      { label: "client config ready", value: false },
      { label: "server config ready", value: false },
    ]);
    expect(view.unconfiguredMessage).toBe(SUPABASE_ENV_UNCONFIGURED_MESSAGE);
    expect(view.serviceRoleNotice.length).toBeGreaterThan(0);
  });

  it("clears the unconfigured message once the public config is set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const view = getSupabaseDebugView();

    expect(view.unconfiguredMessage).toBeNull();
    expect(view.rows).toEqual([
      { label: "Supabase public URL configured", value: true },
      { label: "Supabase anon key configured", value: true },
      { label: "Supabase server/service role configured", value: false },
      { label: "client config ready", value: true },
      { label: "server config ready", value: false },
    ]);
  });

  it("marks server config ready once the service role key is also set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    const view = getSupabaseDebugView();

    expect(view.status.serverConfigured).toBe(true);
    expect(view.rows.find((row) => row.label === "server config ready")?.value).toBe(
      true,
    );
  });

  it("never includes the service role key value in the view", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "super-secret-service-role-key";

    const view = getSupabaseDebugView();
    expect(JSON.stringify(view)).not.toContain("super-secret-service-role-key");
  });
});
