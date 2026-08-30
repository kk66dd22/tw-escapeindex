// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const originalRandom = Math.random;

function setupLayoutPrimitives() {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
    window.setTimeout(() => callback(performance.now()), 0) as unknown as number,
  );
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => window.clearTimeout(id));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    x: 0,
    y: 0,
    width: 360,
    height: 640,
    top: 20,
    right: 360,
    bottom: 660,
    left: 0,
    toJSON: () => ({}),
  }));
}

async function drawAndOpenResult() {
  fireEvent.click(screen.getByRole("button", { name: /今天玩什麼/ }));
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "查看主題" })).toBeTruthy());
  return dialog;
}

function highlightedArticleFor(title: string) {
  const heading = screen.getAllByRole("heading", { name: title }).find((node) => node.closest("article"));
  return heading?.closest("article") ?? null;
}

describe("Home blind-draw topic jump", () => {
  beforeEach(() => {
    setupLayoutPrimitives();
    Math.random = originalRandom;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Math.random = originalRandom;
  });

  it("closes the Dialog and highlights the matching card for a same-page jump", async () => {
    Math.random = () => 0;
    render(<Home />);

    const dialog = await drawAndOpenResult();
    const resultTitle = within(dialog).getByRole("heading", { level: 3 }).textContent ?? "";
    fireEvent.click(within(dialog).getByRole("button", { name: "查看主題" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => {
      const target = highlightedArticleFor(resultTitle);
      expect(target).not.toBeNull();
      expect(target?.className).toContain("ring-2");
      expect(target?.getAttribute("data-jump-ref")).toBe("mounted");
      expect(screen.getByRole("button", { name: "1" }).getAttribute("aria-current")).toBe("page");
    });
  });

  it("waits for the target page and highlights the matching card for a cross-page jump", async () => {
    Math.random = () => 0.999;
    render(<Home />);

    const dialog = await drawAndOpenResult();
    const resultTitle = within(dialog).getByRole("heading", { level: 3 }).textContent ?? "";
    fireEvent.click(within(dialog).getByRole("button", { name: "查看主題" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => {
      const target = highlightedArticleFor(resultTitle);
      expect(target).not.toBeNull();
      expect(target?.className).toContain("ring-2");
      expect(target?.getAttribute("data-jump-ref")).toBe("mounted");
      expect(screen.getByRole("button", { name: "12" }).getAttribute("aria-current")).toBe("page");
    });
  });
});


describe("Home booking CTA layout", () => {
  beforeEach(() => {
    setupLayoutPrimitives();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the Adventurer Guild CTA on exactly the three Taichung topic cards", async () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText("搜尋主題"), { target: { value: "神不在場實境遊戲｜台中旗艦館" } });
    const links = await waitFor(() => screen.getAllByRole("link", { name: /預約冒險者公會聚餐/ }));
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("https://linkgo.one/s/3xwIG");
      expect(link.parentElement?.className).toContain("grid-cols-1");
      expect(link.parentElement?.className).toContain("sm:grid-cols-2");
    }
  });
});
