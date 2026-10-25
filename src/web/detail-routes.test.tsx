import { screen } from "@testing-library/react";
import { Library } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { isDialogVisit, mediaDialogState, parseRoute } from "@/lib/router";
import { renderWithQuery } from "@/test-utils";
import { App } from "./App";
import { SECTIONS, type Section, sectionFor } from "./sections";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { health: vi.fn(), providers: vi.fn(), currentJob: vi.fn(), generations: vi.fn(), generation: vi.fn() },
}));

const R = "01R00000000000000000000001";
const things: Section = {
  id: "things",
  path: "/audio/gallery",
  group: "audio",
  label: "Things",
  icon: Library,
  page: () => <p>the things grid</p>,
  owns: (route) => route.name === "recording",
  detail: {
    route: "recording",
    label: "Thing",
    Page: ({ id }) => <p>thing page {id}</p>,
    Dialog: ({ id }) => <p>thing dialog {id}</p>,
  },
};

afterEach(() => window.history.replaceState(null, "", "/"));

describe("detail routes per section (ADR-0048)", () => {
  it("parses a recording address apart from a generation address", () => {
    expect(parseRoute(`/audio/recordings/${R}`)).toEqual({ name: "recording", id: R });
    expect(parseRoute(`/generations/${R}`)).toEqual({ name: "detail", id: R });
    expect(parseRoute("/audio/recordings/")).toEqual({ name: "page", pathname: "/audio/recordings/", search: "" });
  });

  it("a recording address is never owned by the image Gallery, and a generation address never by the audio one", () => {
    const sections = [...SECTIONS, things];
    expect(sectionFor({ name: "recording", id: R }, sections)?.id).toBe("things");
    expect(sectionFor({ name: "detail", id: R }, sections)?.id).toBe("gallery");
  });

  it("recognises a dialog visit only for the gallery that opened it", () => {
    const state = mediaDialogState("audio-gallery", { grid: { kind: "all" }, order: { kind: "all" } });
    expect(isDialogVisit({ name: "recording", id: R, state })).toBe(true);
    expect(isDialogVisit({ name: "detail", id: R, state })).toBe(false);
  });

  it("renders the owning section's detail page on a direct visit, with its crumb", async () => {
    vi.mocked(api.health).mockResolvedValue({ status: "ok" });
    vi.mocked(api.providers).mockResolvedValue({ providers: [] });
    vi.mocked(api.currentJob).mockResolvedValue({ job: null });
    window.history.replaceState(null, "", `/audio/recordings/${R}`);
    renderWithQuery(<App sections={[...SECTIONS, things]} />);
    expect(await screen.findByText(`thing page ${R}`)).toBeInTheDocument();
    expect(screen.getByText("Thing", { selector: "[aria-current='page']" })).toBeInTheDocument();
  });

  it("renders the owning section's dialog over its grid on a dialog visit", async () => {
    vi.mocked(api.health).mockResolvedValue({ status: "ok" });
    vi.mocked(api.providers).mockResolvedValue({ providers: [] });
    vi.mocked(api.currentJob).mockResolvedValue({ job: null });
    window.history.replaceState(
      mediaDialogState("audio-gallery", { grid: { kind: "all" }, order: { kind: "all" } }),
      "",
      `/audio/recordings/${R}`,
    );
    renderWithQuery(<App sections={[...SECTIONS, things]} />);
    expect(await screen.findByText(`thing dialog ${R}`)).toBeInTheDocument();
    expect(screen.getByText("the things grid")).toBeInTheDocument();
  });
});
