// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, loading: false, error: null, logout: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ comments: { list: { invalidate: vi.fn() } } }),
    comments: {
      list: { useQuery: () => ({ data: [], isLoading: false, isError: false }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }) },
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

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
      expect(screen.getByRole("button", { name: "13" }).getAttribute("aria-current")).toBe("page");
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

  it("filters newly added Taoyuan and Yilan topics by city", async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "桃園" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "《荒村小學》" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "《LINA》" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "宜蘭" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "《LINA》" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "《聖劍騎士》" })).toBeTruthy();
    });
    expect(screen.queryByRole("heading", { name: "《荒村小學》" })).toBeNull();
  });

  it("keeps Taoyuan and Yilan controls usable in the mobile filter rail", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(<Home />);

    const taoyuanButton = screen.getByRole("button", { name: "桃園" });
    const yilanButton = screen.getByRole("button", { name: "宜蘭" });
    expect(taoyuanButton.parentElement?.parentElement?.className).toContain("overflow-x-auto");
    expect(yilanButton).toBeTruthy();

    fireEvent.click(yilanButton);
    await waitFor(() => expect(screen.getByRole("heading", { name: "《LINA》" })).toBeTruthy());
  });

  it("shows anonymous comment forms instead of pre-seeded comments for visitors", () => {
    render(<Home />);
    expect(screen.getAllByPlaceholderText("分享你的實際遊玩體驗⋯（可匿名，不需登入）").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Google 帳號登入" })).toBeTruthy();
    expect(screen.queryByText("使用者輸入內容")).toBeNull();
  });
});
