import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";

/** models-page-audio AC-09: one Models page, Image | Audio in the address, one navigation entry current. */
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    health: vi.fn(),
    providers: vi.fn(),
    currentJob: vi.fn(),
    models: vi.fn(),
    modelPreferences: vi.fn(),
    speechModels: vi.fn(),
    speechModelPreferences: vi.fn(),
    providerBalance: vi.fn(),
  },
}));
const m = vi.mocked(api);

beforeEach(() => {
  vi.resetAllMocks();
  m.health.mockResolvedValue({ status: "ok" });
  m.currentJob.mockResolvedValue({ job: null });
  m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: true }] });
  m.models.mockResolvedValue({ models: [], fetchedAt: "2026-10-25T10:00:00.000Z" });
  m.modelPreferences.mockResolvedValue({ preferences: [] });
  m.speechModels.mockResolvedValue({ models: [], fetchedAt: "2026-10-25T10:00:00.000Z" });
  m.speechModelPreferences.mockResolvedValue({ preferences: [] });
  m.providerBalance.mockResolvedValue({ provider: "openrouter", remainingUsd: 1 });
});
afterEach(() => window.history.replaceState(null, "", "/"));

const group = (name: string) => screen.getByRole("group", { name });
const current = () =>
  screen
    .getAllByRole("link")
    .filter((l) => l.getAttribute("aria-current") === "page")
    .map((l) => l.getAttribute("aria-label") ?? l.textContent);

describe("Models page tabs (AC-09)", () => {
  it("Image › Models opens the Image view, Audio › Models the Audio view; exactly one entry is current", async () => {
    window.history.replaceState(null, "", "/");
    renderWithQuery(<App />);
    fireEvent.click(within(group("Audio")).getByRole("link", { name: "Audio models" }));
    await waitFor(() => expect(window.location.search).toBe("?tab=audio"));
    expect(window.location.pathname).toBe("/models");
    expect(screen.getByRole("tab", { name: "Audio" })).toHaveAttribute("aria-selected", "true");
    expect(current()).toEqual(["Audio models"]);
    fireEvent.click(within(group("Image")).getByRole("link", { name: "Models" }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.getByRole("tab", { name: "Image" })).toHaveAttribute("aria-selected", "true");
    expect(current()).toEqual(["Models"]);
  });

  it("switching the tab changes the address; Back returns; a reload keeps the view; an unknown tab is Image", async () => {
    window.history.replaceState(null, "", "/models");
    const { unmount } = renderWithQuery(<App />);
    const audio = await screen.findByRole("tab", { name: "Audio" });
    fireEvent.mouseDown(audio);
    await waitFor(() => expect(window.location.search).toBe("?tab=audio"));
    expect(current()).toEqual(["Audio models"]);
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Image" })).toHaveAttribute("aria-selected", "true"));
    unmount();
    window.history.replaceState(null, "", "/models?tab=audio");
    const again = renderWithQuery(<App />);
    expect(await screen.findByRole("tab", { name: "Audio" })).toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe("?tab=audio"); // never «aliased» away
    again.unmount();
    window.history.replaceState(null, "", "/models?tab=video");
    renderWithQuery(<App />);
    expect(await screen.findByRole("tab", { name: "Image" })).toHaveAttribute("aria-selected", "true");
    expect(current()).toEqual(["Models"]);
  });
});
