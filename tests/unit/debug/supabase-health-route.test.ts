import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../../src/app/api/debug/supabase/health/route";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

describe("GET /api/debug/supabase/health", () => {
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
    vi.unstubAllGlobals();
  });

  it("returns a safe unconfigured response without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({
      configured: false,
      serverConfigured: false,
      canCreateClient: false,
      canReachSupabase: false,
      errorCode: "SUPABASE_NOT_CONFIGURED",
      safeMessage:
        "Supabase環境変数が未設定です。Vercelまたは.env.localに設定してください。",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports unreachable when configured but Supabase cannot be reached", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error: secret-token-xyz")),
    );

    const response = await GET();
    const body = await response.json();

    expect(body.configured).toBe(true);
    expect(body.serverConfigured).toBe(false);
    expect(body.canReachSupabase).toBe(false);
    expect(body.errorCode).toBe("SUPABASE_UNREACHABLE");

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("anon-key");
    expect(serialized).not.toContain("secret-token-xyz");
  });

  it("reports reachable but client-unavailable when the SDK is not installed", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    const response = await GET();
    const body = await response.json();

    expect(body.configured).toBe(true);
    expect(body.serverConfigured).toBe(true);
    expect(body.canCreateClient).toBe(false);
    expect(body.canReachSupabase).toBe(true);
    expect(body.errorCode).toBe("SUPABASE_CLIENT_UNAVAILABLE");

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("anon-key");
    expect(serialized).not.toContain("service-role-secret");
  });
});
