// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { user: null as { name?: string; email?: string } | null, isAuthenticated: false, loading: false, logout: vi.fn() },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => state.auth,
}));

vi.mock("@/const", () => ({
  startLogin: vi.fn(),
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

  it("shows the signed-in account and invokes logout", () => {
    state.auth = { user: { name: "Google 玩家", email: "player@example.com" }, isAuthenticated: true, loading: false, logout: vi.fn() };
    render(<HomeAuthControls />);
    expect(screen.getByText("Google 玩家")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Google 玩家/ }));
    expect(state.auth.logout).toHaveBeenCalledTimes(1);
  });
});
