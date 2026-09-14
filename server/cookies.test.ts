import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";

function request(host: string, protocol = "https") {
  return { hostname: host, protocol, headers: { host, "x-forwarded-proto": protocol } } as never;
}

describe("session cookie options", () => {
  it("shares the cookie across the production root and www host", () => {
    expect(getSessionCookieOptions(request("www.tw-escapeindex.com"))).toMatchObject({
      domain: ".tw-escapeindex.com",
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: true,
    });
    expect(getSessionCookieOptions(request("tw-escapeindex.com"))).toMatchObject({ domain: ".tw-escapeindex.com" });
  });

  it("does not set a production domain on local or preview hosts", () => {
    expect(getSessionCookieOptions(request("localhost", "http")).domain).toBeUndefined();
    expect(getSessionCookieOptions(request("tw-escapeindex.vercel.app")).domain).toBeUndefined();
  });
});
