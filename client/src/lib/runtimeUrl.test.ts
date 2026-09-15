import { describe, expect, it } from "vitest";
import { getSameOriginTrpcUrl } from "./runtimeUrl";

describe("getSameOriginTrpcUrl", () => {
  it("uses the active custom origin", () => {
    expect(getSameOriginTrpcUrl({ origin: "https://www.tw-escapeindex.com" })).toBe("https://www.tw-escapeindex.com/api/trpc");
  });

  it("does not point to a Vercel deployment origin", () => {
    const url = getSameOriginTrpcUrl({ origin: "https://www.tw-escapeindex.com" });
    expect(url).not.toContain("vercel.app");
  });
});
