// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SiteFooter from "./SiteFooter";

describe("SiteFooter", () => {
  it("renders all required public information links", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "關於我們" }).getAttribute("href")).toBe("/about");
    expect(screen.getByRole("link", { name: "隱私權政策" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "聯絡我們" }).getAttribute("href")).toBe("/contact");
  });
});
