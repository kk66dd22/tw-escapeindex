import { describe, expect, it, vi } from "vitest";

vi.mock("./_core/map", () => ({
  makeRequest: vi.fn(async (endpoint: string, params: Record<string, unknown> = {}) => {
    if (endpoint.includes("textsearch")) {
      return {
        status: "OK",
        results: [
          { place_id: "high", name: "高評價密室", formatted_address: "台北市", rating: 4.8, user_ratings_total: 120, types: [] },
          { place_id: "low", name: "低評價密室", formatted_address: "台北市", rating: 4.4, user_ratings_total: 900, types: [] },
        ],
      };
    }
    const low = params.place_id === "low";
    return { status: "OK", result: { place_id: low ? "low" : "high", name: low ? "低評價密室" : "高評價密室", formatted_address: "台北市", rating: low ? 4.4 : 4.8, user_ratings_total: low ? 900 : 120, website: "https://example.com" } };
  }),
}));

describe("searchEscapeVenues", () => {
  it("keeps only places at or above the proxy rating threshold", async () => {
    const { searchEscapeVenues } = await import("./places");
    const result = await searchEscapeVenues("台北");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ placeId: "high", rating: 4.8, reviewCount: 120, source: "google_places_proxy" });
    expect(result[0]?.checkedAt).toEqual(expect.any(String));
  });
});
