// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomeAuthControls } from "./Home";

describe("HomeAuthControls", () => {
  afterEach(() => cleanup());

  it("shows the persistent anonymous visitor identity", () => {
    render(<HomeAuthControls />);
    expect(screen.getByText(/訪客：探險家_/)).toBeTruthy();
  });
});
