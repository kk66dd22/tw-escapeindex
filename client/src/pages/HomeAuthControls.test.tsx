// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomeAuthControls } from "./Home";

describe("HomeAuthControls", () => {
  afterEach(() => cleanup());

  it("shows the persistent anonymous visitor identity", () => {
    window.localStorage.setItem("escape-index-anonymous-name", "探險家_8f2a");
    render(<HomeAuthControls />);
    expect(screen.getByText("探險家_8f2a")).toBeTruthy();
    expect(screen.getByRole("button", { name: "探險家_8f2a" })).toBeTruthy();
  });

  it("updates the stored nickname from the Header modal", () => {
    window.localStorage.setItem("escape-index-anonymous-name", "舊暱稱");
    render(<HomeAuthControls />);
    fireEvent.click(screen.getByRole("button", { name: "舊暱稱" }));
    const input = screen.getByRole("textbox", { name: "暱稱" });
    fireEvent.change(input, { target: { value: "逃脫大師" } });
    fireEvent.click(screen.getByRole("button", { name: "確認" }));
    expect(window.localStorage.getItem("escape-index-anonymous-name")).toBe("逃脫大師");
    expect(screen.getByText("逃脫大師")).toBeTruthy();
  });
});
