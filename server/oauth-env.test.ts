import { describe, expect, it } from "vitest";
import { resolveAppUrl, resolveOAuthServerUrl } from "./_core/env";

describe("OAuth server URL resolution", () => {
  it("prefers OAUTH_SERVER_URL and removes trailing slashes", () => {
    expect(resolveOAuthServerUrl({ OAUTH_SERVER_URL: "https://oauth.example.test///" })).toBe("https://oauth.example.test");
  });

  it("uses the Manus API fallback when OAUTH_SERVER_URL is absent", () => {
    expect(resolveOAuthServerUrl({})).toBe("https://api.manus.im");
  });

  it("does not use the public APP_URL as the OAuth provider", () => {
    expect(resolveOAuthServerUrl({ APP_URL: "https://www.tw-escapeindex.com" })).toBe("https://api.manus.im");
  });

  it("resolves the public callback URL from APP_URL before VERCEL_URL", () => {
    expect(resolveAppUrl({ APP_URL: "https://www.tw-escapeindex.com", VERCEL_URL: "preview.vercel.app" })).toBe("https://www.tw-escapeindex.com");
    expect(resolveAppUrl({ VERCEL_URL: "preview.vercel.app" })).toBe("https://preview.vercel.app");
  });
});
