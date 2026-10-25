import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { ApiError, api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import { testRecording as rec } from "../../../../../tests/helpers/testRecording";
import type { Recording, SpeechModel } from "../../../../shared/speech";
import type { VoicePreset } from "../../../../shared/voice-presets";
import { resetAudioGallery } from "../gallery/useAudioGalleryView";
import { presetCostText } from "./presetCost";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    health: vi.fn(async () => ({ status: "ok" })),
    providers: vi.fn(async () => ({ providers: [] })),
    currentJob: vi.fn(),
    speechModels: vi.fn(),
    recordings: vi.fn(),
    recording: vi.fn(),
    deleteRecording: vi.fn(),
    voicePresets: vi.fn(),
    voicePreset: vi.fn(),
    updateVoicePreset: vi.fn(),
    deleteVoicePreset: vi.fn(),
  },
}));
const m = vi.mocked(api);

const V3: SpeechModel = {
  id: "elevenlabs/eleven-v3",
  name: "Eleven v3",
  maker: "ElevenLabs",
  maxChars: 5000,
  maxCharsSource: "family",
  voiceMode: "required",
  voices: ["george", "sarah"],
  price: { unit: "free" },
  controls: [],
};
const NOW = Date.now();
const preset = (over: Partial<VoicePreset> = {}): VoicePreset => ({
  id: "01P00000000000000000000001",
  name: "Narrator",
  provider: "openrouter",
  model: V3.id,
  modelName: "Eleven v3",
  voice: "george",
  settings: { stability: 0.5, speakerBoost: true },
  createdAt: "2026-10-25T10:00:00.000Z",
  updatedAt: "2026-10-25T10:00:00.000Z",
  stats: {
    recordings: 3,
    knownCostMicros: 420_000,
    pending: 1,
    unavailable: 0,
    lastUsedAt: new Date(NOW - 2 * 3600_000).toISOString(),
  },
  ...over,
});
const NARRATOR = preset();
const OLD = preset({
  id: "01P00000000000000000000002",
  name: "old one",
  model: "gone/tts",
  modelName: "Gone TTS",
  voice: null,
  settings: {},
  stats: { recordings: 0, knownCostMicros: null, pending: 0, unavailable: 0, lastUsedAt: null },
});

function at(path: string) {
  window.history.replaceState(null, "", path);
  return renderWithQuery(<App />);
}

beforeEach(() => {
  m.speechModels.mockResolvedValue({ models: [V3], fetchedAt: "x" });
  m.voicePresets.mockResolvedValue({ presets: [NARRATOR, OLD] });
  m.voicePreset.mockImplementation(async (id) => {
    const p = [NARRATOR, OLD].find((x) => x.id === id);
    if (!p) throw new ApiError(404, "NOT_FOUND", "Voice preset not found");
    return p;
  });
  m.recordings.mockResolvedValue({ items: [], nextCursor: null });
});
afterEach(() => {
  vi.clearAllMocks();
  resetAudioGallery();
  window.history.replaceState(null, "", "/");
});

describe("presetCostText (AC-12)", () => {
  const s = (over: object) => ({
    recordings: 1,
    knownCostMicros: null,
    pending: 0,
    unavailable: 0,
    lastUsedAt: null,
    ...over,
  });
  it("sums known costs only and names what is missing", () => {
    expect(presetCostText(s({ knownCostMicros: 420_000 }))).toBe("$0.42");
    expect(presetCostText(s({ knownCostMicros: 420_000, pending: 1 }))).toBe("$0.42 + 1 pending");
    expect(presetCostText(s({ knownCostMicros: 420_000, unavailable: 2 }))).toBe("$0.42 · 2 without a price");
    expect(presetCostText(s({ knownCostMicros: 420_000, pending: 1, unavailable: 2 }))).toBe(
      "$0.42 + 1 pending · 2 without a price",
    );
    expect(presetCostText(s({ pending: 1 }))).toBe("— + 1 pending");
    expect(presetCostText(s({ recordings: 0 }))).toBe("—");
  });
});

describe("Voices list (SCR-04)", () => {
  it("lists presets with model, voice, settings, count, total and last use; Voices is current (AC-11, AC-12)", async () => {
    at("/audio/voices");
    const card = (await screen.findByRole("heading", { name: "Narrator" })).closest("[data-preset-id]") as HTMLElement;
    expect(card).toHaveTextContent("George · Eleven v3");
    expect(within(card).getByText("stability 0.5")).toBeVisible();
    expect(within(card).getByText("speaker boost")).toBeVisible();
    expect(card).toHaveTextContent("3 recordings · $0.42 + 1 pending");
    expect(card).toHaveTextContent("Last used 2 h ago");
    const old = screen.getByRole("heading", { name: "old one" }).closest("[data-preset-id]") as HTMLElement;
    expect(old).toHaveTextContent("No longer offered");
    expect(old).toHaveTextContent("Provider default · Gone TTS");
    expect(old).toHaveTextContent("No recordings yet · —");
    expect(old).toHaveTextContent("Never used");
    expect(within(old).getByRole("button", { name: "Apply" })).toBeDisabled();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getByRole("link", { name: "Voices" })).toHaveAttribute("aria-current", "page");
  });

  it("applies a preset on the Speech page (AC-14)", async () => {
    at("/audio/voices");
    const card = (await screen.findByRole("heading", { name: "Narrator" })).closest("[data-preset-id]") as HTMLElement;
    await waitFor(() => expect(within(card).getByRole("button", { name: "Apply" })).toBeEnabled());
    fireEvent.click(within(card).getByRole("button", { name: "Apply" }));
    expect(window.location.pathname + window.location.search).toMatch(/^\/audio\/speech/);
  });

  it("says when there are none, or when they can't be loaded (AC-11, AC-19)", async () => {
    m.voicePresets.mockResolvedValueOnce({ presets: [] });
    const { unmount } = at("/audio/voices");
    expect(await screen.findByText("No voice presets yet.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to Speech" })).toHaveAttribute("href", "/audio/speech");
    unmount();
    m.voicePresets.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "boom"));
    at("/audio/voices");
    expect(await screen.findByText("Couldn't load your voices.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Narrator" })).toBeVisible();
  });
});

describe("a preset's page (SCR-05, SCR-06)", () => {
  const items = [rec(3, { preset: { id: NARRATOR.id, name: "Narrator" } }), rec(2), rec(1)];

  it("shows the preset and a grid of exactly its recordings; the dialog steps within them (AC-13)", async () => {
    m.recordings.mockImplementation(async (_c, _l, filter) =>
      filter && "preset" in filter && filter.preset === NARRATOR.id
        ? { items, nextCursor: null }
        : { items: [], nextCursor: null },
    );
    m.recording.mockImplementation(async (id) => items.find((r) => r.id === id) ?? (items[0] as Recording));
    at(`/audio/voices/${NARRATOR.id}`);
    expect(await screen.findByRole("heading", { name: "Narrator", level: 2 })).toBeVisible();
    expect(screen.getByText("3 recordings · $0.42 + 1 pending · Last used 2 h ago")).toBeVisible();
    expect(m.recordings).toHaveBeenCalledWith(undefined, 24, { preset: NARRATOR.id });
    const cards = await screen.findAllByRole("link", { name: /Recording number/ });
    expect(cards).toHaveLength(3);
    fireEvent.click(cards[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(window.location.pathname).toBe(`/audio/recordings/${items[0]?.id}`);
    // The page behind stays the preset's, Voices stays current.
    const nav = screen.getByRole("navigation", { name: "Sections", hidden: true });
    expect(within(nav).getByRole("link", { name: "Voices", hidden: true })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Narrator", level: 2, hidden: true })).toBeInTheDocument();
    expect(await within(dialog).findByRole("link", { name: "Narrator" })).toHaveAttribute(
      "href",
      `/audio/voices/${NARRATOR.id}`,
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /Older/ }));
    await waitFor(() => expect(window.location.pathname).toBe(`/audio/recordings/${items[1]?.id}`));
  });

  it("names the preset on a linked recording's detail with a link to its page (AC-04)", async () => {
    m.recording.mockResolvedValue(items[0] as Recording);
    at(`/audio/recordings/${items[0]?.id}`);
    const link = await screen.findByRole("link", { name: "Narrator" });
    expect(link).toHaveAttribute("href", `/audio/voices/${NARRATOR.id}`);
  });

  it("reads «No recordings with this voice yet.», «This voice no longer exists.» or «Couldn't load this voice.» (AC-07, AC-13, AC-19)", async () => {
    const first = at(`/audio/voices/${OLD.id}`);
    expect(await screen.findByText("No recordings with this voice yet.")).toBeVisible();
    first.unmount();
    const second = at("/audio/voices/01P0000000000000000000000Z");
    expect(await screen.findByText("This voice no longer exists.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Voices" })).toHaveAttribute("href", "/audio/voices");
    second.unmount();
    m.voicePreset.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "boom"));
    at(`/audio/voices/${NARRATOR.id}`);
    expect(await screen.findByText("Couldn't load this voice.")).toBeVisible();
  });

  it("deletes from its page: back to Voices with a notice; recordings kept (AC-07)", async () => {
    m.deleteVoicePreset.mockResolvedValue(null);
    at(`/audio/voices/${NARRATOR.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete «Narrator»?" });
    expect(confirm).toHaveTextContent("Its 3 recordings are kept.");
    m.voicePresets.mockResolvedValue({ presets: [OLD] });
    await act(async () => fireEvent.click(within(confirm).getByRole("button", { name: "Delete" })));
    await waitFor(() => expect(window.location.pathname).toBe("/audio/voices"));
    expect(await screen.findByText("Voice deleted.")).toBeVisible();
    expect(m.deleteVoicePreset).toHaveBeenCalledWith(NARRATOR.id);
  });

  it("renames from its page; the new name shows without a reload (AC-07)", async () => {
    m.updateVoicePreset.mockResolvedValue(preset({ name: "Calm narrator" }));
    at(`/audio/voices/${NARRATOR.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename voice" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "Calm narrator" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
    expect(await screen.findByRole("heading", { name: "Calm narrator", level: 2 })).toBeVisible();
  });
});

describe("counts follow a deletion anywhere (AC-16)", () => {
  it("re-reads the presets when a recording is removed from the caches", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const { patchRecordings } = await import("../gallery/patchRecordings");
    const qc = new QueryClient();
    qc.setQueryData(["voice-presets", "list"], { presets: [NARRATOR] });
    qc.setQueryData(["recordings", "list", "preset", NARRATOR.id], {
      pages: [{ items: [rec(1)], nextCursor: null }],
      pageParams: [undefined],
    });
    patchRecordings(qc, rec(1).id, "remove");
    expect(qc.getQueryState(["voice-presets", "list"])?.isInvalidated).toBe(true);
    expect(
      (qc.getQueryData(["recordings", "list", "preset", NARRATOR.id]) as { pages: { items: unknown[] }[] }).pages[0]
        ?.items,
    ).toEqual([]);
  });
});
