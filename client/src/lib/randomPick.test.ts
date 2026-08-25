import { describe, expect, it } from "vitest";
import { pageForItem, pickRandom } from "./randomPick";

describe("pickRandom", () => {
  it("returns null for an empty candidate list", () => {
    expect(pickRandom([])).toBeNull();
  });

  it("selects the item at the random index", () => {
    expect(pickRandom(["A", "B", "C", "D"], () => 0.5)).toBe("C");
  });

  it("keeps an edge random value within the list", () => {
    expect(pickRandom(["first", "last"], () => 1)).toBe("last");
  });

  it("calculates the target page for an item and rejects missing values", () => {
    const topics = ["A", "B", "C", "D", "E"];
    expect(pageForItem(topics, "D", 2)).toBe(2);
    expect(pageForItem(topics, "missing", 2)).toBeNull();
  });
});
