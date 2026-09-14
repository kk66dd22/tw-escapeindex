import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";

function request(host: string, protocol = "https") {
  return { hostname: host, protocol, headers: { host, "x-forwarded-proto": protocol } } as never;
}

describe("session cookie options", () => {
  it("uses a host-only cookie on the production host", () => {
    expect(getSessionCookieOptions(request("www.tw-escapeindex.com"))).toMatchObject({
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: true,
    });
    expect(getSessionCookieOptions(request("www.tw-escapeindex.com")).domain).toBeUndefined();
  });

  it("does not set a production domain on local or preview hosts", () => {
    expect(getSessionCookieOptions(request("localhost", "http")).domain).toBeUndefined();
    expect(getSessionCookieOptions(request("tw-escapeindex.vercel.app")).domain).toBeUndefined();
  });
});
