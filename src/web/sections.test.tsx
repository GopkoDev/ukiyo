import { fireEvent, screen, within } from "@testing-library/react";
import { Boxes } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "@/test-utils";
import { App } from "./App";
import { SECTIONS, type Section, sectionFor } from "./sections";

describe("sections registry", () => {
  it("lists Generate, Gallery, Speech then Models, Generate at the root address", () => {
    expect(SECTIONS.map((s) => [s.id, s.path, s.label])).toEqual([
      ["generate", "/", "Generate"],
      ["gallery", "/gallery", "Gallery"],
      ["speech", "/speech", "Speech"],
      ["models", "/models", "Models"],
    ]);
  });

  it("makes Models reachable at /models, not kept mounted", () => {
    const section = sectionFor({ name: "page", pathname: "/models", search: "" });
    expect(section?.id).toBe("models");
    expect(section?.keepMounted).toBeFalsy();
  });

  it("finds the section that owns an address", () => {
    expect(sectionFor({ name: "page", pathname: "/", search: "" })?.id).toBe("generate");
    expect(sectionFor({ name: "page", pathname: "/gallery", search: "" })?.id).toBe("gallery");
    expect(sectionFor({ name: "page", pathname: "/gallery/", search: "?deleted=1" })?.id).toBe("gallery");
    expect(sectionFor({ name: "detail", id: "01ABC" })?.id).toBe("gallery");
  });

  it("finds no section for an address outside the registry", () => {
    for (const pathname of ["/whatever", "/GALLERY", "/generations/", "/gallery/x"])
      expect(sectionFor({ name: "page", pathname, search: "" })).toBeUndefined();
  });

  it("matches against whatever registry it is given — a new section is one entry", () => {
    const models: Section = { id: "models", path: "/models", label: "Models", icon: Boxes, page: () => null };
    const extra = [...SECTIONS, models];
    expect(sectionFor({ name: "page", pathname: "/models", search: "" }, extra)?.id).toBe("models");
  });

  it("one extra entry gets a bar entry, an address and a page — no change to the bar or the frame", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "ok" })),
    );
    const models: Section = {
      id: "extras",
      path: "/extras",
      label: "Extras",
      icon: Boxes,
      page: () => <p>Extras page</p>,
    };
    window.history.replaceState(null, "", "/extras");
    renderWithQuery(<App sections={[...SECTIONS, models]} />);
    const link = within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name: "Extras" });
    expect(link).toHaveAttribute("href", "/extras");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Extras page")).toBeVisible();
    expect(document.title).toBe("Extras · Ukiyo");
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name: "Gallery" }),
    );
    expect(screen.queryByText("Extras page")).not.toBeInTheDocument();
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });
});
