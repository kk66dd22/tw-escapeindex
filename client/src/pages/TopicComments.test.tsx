// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopicComments } from "./Home";

const state = vi.hoisted(() => ({
  auth: { user: null as { id: number } | null, isAuthenticated: false, loading: false },
  query: { data: [] as Array<{ id: number; userId: number; body: string; authorName: string; createdAt: Date }>, isLoading: false, isError: false },
  createMutation: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  deleteMutation: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  queryInput: null as { topicId: string } | null,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => state.auth,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ comments: { list: { invalidate: vi.fn() } } }),
    comments: {
      list: { useQuery: (input: { topicId: string }) => { state.queryInput = input; return state.query; } },
      create: { useMutation: () => state.createMutation },
      delete: { useMutation: () => state.deleteMutation },
    },
  },
}));

function resetState() {
  state.auth = { user: null, isAuthenticated: false, loading: false };
  state.query = { data: [], isLoading: false, isError: false };
  state.createMutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  state.deleteMutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  state.queryInput = null;
}

describe("TopicComments", () => {
  beforeEach(() => resetState());

  it("renders an empty state and login CTA for visitors", () => {
    render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByText("目前還沒有評論，歡迎成為第一位分享體驗的探索者。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "登入後分享你的體驗" })).toBeTruthy();
    expect(state.queryInput).toEqual({ topicId: "popular-101" });
  });

  it("renders loading and error states", () => {
    state.query = { data: [], isLoading: true, isError: false };
    const { rerender } = render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByText("正在載入評論⋯")).toBeTruthy();

    state.query = { data: [], isLoading: false, isError: true };
    rerender(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByText("評論暫時無法載入，請稍後再試。")).toBeTruthy();
  });

  it("submits an authenticated comment with the topic id", () => {
    state.auth = { user: { id: 7 }, isAuthenticated: true, loading: false };
    render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    fireEvent.change(screen.getByLabelText("分享你對《冥婚》的體驗"), { target: { value: "這是我的實際遊玩體驗" } });
    fireEvent.click(screen.getByRole("button", { name: "發表評論" }));
    expect(state.createMutation.mutate).toHaveBeenCalledWith({ topicId: "popular-101", body: "這是我的實際遊玩體驗" });
  });

  it("shows the delete control only for the comment owner and surfaces delete errors", () => {
    state.auth = { user: { id: 7 }, isAuthenticated: true, loading: false };
    state.query = {
      data: [{ id: 9, userId: 7, body: "我的評論", authorName: "探索者", createdAt: new Date("2026-01-01T00:00:00Z") }],
      isLoading: false,
      isError: false,
    };
    const { rerender } = render(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByRole("button", { name: "刪除我的評論" })).toBeTruthy();

    state.auth = { user: { id: 8 }, isAuthenticated: true, loading: false };
    rerender(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.queryByRole("button", { name: "刪除我的評論" })).toBeNull();

    state.auth = { user: { id: 7 }, isAuthenticated: true, loading: false };
    state.deleteMutation = { mutate: vi.fn(), isPending: false, isError: true, error: new Error("只能刪除自己的評論") };
    rerender(<TopicComments topicId="popular-101" topicName="冥婚" />);
    expect(screen.getByText("只能刪除自己的評論")).toBeTruthy();
  });
});
