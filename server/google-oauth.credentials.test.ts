import { describe, expect, it } from "vitest";

describe("Google OAuth credentials", () => {
  it("are accepted by Google's token endpoint", async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(clientSecret).toBeTruthy();

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "invalid-test-code",
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
      }),
    });
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).not.toBe("invalid_client");
  }, 15_000);
});
