import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requireSupabaseAdminEnv } from "./env";

export const createSupabaseAdminClient = () => {
  const env = requireSupabaseAdminEnv();

  return createClient(env.url, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
