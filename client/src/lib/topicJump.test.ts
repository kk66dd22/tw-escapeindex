import { describe, expect, it } from "vitest";
import { isTopicJumpReady, isTopicJumpSuccessful, needsTopicPageChange, prepareTopicJump } from "./topicJump";

describe("topic jump preparation", () => {
  it("prepares a same-page jump without requiring a page switch", () => {
    const request = prepareTopicJump({ topicId: "alien", targetPage: 1 });

    expect(request).toEqual({ topicId: "alien", targetPage: 1, attempts: 0 });
    expect(needsTopicPageChange(1, request.targetPage)).toBe(false);
  });

  it("prepares a cross-page jump that requires switching pages", () => {
    const request = prepareTopicJump({ topicId: "many-doors", targetPage: 10 });

    expect(request).toEqual({ topicId: "many-doors", targetPage: 10, attempts: 0 });
    expect(needsTopicPageChange(1, request.targetPage)).toBe(true);
  });

  it("waits for Dialog closure and the callback ref before a same-page jump is ready", () => {
    const request = prepareTopicJump({ topicId: "alien", targetPage: 1 });

    expect(isTopicJumpReady({ dialogOpen: true, currentPage: 1, request, targetAttached: true })).toBe(false);
    expect(isTopicJumpReady({ dialogOpen: false, currentPage: 1, request, targetAttached: false })).toBe(false);
    expect(isTopicJumpReady({ dialogOpen: false, currentPage: 1, request, targetAttached: true })).toBe(true);
  });

  it("waits for the target page and callback ref before a cross-page jump is ready", () => {
    const request = prepareTopicJump({ topicId: "many-doors", targetPage: 10 });

    expect(isTopicJumpReady({ dialogOpen: false, currentPage: 1, request, targetAttached: true })).toBe(false);
    expect(isTopicJumpReady({ dialogOpen: false, currentPage: 10, request, targetAttached: false })).toBe(false);
    expect(isTopicJumpReady({ dialogOpen: false, currentPage: 10, request, targetAttached: true })).toBe(true);
  });

  it("accepts only a visible card whose page and title match the blind-draw result", () => {
    expect(isTopicJumpSuccessful({
      currentPage: 10,
      targetPage: 10,
      resultTitle: "《許多門主題選集》",
      targetTitle: "《許多門主題選集》",
      targetTop: 106,
      targetBottom: 768,
      viewportHeight: 900,
    })).toBe(true);
    expect(isTopicJumpSuccessful({
      currentPage: 1,
      targetPage: 10,
      resultTitle: "《許多門主題選集》",
      targetTitle: "《許多門主題選集》",
      targetTop: 106,
      targetBottom: 768,
      viewportHeight: 900,
    })).toBe(false);
  });
});
