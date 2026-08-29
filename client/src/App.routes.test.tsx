// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./pages/Home", () => ({ default: () => <div>HOME_PAGE</div> }));
vi.mock("./pages/About", () => ({ default: () => <div>ABOUT_PAGE</div> }));
vi.mock("./pages/Privacy", () => ({ default: () => <div>PRIVACY_PAGE</div> }));
vi.mock("./pages/Contact", () => ({ default: () => <div>CONTACT_PAGE</div> }));
vi.mock("./pages/NotFound", () => ({ default: () => <div>NOT_FOUND_PAGE</div> }));
vi.mock("./components/ErrorBoundary", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("./contexts/ThemeContext", () => ({ ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/ui/tooltip", () => ({ TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));

import App from "./App";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("public routes", () => {
  it.each([
    ["/", "HOME_PAGE"],
    ["/about", "ABOUT_PAGE"],
    ["/privacy", "PRIVACY_PAGE"],
    ["/contact", "CONTACT_PAGE"],
    ["/unknown-page", "NOT_FOUND_PAGE"],
  ])("renders %s through the application router", (path, pageLabel) => {
    window.history.replaceState({}, "", path);
    render(<App />);
    expect(screen.getByText(pageLabel)).toBeTruthy();
  });
});
