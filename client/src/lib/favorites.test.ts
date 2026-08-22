import { describe, expect, it } from "vitest";
import { parseFavoriteIds, serializeFavoriteIds, toggleFavoriteId } from "./favorites";

describe("favorites storage helpers", () => {
  it("parses valid string ids and ignores malformed data", () => {
    expect([...parseFavoriteIds('["popular-002",7,"popular-001"]')]).toEqual(["popular-002", "popular-001"]);
    expect([...parseFavoriteIds("not-json")]).toEqual([]);
  });

  it("toggles ids without mutating the original set", () => {
    const original = new Set(["popular-001"]);
    const added = toggleFavoriteId(original, "popular-002");
    const removed = toggleFavoriteId(added, "popular-001");
    expect([...original]).toEqual(["popular-001"]);
    expect([...added]).toEqual(["popular-001", "popular-002"]);
    expect([...removed]).toEqual(["popular-002"]);
  });

  it("serializes ids in stable order", () => {
    expect(serializeFavoriteIds(new Set(["b", "a"]))).toBe('["a","b"]');
  });
});
