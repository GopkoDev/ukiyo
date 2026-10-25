import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import { App } from "./App";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    health: vi.fn(),
    providers: vi.fn(),
    models: vi.fn(),
    currentJob: vi.fn(),
    generations: vi.fn(),
    generation: vi.fn(),
    price: vi.fn(),
    costHistory: vi.fn(),
  },
}));
const m = vi.mocked(api);

function at(path: string) {
  window.history.replaceState(null, "", path);
  return renderWithQuery(<App />);
}
const nav = () => screen.getByRole("navigation", { name: "Sections" });
const entry = (name: string) => within(nav()).getByRole("link", { name: new RegExp(`^${name}`) });

describe("App frame (SCR-04, SCR-05)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.health.mockResolvedValue({ status: "ok" });
    m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: false }] });
    m.currentJob.mockResolvedValue({ job: null });
    m.generations.mockResolvedValue({ items: [], nextCursor: null });
    m.generation.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Generation not found"));
  });
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("lists Generate then Gallery and marks Generate current at the root address (AC-01)", async () => {
    at("/");
    const links = within(nav()).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Generate", "Gallery", "Models", "Speech", "Gallery"]); // Image group, then Audio (ADR-0046)
    expect(entry("Generate")).toHaveAttribute("aria-current", "page");
    expect(entry("Gallery")).not.toHaveAttribute("aria-current");
    expect(await screen.findByText("OpenRouter is not configured.")).toBeVisible();
    expect(document.title).toBe("Generate · Ukiyo");
  });

  it("switches sections on a click without reloading, and back/forward walk the visit (AC-01, AC-03)", async () => {
    at("/");
    const before = window.history.length;
    fireEvent.click(entry("Gallery"));
    expect(window.location.pathname).toBe("/gallery");
    expect(window.history.length).toBe(before + 1);
    expect(entry("Gallery")).toHaveAttribute("aria-current", "page");
    expect(
      await within(await screen.findByRole("region", { name: "Gallery" })).findByText("No generations yet."),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Gallery" })).toBeVisible();
    expect(document.title).toBe("Gallery · Ukiyo");

    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(entry("Generate")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("region", { name: "Gallery" })).not.toBeInTheDocument();
  });

  it("renders the page an address names on a fresh load (AC-03)", async () => {
    at("/gallery");
    expect(entry("Gallery")).toHaveAttribute("aria-current", "page");
    expect(
      await within(await screen.findByRole("region", { name: "Gallery" })).findByText("No generations yet."),
    ).toBeVisible();
  });

  it("marks Gallery current on a generation's detail page and links back to the gallery (AC-02)", async () => {
    at("/generations/01MISSING");
    expect(entry("Gallery")).toHaveAttribute("aria-current", "page");
    expect(document.title).toBe("Gallery · Ukiyo");
    expect(await screen.findByText("This generation no longer exists.")).toBeVisible();
  });

  it("says an unknown address was not found and offers Generate, keeping the bar (AC-04)", async () => {
    at("/nope");
    expect(screen.getByRole("heading", { name: "Page not found." })).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to Generate" })).toHaveAttribute("href", "/");
    expect(
      within(nav())
        .getAllByRole("link")
        .some((l) => l.hasAttribute("aria-current")),
    ).toBe(false);
    expect(await screen.findByText("OpenRouter is not configured.")).not.toBeVisible(); // Generate stays mounted, hidden
    expect(document.title).toBe("Page not found · Ukiyo");
  });

  it("names where you are in the header breadcrumb (AC-02, AC-04)", async () => {
    const crumbs = () => screen.getByRole("navigation", { name: "breadcrumb" });
    const { unmount } = at("/gallery");
    expect(crumbs()).toHaveTextContent("Gallery");
    unmount();
    const detail = at("/generations/01MISSING");
    expect(crumbs()).toHaveTextContent(/Gallery.*Generation/);
    expect(within(crumbs()).getByRole("link", { name: "Gallery" })).toHaveAttribute("href", "/gallery");
    detail.unmount();
    at("/nope");
    expect(crumbs()).toHaveTextContent("Page not found");
  });

  it("collapses to an icon rail that keeps the entries and the current marker (AC-16)", () => {
    const { container } = at("/gallery");
    const sidebar = () => container.querySelector("[data-slot=sidebar]");
    expect(sidebar()).toHaveAttribute("data-state", "expanded");
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(sidebar()).toHaveAttribute("data-state", "collapsed");
    expect(sidebar()).toHaveAttribute("data-collapsible", "icon");
    expect(entry("Gallery")).toHaveAttribute("aria-current", "page");
    fireEvent.click(entry("Generate"));
    expect(window.location.pathname).toBe("/");
  });

  it("opens the sections as a slide-in panel on a narrow window, closing it on a choice (AC-10)", async () => {
    const width = window.innerWidth;
    window.innerWidth = 500;
    try {
      at("/");
      expect(screen.queryByRole("navigation", { name: "Sections" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
      const panel = await screen.findByRole("dialog");
      fireEvent.click(within(panel).getByRole("link", { name: /^Gallery/ }));
      expect(window.location.pathname).toBe("/gallery");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(
        await within(await screen.findByRole("region", { name: "Gallery" })).findByText("No generations yet."),
      ).toBeVisible();
    } finally {
      window.innerWidth = width;
    }
  });

  it("reports the server as ok, or unreachable when health fails", async () => {
    at("/");
    expect(screen.getByRole("heading", { name: "Ukiyo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ukiyo" })).toHaveAttribute("href", "/");
    expect(await screen.findByText("server ok")).toBeInTheDocument();
  });

  it("has the theme toggle in the sidebar (AC-11)", () => {
    at("/");
    const sidebar = document.querySelector("[data-slot=sidebar]") as HTMLElement;
    expect(within(sidebar).getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("reports the server as unreachable when health fails", async () => {
    m.health.mockRejectedValue(new Error("down"));
    at("/");
    expect(await screen.findByText("server unreachable")).toBeInTheDocument();
  });
});
