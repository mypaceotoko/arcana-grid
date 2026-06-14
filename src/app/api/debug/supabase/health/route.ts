import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getSupabaseConfigStatus,
  getSupabasePublicConfig,
} from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const isDebugApiEnabled = (): boolean =>
  process.env.NODE_ENV !== "production" || process.env.ENABLE_DEBUG_PAGES === "true";

const HEALTH_CHECK_TIMEOUT_MS = 3000;

export type SupabaseHealthErrorCode =
  | "SUPABASE_NOT_CONFIGURED"
  | "SUPABASE_UNREACHABLE"
  | "SUPABASE_CLIENT_UNAVAILABLE";

export type SupabaseHealthResponse = {
  configured: boolean;
  serverConfigured: boolean;
  canCreateClient: boolean;
  canReachSupabase: boolean;
  errorCode: SupabaseHealthErrorCode | null;
  safeMessage: string;
};

const SAFE_MESSAGES: Record<SupabaseHealthErrorCode | "OK", string> = {
  SUPABASE_NOT_CONFIGURED:
    "Supabase環境変数が未設定です。Vercelまたは.env.localに設定してください。",
  SUPABASE_UNREACHABLE:
    "Supabaseへ接続できませんでした。URLやネットワーク設定を確認してください。",
  SUPABASE_CLIENT_UNAVAILABLE:
    "Supabaseクライアントを作成できませんでした。@supabase/supabase-jsの導入状況を確認してください。",
  OK: "Supabaseへ接続できました。",
};

/**
 * Debug-only health check. Never returns the anon key, the service role key,
 * or raw error details — only env-presence booleans and a fixed safe message.
 */
export async function GET() {
  if (!isDebugApiEnabled()) notFound();

  const status = getSupabaseConfigStatus();
  const publicConfig = getSupabasePublicConfig();

  if (publicConfig === null) {
    const body: SupabaseHealthResponse = {
      configured: false,
      serverConfigured: false,
      canCreateClient: false,
      canReachSupabase: false,
      errorCode: "SUPABASE_NOT_CONFIGURED",
      safeMessage: SAFE_MESSAGES.SUPABASE_NOT_CONFIGURED,
    };
    return NextResponse.json(body);
  }

  let canCreateClient = false;
  try {
    if (status.serverConfigured) {
      await createSupabaseServiceRoleClient();
    } else {
      await createSupabaseBrowserClient();
    }
    canCreateClient = true;
  } catch {
    canCreateClient = false;
  }

  let canReachSupabase = false;
  try {
    const response = await fetch(`${publicConfig.url}/auth/v1/health`, {
      headers: { apikey: publicConfig.anonKey },
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });
    // Any HTTP response (even 4xx) means the host is reachable.
    canReachSupabase = response.status < 500;
  } catch {
    canReachSupabase = false;
  }

  let errorCode: SupabaseHealthErrorCode | null = null;
  if (!canReachSupabase) {
    errorCode = "SUPABASE_UNREACHABLE";
  } else if (!canCreateClient) {
    errorCode = "SUPABASE_CLIENT_UNAVAILABLE";
  }

  const body: SupabaseHealthResponse = {
    configured: true,
    serverConfigured: status.serverConfigured,
    canCreateClient,
    canReachSupabase,
    errorCode,
    safeMessage: errorCode ? SAFE_MESSAGES[errorCode] : SAFE_MESSAGES.OK,
  };
  return NextResponse.json(body);
}
