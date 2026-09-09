import { describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";

const upsertUser = vi.hoisted(() => vi.fn());
const createSessionToken = vi.hoisted(() => vi.fn().mockResolvedValue("google-session-token"));

vi.mock("./db", () => ({ upsertUser }));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken } }));

import { registerOAuthRoutes } from "./_core/oauth";

function makeApp() {
  const routes = new Map<string, (req: any, res: any) => unknown>();
  return { routes, get: (path: string, handler: (req: any, res: any) => unknown) => routes.set(path, handler) };
}

function makeResponse() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, unknown>,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  };
}

describe("Google OAuth routes", () => {
  it("rejects untrusted return URLs", () => {
    const app = makeApp();
    registerOAuthRoutes(app as any);
    const res = makeResponse();
    app.routes.get("/api/google/login")?.({ query: { returnTo: "https://evil.example" }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid Google OAuth return URL" });
  });

  it("creates a Google authorization redirect with a nonce cookie", () => {
    const app = makeApp();
    registerOAuthRoutes(app as any);
    const res = makeResponse();
    app.routes.get("/api/google/login")?.({ query: { returnTo: "https://taipeiesc-97ma7evx.manus.space" }, headers: {}, protocol: "https" }, res);
    expect(res.cookie).toHaveBeenCalledWith("google_oauth_state", expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
    const location = res.redirect.mock.calls[0][1] as string;
    expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location).toContain("client_id=");
    expect(location).toContain("scope=openid+email+profile");
  });

  it("accepts the production website as a Google OAuth return URL", () => {
    const app = makeApp();
    registerOAuthRoutes(app as any);
    const res = makeResponse();
    app.routes.get("/api/google/login")?.({ query: { returnTo: "https://www.tw-escapeindex.com" }, headers: {}, protocol: "https" }, res);
    expect(res.statusCode).toBe(200);
    expect(res.redirect).toHaveBeenCalledWith(302, expect.stringContaining("redirect_uri=https%3A%2F%2Fwww.tw-escapeindex.com%2Fapi%2Fgoogle%2Fcallback"));
  });

  it("fails closed when the callback nonce does not match", async () => {
    const app = makeApp();
    registerOAuthRoutes(app as any);
    const res = makeResponse();
    await app.routes.get("/api/google/callback")?.({ query: { code: "code", state: "invalid" }, headers: { cookie: "google_oauth_state=other" } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "invalid Google OAuth state" });
  });

  it("exchanges a valid callback and creates the application session", async () => {
    const app = makeApp();
    registerOAuthRoutes(app as any);
    const loginResponse = makeResponse();
    app.routes.get("/api/google/login")?.({ query: { returnTo: "https://taipeiesc-97ma7evx.manus.space" }, headers: {}, protocol: "https" }, loginResponse);
    const authorizationUrl = new URL(loginResponse.redirect.mock.calls[0][1]);
    const nonce = loginResponse.cookie.mock.calls[0][1];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "access-token" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sub: "google-sub", email: "player@gmail.com", name: "Google 玩家", picture: "https://lh3.googleusercontent.com/avatar" }) });
    vi.stubGlobal("fetch", fetchMock);

    const res = makeResponse();
    await app.routes.get("/api/google/callback")?.({
      query: { code: "real-code", state: authorizationUrl.searchParams.get("state") },
      headers: { cookie: `google_oauth_state=${nonce}` },
      protocol: "https",
    }, res);

    expect(upsertUser).toHaveBeenCalledWith(expect.objectContaining({ openId: "google:google-sub", email: "player@gmail.com", avatarUrl: "https://lh3.googleusercontent.com/avatar", loginMethod: "google" }));
    expect(createSessionToken).toHaveBeenCalledWith("google:google-sub", expect.objectContaining({ name: "Google 玩家" }));
    expect(res.cookie).toHaveBeenCalledWith(COOKIE_NAME, "google-session-token", expect.any(Object));
    expect(res.redirect).toHaveBeenCalledWith(302, "https://taipeiesc-97ma7evx.manus.space/");
    vi.unstubAllGlobals();
  });
});
