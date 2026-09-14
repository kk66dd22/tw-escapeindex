const DEFAULT_OAUTH_SERVER_URL = "https://api.manus.im";

function normalizeBaseUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") || "";
}

/**
 * OAUTH_SERVER_URL is the Manus OAuth service, not the public website URL.
 * APP_URL/VITE_APP_URL must not be used here because token exchange would
 * otherwise be sent to our own website instead of the OAuth provider.
 */
export function resolveOAuthServerUrl(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeBaseUrl(
    env.OAUTH_SERVER_URL || env.MANUS_OAUTH_SERVER_URL || env.BUILT_IN_FORGE_API_URL,
  ) || DEFAULT_OAUTH_SERVER_URL;
}

export function resolveAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === "production" || env.VERCEL === "1") {
    return "https://www.tw-escapeindex.com";
  }
  const configured = normalizeBaseUrl(env.APP_URL || env.PUBLIC_APP_URL || env.VITE_APP_URL);
  if (configured) return configured;
  const vercelUrl = normalizeBaseUrl(env.VERCEL_URL);
  if (vercelUrl) return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  return "https://www.tw-escapeindex.com";
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: resolveOAuthServerUrl(),
  appUrl: resolveAppUrl(),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
};
