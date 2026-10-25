import { fireEvent, screen, within } from "@testing-library/react";
import { Boxes } from "lucide-react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { mediaDialogState } from "@/lib/router";
import { renderWithQuery } from "@/test-utils";
import { App } from "./App";
import { SECTION_GROUPS, SECTIONS, type Section, sectionFor } from "./sections";

describe("sections registry", () => {
  it("lists Generate, Gallery, Models in the Image group, then Speech in the Audio group under /audio", () => {
    expect(SECTIONS.map((s) => [s.id, s.path, s.label, s.group ?? "image"])).toEqual([
      ["generate", "/", "Generate", "image"],
      ["gallery", "/gallery", "Gallery", "image"],
      ["models", "/models", "Models", "image"],
      ["speech", "/audio/speech", "Speech", "audio"],
      ["audio-gallery", "/audio/gallery", "Gallery", "audio"],
      ["voices", "/audio/voices", "Voices", "audio"],
      ["audio-models", "/models?tab=audio", "Models", "audio"],
    ]);
    expect(SECTION_GROUPS.map((g) => [g.id, g.label])).toEqual([
      ["image", "Image"],
      ["audio", "Audio"],
    ]);
    const speech = SECTIONS.find((s) => s.id === "speech");
    expect(speech?.aliases).toEqual(["/speech"]);
    expect(speech?.keepMounted).toBe("after-visit");
  });

  it("serves the Models page as two sections by its tab (models-page-audio ADR-0056)", () => {
    const at = (pathname: string, search = "") => sectionFor({ name: "page", pathname, search })?.id;
    expect(at("/models")).toBe("models");
    expect(at("/models", "?tab=image")).toBe("models");
    expect(at("/models", "?tab=nonsense")).toBe("models");
    expect(at("/models", "?tab=audio")).toBe("audio-models");
    expect(at("/models/", "?tab=audio")).toBe("audio-models");
    expect(SECTIONS.find((s) => s.id === "audio-models")?.accessibleName).toBe("Audio models");
    expect(SECTIONS.find((s) => s.id === "models")?.accessibleName).toBeUndefined();
  });

  it("finds Speech at its former address too", () => {
    expect(sectionFor({ name: "page", pathname: "/speech", search: "" })?.id).toBe("speech");
    expect(sectionFor({ name: "page", pathname: "/speech/", search: "" })?.id).toBe("speech");
    expect(sectionFor({ name: "page", pathname: "/audio/speech", search: "" })?.id).toBe("speech");
    expect(sectionFor({ name: "page", pathname: "/audio", search: "" })).toBeUndefined();
  });

  it("lets Voices own its preset pages and the recording dialogs opened from them (voice-presets ADR-0059, ADR-0060)", () => {
    const at = (pathname: string) => sectionFor({ name: "page", pathname, search: "" })?.id;
    expect(at("/audio/voices")).toBe("voices");
    expect(at("/audio/voices/01P00000000000000000000001")).toBe("voices");
    expect(at("/audio/voices/01P00000000000000000000001/")).toBe("voices");
    expect(at("/audio/voices/a/b")).toBeUndefined();
    const recording = (state: unknown) => sectionFor({ name: "recording", id: "01R1", state })?.id;
    expect(
      recording(
        mediaDialogState("voices", {
          grid: { kind: "preset", presetId: "01P1" },
          order: { kind: "preset", presetId: "01P1" },
        }),
      ),
    ).toBe("voices");
    expect(recording(mediaDialogState("audio-gallery", { grid: { kind: "all" }, order: { kind: "all" } }))).toBe(
      "audio-gallery",
    );
    expect(recording(null)).toBe("audio-gallery");
    // A reload (another app load) of a Voices dialog visit is a direct visit: the audio gallery's recording page.
    expect(recording({ dialog: "voices", load: "an earlier load" })).toBe("audio-gallery");
    expect(SECTIONS.find((s) => s.id === "voices")?.detail?.route).toBe("recording");
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

  it("shows an Image group then an Audio group in the navigation bar, each with its entries", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "ok" })),
    );
    window.history.replaceState(null, "", "/models");
    renderWithQuery(<App />);
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const groups = within(nav).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["Image", "Audio"]);
    const [image, audio] = groups as [HTMLElement, HTMLElement];
    expect(
      within(image)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Generate", "Gallery", "Models"]);
    expect(
      within(audio)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Speech", "Gallery", "Voices", "Models"]);
    expect(within(image).getByRole("link", { name: "Models" })).toHaveAttribute("aria-current", "page");
    expect(within(audio).getByRole("link", { name: "Speech" })).toHaveAttribute("href", "/audio/speech");
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  it("replaces the former Speech address with the Audio one, without a new history entry", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "ok" })),
    );
    const before = window.history.length;
    window.history.replaceState(null, "", "/speech");
    renderWithQuery(<App sections={[...SECTIONS.filter((s) => s.id !== "speech"), { ...speechStub }]} />);
    expect(window.location.pathname).toBe("/audio/speech");
    expect(window.history.length).toBe(before);
    expect(screen.getByText("Speech stub")).toBeVisible();
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  it("redirects only declared former addresses: /speech/ still does, a preset page keeps its address", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "ok" })),
    );
    window.history.replaceState(null, "", "/speech/");
    renderWithQuery(<App sections={[...SECTIONS.filter((s) => s.id !== "speech"), { ...speechStub }]} />);
    expect(window.location.pathname).toBe("/audio/speech");
    window.history.replaceState(null, "", "/audio/voices/01P00000000000000000000001");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(window.location.pathname).toBe("/audio/voices/01P00000000000000000000001");
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  it("mounts an after-visit section only once it is visited, then keeps it while other pages show", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "ok" })),
    );
    const mounts = vi.fn();
    function Counted() {
      useEffect(() => mounts(), []);
      return <p>Speech stub</p>;
    }
    const sections = [...SECTIONS.filter((s) => s.id !== "speech"), { ...speechStub, page: Counted }];
    window.history.replaceState(null, "", "/models");
    renderWithQuery(<App sections={sections} />);
    expect(screen.queryByText("Speech stub")).not.toBeInTheDocument();
    const nav = () => screen.getByRole("navigation", { name: "Sections" });
    fireEvent.click(within(nav()).getByRole("link", { name: "Speech" }));
    expect(screen.getByText("Speech stub")).toBeVisible();
    fireEvent.click(within(nav()).getByRole("link", { name: "Models" }));
    expect(screen.getByText("Speech stub")).not.toBeVisible();
    fireEvent.click(within(nav()).getByRole("link", { name: "Speech" }));
    expect(screen.getByText("Speech stub")).toBeVisible();
    expect(mounts).toHaveBeenCalledTimes(1);
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });
});

const speechStub: Section = {
  id: "speech",
  path: "/audio/speech",
  aliases: ["/speech"],
  group: "audio",
  label: "Speech",
  icon: Boxes,
  page: () => <p>Speech stub</p>,
  keepMounted: "after-visit",
};
