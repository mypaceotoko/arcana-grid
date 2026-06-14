/**
 * Pure view model for `/debug/supabase`. Kept separate from `page.tsx` so the
 * config-status-to-display mapping is unit-testable without rendering React.
 *
 * See docs/SUPABASE_PLAN.md.
 */

import {
  getSupabaseConfigStatus,
  type SupabaseConfigStatus,
} from "@/lib/supabase/config";

export const SUPABASE_ENV_UNCONFIGURED_MESSAGE =
  "Supabase環境変数が未設定です。Vercelまたは.env.localに設定してください。";

export const SUPABASE_SERVICE_ROLE_NOTICE =
  "service role key はサーバー専用です。クライアントへ出してはいけません。";

export type SupabaseDebugStatusRow = {
  label: string;
  value: boolean;
};

export type SupabaseDebugView = {
  status: SupabaseConfigStatus;
  rows: SupabaseDebugStatusRow[];
  /** Set when the public (browser) config is incomplete, otherwise `null`. */
  unconfiguredMessage: string | null;
  serviceRoleNotice: string;
};

/** Builds the `/debug/supabase` view model from the current env config. */
export const getSupabaseDebugView = (): SupabaseDebugView => {
  const status = getSupabaseConfigStatus();

  return {
    status,
    rows: [
      { label: "Supabase public URL configured", value: status.urlConfigured },
      { label: "Supabase anon key configured", value: status.anonKeyConfigured },
      {
        label: "Supabase server/service role configured",
        value: status.serviceRoleKeyConfigured,
      },
      { label: "client config ready", value: status.publicConfigured },
      { label: "server config ready", value: status.serverConfigured },
    ],
    unconfiguredMessage: status.publicConfigured
      ? null
      : SUPABASE_ENV_UNCONFIGURED_MESSAGE,
    serviceRoleNotice: SUPABASE_SERVICE_ROLE_NOTICE,
  };
};
