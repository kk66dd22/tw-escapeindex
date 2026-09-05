// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { user: null as { name?: string; email?: string; avatarUrl?: string | null } | null, isAuthenticated: false, loading: false, logout: vi.fn() },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => state.auth,
}));

vi.mock("@/const", () => ({
  startLogin: vi.fn(),
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  AvatarImage: (props: any) => <img {...props} />,
  AvatarFallback: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

import { HomeAuthControls } from "./Home";

describe("HomeAuthControls", () => {
  beforeEach(() => {
    state.auth = { user: null, isAuthenticated: false, loading: false, logout: vi.fn() };
  });

  afterEach(() => cleanup());

  it("shows the Google account login entry for visitors", () => {
    render(<HomeAuthControls />);
    expect(screen.getByRole("button", { name: "Google 帳號登入" })).toBeTruthy();
  });

  it("opens logout confirmation from the Google avatar and only logs out after confirmation", () => {
    state.auth = { user: { name: "Google 玩家", email: "player@example.com", avatarUrl: "https://lh3.googleusercontent.com/avatar" }, isAuthenticated: true, loading: false, logout: vi.fn() };
    const { container } = render(<HomeAuthControls />);
    expect(screen.getByText("Google 玩家")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://lh3.googleusercontent.com/avatar");

    fireEvent.click(screen.getByText("Google 玩家"));
    expect(screen.getByText("確定要登出嗎？")).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-w-[34rem]");
    expect(dialog.className).toContain("sm:max-w-[40rem]");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(state.auth.logout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Google 玩家"));
    fireEvent.click(screen.getByRole("button", { name: "確認登出" }));
    expect(state.auth.logout).toHaveBeenCalledTimes(1);
  });
});
