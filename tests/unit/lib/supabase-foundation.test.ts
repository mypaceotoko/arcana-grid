import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260612000000_task_8a_supabase_foundation.sql",
  "utf8",
);
const seed = readFileSync("supabase/seed.sql", "utf8");
const browserClient = readFileSync("src/lib/supabase/client.ts", "utf8");
const serverClient = readFileSync("src/lib/supabase/server.ts", "utf8");
const adminClient = readFileSync("src/lib/supabase/admin.ts", "utf8");

describe("Supabase foundation files", () => {
  it("enables RLS and creates policies for every Task 8A table", () => {
    const tables = [
      "profiles",
      "characters",
      "card_variants",
      "user_cards",
      "game_rule_sets",
    ];

    tables.forEach((table) => {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
      expect(migration).toMatch(new RegExp(`create policy[\\s\\S]+on public\\.${table}`));
    });

    expect(migration).toContain("for select\nto authenticated\nusing (is_active)");
    expect(migration).toContain("using (user_id = auth.uid())");
    const policyStatements = migration
      .split(";")
      .filter((statement) => statement.includes("create policy"));
    expect(
      policyStatements.some(
        (statement) =>
          statement.includes("on public.user_cards") &&
          statement.includes("for insert") &&
          statement.includes("to authenticated"),
      ),
    ).toBe(false);
  });

  it("creates a security-definer Auth profile trigger with a fixed search_path", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("after insert on auth.users");
    expect(migration).toContain("execute function public.handle_new_auth_user_profile()");
  });

  it("keeps service-role access in the server-only admin client", () => {
    expect(browserClient).toContain('"use client"');
    expect(browserClient).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(browserClient).not.toContain("createSupabaseAdminClient");
    expect(serverClient).toContain('import "server-only";');
    expect(adminClient).toContain('import "server-only";');
    expect(adminClient).toContain("requireSupabaseAdminEnv");
  });

  it("seeds tactical_duel.v1 with values aligned to the TypeScript rule config", () => {
    expect(seed).toContain("'tactical_duel'");
    expect(seed).toContain("'tactical_duel.v1'");
    expect(seed).toContain('"boardWidth": 8');
    expect(seed).toContain('"boardHeight": 8');
    expect(seed).toContain('"initialUnitCount": 6');
    expect(seed).toContain('"reserveUnitCount": 2');
    expect(seed).toContain('"flagMaxDamage": 3');
  });
});
