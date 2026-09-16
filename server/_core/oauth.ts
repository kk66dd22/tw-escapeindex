import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ENV } from "./env";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

const GOOGLE_STATE_COOKIE = "google_oauth_state";
const GOOGLE_ALLOWED_ORIGINS = new Set(["https://www.tw-escapeindex.com", "http://localhost:3000"]);

function isAllowedGoogleOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.pathname !== "/" || url.search || url.hash) return false;
    if (GOOGLE_ALLOWED_ORIGINS.has(value)) return true;
    return url.protocol === "https:" && url.origin === "https://www.tw-escapeindex.com";
  } catch {
    return false;
  }
}

function encodeGoogleState(payload: { nonce: string; returnTo: string }) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeGoogleState(value: string): { nonce: string; returnTo: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<{ nonce: string; returnTo: string }>;
    if (!parsed.nonce || !parsed.returnTo || !isAllowedGoogleOrigin(parsed.returnTo)) return null;
    return { nonce: parsed.nonce, returnTo: parsed.returnTo };
  } catch {
    return null;
  }
}

function googleRedirectUri(origin: string) {
  return `${origin}/api/google/callback`;
}

function normalizeGoogleAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function describeOAuthError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { value: String(error) };
}

function maskEmail(email: string | undefined) {
  if (!email) return undefined;
  const [name, domain] = email.split("@");
  return `${name?.slice(0, 2) ?? ""}***@${domain ?? ""}`;
}

function logCookieOptions(req: Request) {
  const options = getSessionCookieOptions(req);
  return {
    secure: options.secure,
    sameSite: options.sameSite,
    httpOnly: options.httpOnly,
    path: options.path,
    domain: options.domain ?? "<host-only>",
    host: typeof req.get === "function" ? req.get("host") ?? "<unknown>" : req.headers.host ?? "<unknown>",
  };
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/google/login", (req: Request, res: Response) => {
    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      res.status(503).json({ error: "Google OAuth is not configured" });
      return;
    }

    const requestedReturnTo = getQueryParam(req, "returnTo");
    const returnTo = requestedReturnTo || ENV.appUrl;
    if (!returnTo || !isAllowedGoogleOrigin(returnTo)) {
      res.status(400).json({ error: "Invalid Google OAuth return URL" });
      return;
    }

    const nonce = randomUUID();
    const redirectUri = googleRedirectUri(returnTo);
    const state = encodeGoogleState({ nonce, returnTo });
    res.cookie(GOOGLE_STATE_COOKIE, nonce, {
      ...getSessionCookieOptions(req),
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });

    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.searchParams.set("client_id", ENV.googleClientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email profile");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("prompt", "select_account");
    res.redirect(302, authorizationUrl.toString());
  });

  app.get("/api/google/callback", async (req: Request, res: Response) => {
    let stage = "callback:received";
    const code = getQueryParam(req, "code");
    const stateValue = getQueryParam(req, "state");
    const state = stateValue ? decodeGoogleState(stateValue) : null;
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[GOOGLE_STATE_COOKIE];

    console.log("[Google OAuth] Callback received", {
      host: typeof req.get === "function" ? req.get("host") : req.headers.host,
      protocol: req.protocol,
      hasCode: Boolean(code),
      hasState: Boolean(stateValue),
      hasStateCookie: Boolean(expectedNonce),
      cookie: logCookieOptions(req),
    });

    if (!code || !state || !expectedNonce || state.nonce !== expectedNonce) {
      console.error("[Google OAuth] State validation failed", {
        hasCode: Boolean(code),
        hasState: Boolean(state),
        hasStateCookie: Boolean(expectedNonce),
        nonceMatches: Boolean(state && expectedNonce && state.nonce === expectedNonce),
      });
      res.status(403).json({ error: "invalid Google OAuth state" });
      return;
    }
    stage = "state:validated";
    res.clearCookie(GOOGLE_STATE_COOKIE, { ...getSessionCookieOptions(req), sameSite: "lax" });
    console.log("[Google OAuth] State validated and state cookie cleared");

    try {
      stage = "token:exchange";
      const redirectUri = googleRedirectUri(state.returnTo);
      console.log("[Google OAuth] Exchanging authorization code", { redirectUri });
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      console.log("[Google OAuth] Token exchange response", { status: tokenResponse.status, ok: tokenResponse.ok });
      if (!tokenResponse.ok) throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
      const tokenPayload = await tokenResponse.json() as { access_token?: string };
      console.log("[Google OAuth] Token payload received", { hasAccessToken: Boolean(tokenPayload.access_token) });
      if (!tokenPayload.access_token) throw new Error("Google access token missing");

      stage = "profile:lookup";
      console.log("[Google OAuth] Fetching Google user profile");
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${tokenPayload.access_token}` },
      });
      console.log("[Google OAuth] Userinfo response", { status: profileResponse.status, ok: profileResponse.ok });
      if (!profileResponse.ok) throw new Error(`Google userinfo failed: ${profileResponse.status}`);
      const profile = await profileResponse.json() as { sub?: string; email?: string; name?: string; picture?: string };
      console.log("[Google OAuth] Profile received", {
        hasSubject: Boolean(profile.sub),
        email: maskEmail(profile.email),
        hasName: Boolean(profile.name),
      });
      if (!profile.sub || !profile.email) throw new Error("Google profile is missing required fields");

      const openId = `google:${profile.sub}`;
      stage = "user:upsert";
      console.log("[Google OAuth] Upserting user", { openIdPrefix: `${openId.slice(0, 15)}...` });
      await db.upsertUser({
        openId,
        name: profile.name || profile.email.split("@")[0],
        email: profile.email,
        avatarUrl: normalizeGoogleAvatarUrl(profile.picture),
        loginMethod: "google",
        lastSignedIn: new Date(),
      });
      console.log("[Google OAuth] User upsert complete");
      stage = "session:create";
      console.log("[Google OAuth] Creating session token");
      const sessionToken = await sdk.createSessionToken(openId, {
        name: profile.name || profile.email,
        expiresInMs: ONE_YEAR_MS,
      });
      console.log("[Google OAuth] Session token created", { length: sessionToken.length });
      stage = "cookie:set";
      console.log("[Google OAuth] Setting session cookie", { cookie: logCookieOptions(req) });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      console.log("[Google OAuth] Session cookie set; redirecting", { returnTo: state.returnTo });
      res.redirect(302, `${state.returnTo}/`);
    } catch (error) {
      console.error("[Google OAuth] Callback failed", { stage, ...describeOAuthError(error) });
      res.status(502).json({ error: "Google OAuth callback failed" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { ...getSessionCookieOptions(req) });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, `${ENV.appUrl}/`);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
