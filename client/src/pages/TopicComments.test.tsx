// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopicComments } from "./Home";

const state = vi.hoisted(() => ({
  auth: { user: null as { id: number } | null, isAuthenticated: false, loading: false },
  query: { data: [] as Array<{ id: number; userId: number | null; body: string; authorName: string; anonymousToken?: string | null; avatarId?: string | null; avatarUrl?: string | null; clearStatus?: "none" | "success" | "failed"; hasSpoiler?: boolean; canDelete?: boolean; createdAt: Date }>, isLoading: false, isError: false },
  createMutation: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  deleteMutation: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  updateMutation: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  queryInput: null as { topicId: string } | null,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => state.auth,
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  AvatarImage: (props: any) => <img {...props} />,
  AvatarFallback: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ comments: { list: { invalidate: vi.fn() } } }),
    comments: {
      list: { useQuery: (input: { topicId: string }) => { state.queryInput = input; return state.query; } },
      create: { useMutation: () => state.createMutation },
      delete: { useMutation: () => state.deleteMutation },
      update: { useMutation: () => state.updateMutation },
    },
  },
}));

function resetState() {
  state.auth = { user: null, isAuthenticated: false, loading: false };
  state.query = { data: [], isLoading: false, isError: false };
  state.createMutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  state.deleteMutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  state.updateMutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  state.queryInput = null;
}

describe("TopicComments", () => {
  beforeEach(() => {
    resetState();
    window.localStorage.setItem("escape-index-anonymous-token", "11111111-1111-4111-8111-111111111111");
    window.localStorage.setItem("escape-index-anonymous-name", "測試探險家");
    window.localStorage.removeItem("escape-index-helpful-comments");
    window.localStorage.removeItem("escape-index-comment-last-submitted");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders an empty state and anonymous form for visitors", () => {
    render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByText("目前還沒有評論，歡迎成為第一位分享體驗的探索者。")).toBeTruthy();
    expect(screen.getByPlaceholderText("分享你的實際遊玩體驗⋯（訪客即可留言）")).toBeTruthy();
    expect(screen.queryByLabelText("留言暱稱")).toBeNull();
    expect(screen.getByRole("button", { name: "發表評論" })).toBeTruthy();
    expect(state.queryInput).toEqual({ topicId: "popular-101" });
  });

  it("submits an anonymous comment without requiring authentication", () => {
    render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    fireEvent.change(screen.getByLabelText("分享你對《冥婚》的體驗"), { target: { value: "訪客的實際遊玩體驗" } });
    fireEvent.click(screen.getByRole("button", { name: "發表評論" }));
    expect(state.createMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ topicId: "popular-101", body: "訪客的實際遊玩體驗", authorName: expect.any(String), anonymousToken: expect.any(String) }));
  });

  it("renders loading and error states", () => {
    state.query = { data: [], isLoading: true, isError: false };
    const { rerender } = render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByText("正在載入評論⋯")).toBeTruthy();

    state.query = { data: [], isLoading: false, isError: true };
    rerender(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByText("評論暫時無法載入，請稍後再試。")).toBeTruthy();
  });

  it("submits a visitor comment regardless of auth state", () => {
    render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    fireEvent.change(screen.getByLabelText("分享你對《冥婚》的體驗"), { target: { value: "這是我的實際遊玩體驗" } });
    fireEvent.click(screen.getByRole("button", { name: "發表評論" }));
    expect(state.createMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ topicId: "popular-101", body: "這是我的實際遊玩體驗", authorName: expect.any(String), anonymousToken: expect.any(String) }));
  });

  it("submits the spoiler preference with a comment", () => {
    render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    fireEvent.change(screen.getByLabelText("分享你對《冥婚》的體驗"), { target: { value: "含有提示的遊玩心得" } });
    fireEvent.click(screen.getByLabelText("包含暴雷內容"));
    fireEvent.click(screen.getByRole("button", { name: "發表評論" }));
    expect(state.createMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ hasSpoiler: true }));
  });

  it("opens nickname setup before the first comment and sends after confirmation", () => {
    window.localStorage.removeItem("escape-index-anonymous-name");
    render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    fireEvent.change(screen.getByLabelText("分享你對《冥婚》的體驗"), { target: { value: "第一次留言" } });
    fireEvent.click(screen.getByRole("button", { name: "發表評論" }));
    expect(screen.getByText("請設定您的暱稱")).toBeTruthy();
    expect(screen.getByRole("button", { name: "選擇偵探頭像" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /選擇.*頭像/ })).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "選擇破鎖者頭像" }));
    fireEvent.click(screen.getByRole("button", { name: "解謎新手" }));
    fireEvent.click(screen.getByRole("button", { name: "確認並發送留言" }));
    const savedName = window.localStorage.getItem("escape-index-anonymous-name");
    expect(savedName).toMatch(/^解謎新手_[0-9a-f]{4}$/);
    expect(window.localStorage.getItem("escape-index-anonymous-avatar")).toBe("lockbreaker");
    expect(state.createMutation.mutate).toHaveBeenCalledWith({ topicId: "popular-101", body: "第一次留言", authorName: savedName, anonymousToken: "11111111-1111-4111-8111-111111111111", avatarId: expect.any(String), hasSpoiler: false });
  });

  it("renders author initials without requiring a users-table avatar join", () => {
    state.query = {
      data: [
        { id: 11, userId: 7, body: "Google 評論", authorName: "Google 玩家", avatarUrl: "https://lh3.googleusercontent.com/avatar", createdAt: new Date("2026-01-01T00:00:00Z") },
        { id: 12, userId: null, body: "匿名評論", authorName: "匿名探索者", avatarUrl: null, createdAt: new Date("2026-01-01T00:00:00Z") },
      ],
      isLoading: false,
      isError: false,
    };
    const { container } = render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll('[aria-label*="的角色頭像"]')).toHaveLength(2);
  });

  it("toggles a comment like and persists the state in localStorage", () => {
    state.query = {
      data: [{ id: 21, userId: null, body: "很實用的心得", authorName: "匿名探索者", createdAt: new Date("2026-01-01T00:00:00Z") }],
      isLoading: false,
      isError: false,
    };
    const { unmount } = render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    const helpfulButton = screen.getByRole("button", { name: /讚/ });
    fireEvent.click(helpfulButton);
    expect(helpfulButton.getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("escape-index-helpful-comments")).toBe("[21]");

    fireEvent.click(helpfulButton);
    expect(helpfulButton.getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem("escape-index-helpful-comments")).toBe("[]");

    unmount();
    render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByRole("button", { name: /讚/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("hides spoiler content until the visitor reveals it", () => {
    state.query = {
      data: [{ id: 22, userId: null, body: "結局提示內容", authorName: "匿名探索者", clearStatus: "success", hasSpoiler: true, createdAt: new Date("2026-01-01T00:00:00Z") }],
      isLoading: false,
      isError: false,
    };
    const { container } = render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    const revealButton = screen.getByRole("button", { name: "顯示留言 22 的暴雷內容" });
    expect(container.querySelector(".blur-sm")).toBeTruthy();
    fireEvent.click(revealButton);
    expect(screen.queryByRole("button", { name: "顯示留言 22 的暴雷內容" })).toBeNull();
    expect(container.querySelector(".blur-sm")).toBeNull();
  });

  it("shows the delete control for the anonymous comment owner", () => {
    state.query = {
      data: [{ id: 10, userId: null, body: "匿名評論", authorName: "匿名探索者", anonymousToken: "11111111-1111-4111-8111-111111111111", canDelete: true, createdAt: new Date("2026-01-01T00:00:00Z") }],
      isLoading: false,
      isError: false,
    };
    const { container } = render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByText("(你)")).toBeTruthy();
    expect(container.querySelector("article")?.className).toContain("border-[#c89b5c]");
    expect(screen.getByRole("button", { name: "刪除我的評論" })).toBeTruthy();
  });

  it("shows the delete control only for the comment owner and surfaces delete errors", () => {
    state.auth = { user: { id: 7 }, isAuthenticated: true, loading: false };
    state.query = {
      data: [{ id: 9, userId: null, body: "我的評論", authorName: "探索者", anonymousToken: "11111111-1111-4111-8111-111111111111", canDelete: true, createdAt: new Date("2026-01-01T00:00:00Z") }],
      isLoading: false,
      isError: false,
    };
    const { rerender } = render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByRole("button", { name: "刪除我的評論" })).toBeTruthy();

    state.query = {
      data: [{ id: 9, userId: null, body: "我的評論", authorName: "探索者", anonymousToken: "different-token", canDelete: false, createdAt: new Date("2026-01-01T00:00:00Z") }],
      isLoading: false,
      isError: false,
    };
    rerender(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.queryByRole("button", { name: "刪除我的評論" })).toBeNull();

    state.auth = { user: { id: 7 }, isAuthenticated: true, loading: false };
    state.deleteMutation = { mutate: vi.fn(), isPending: false, isError: true, error: new Error("只能刪除自己的評論") };
    rerender(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByText("只能刪除自己的評論")).toBeTruthy();
  });

  it("edits an owned comment in place and sends the anonymous token", () => {
    state.query = {
      data: [{ id: 13, userId: null, body: "原始內容", authorName: "測試探險家", anonymousToken: "11111111-1111-4111-8111-111111111111", createdAt: new Date("2026-01-01T00:00:00Z") }],
      isLoading: false,
      isError: false,
    };
    render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    fireEvent.click(screen.getByRole("button", { name: "編輯我的評論" }));
    const editor = screen.getByRole("textbox", { name: "編輯評論 13" });
    fireEvent.change(editor, { target: { value: "更新後內容" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    expect(state.updateMutation.mutate).toHaveBeenCalledWith({ id: 13, body: "更新後內容", anonymousToken: "11111111-1111-4111-8111-111111111111" });
  });

  it("asks for confirmation before deleting an owned comment", () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    state.query = {
      data: [{ id: 14, userId: null, body: "待刪除", authorName: "測試探險家", anonymousToken: "11111111-1111-4111-8111-111111111111", createdAt: new Date("2026-01-01T00:00:00Z") }],
      isLoading: false,
      isError: false,
    };
    render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    fireEvent.click(screen.getByRole("button", { name: "刪除我的評論" }));
    expect(window.confirm).toHaveBeenCalledWith("確定要刪除這則留言嗎？");
    expect(state.deleteMutation.mutate).not.toHaveBeenCalled();
  });
});
