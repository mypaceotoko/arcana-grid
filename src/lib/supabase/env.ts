export type SupabasePublicEnv = {
  url: string;
  anonKey: string;
};

export type SupabaseAdminEnv = SupabasePublicEnv & {
  serviceRoleKey: string;
};

type SupabaseEnvName =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY";

const PUBLIC_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const satisfies readonly SupabaseEnvName[];

const ADMIN_ENV_NAMES = [
  ...PUBLIC_ENV_NAMES,
  "SUPABASE_SERVICE_ROLE_KEY",
] as const satisfies readonly SupabaseEnvName[];

const readEnvValue = (name: SupabaseEnvName): string | undefined => {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return value;
};

const getMissingEnvNames = (
  names: readonly SupabaseEnvName[],
): readonly SupabaseEnvName[] => names.filter((name) => readEnvValue(name) === undefined);

const formatMissingEnvMessage = (
  names: readonly SupabaseEnvName[],
  clientName: string,
): string =>
  `${clientName} requires missing environment variable${names.length === 1 ? "" : "s"}: ${names.join(
    ", ",
  )}. Copy .env.example to .env.local and set these values after creating a Supabase project.`;

export const getSupabasePublicEnvStatus = () => ({
  configured: getMissingEnvNames(PUBLIC_ENV_NAMES).length === 0,
  missing: getMissingEnvNames(PUBLIC_ENV_NAMES),
});

export const getSupabaseAdminEnvStatus = () => ({
  configured: getMissingEnvNames(ADMIN_ENV_NAMES).length === 0,
  missing: getMissingEnvNames(ADMIN_ENV_NAMES),
});

export const requireSupabasePublicEnv = (): SupabasePublicEnv => {
  const missing = getMissingEnvNames(PUBLIC_ENV_NAMES);

  if (missing.length > 0) {
    throw new Error(formatMissingEnvMessage(missing, "Supabase public client"));
  }

  return {
    url: readEnvValue("NEXT_PUBLIC_SUPABASE_URL") as string,
    anonKey: readEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY") as string,
  };
};

export const requireSupabaseAdminEnv = (): SupabaseAdminEnv => {
  const missing = getMissingEnvNames(ADMIN_ENV_NAMES);

  if (missing.length > 0) {
    throw new Error(formatMissingEnvMessage(missing, "Supabase admin client"));
  }

  return {
    ...requireSupabasePublicEnv(),
    serviceRoleKey: readEnvValue("SUPABASE_SERVICE_ROLE_KEY") as string,
  };
};
