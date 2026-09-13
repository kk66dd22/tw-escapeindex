import { describe, expect, it } from "vitest";
import { resolveOAuthServerUrl } from "./_core/env";

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
});
