import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { ApiError, api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import { testRecording as rec } from "../../../../../tests/helpers/testRecording";
import type { Recording, RecordingModelGroupsResponse, SpeechModel } from "../../../../shared/speech";
import { controlsFor } from "../../../../shared/speech-models";
import { resetAudioGallery } from "./useAudioGalleryView";

/**
 * Component-level cases deferred by the audio-gallery review 2026-10-25 (spec §8): AC-02 pausing and no remount,
 * AC-04 a settled cost in every view, AC-13 the view in the address, AC-18 live Speech ↔ gallery, AC-21 in the UI.
 */
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    health: vi.fn(),
    providers: vi.fn(),
    currentJob: vi.fn(),
    generations: vi.fn(),
    speechModels: vi.fn(),
    voicePresets: vi.fn(async () => ({ presets: [] })),
    providerBalance: vi.fn(),
    recordings: vi.fn(),
    recording: vi.fn(),
    recordingModels: vi.fn(),
    createRecording: vi.fn(),
    deleteRecording: vi.fn(),
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
  voices: ["george"],
  price: { unit: "per-character", usdPerChar: 0.00008 },
  controls: controlsFor("elevenlabs/eleven-v3"),
};
const TTS = { model: "openai/tts", modelName: "OpenAI TTS" };

/** The server's recordings, newest first; reads page through them by id like the real cursor. */
let stored: Recording[] = [];
let pageSize = 24;
const groups = (): RecordingModelGroupsResponse => {
  const by = new Map<string, Recording[]>();
  for (const r of stored) by.set(r.model, [...(by.get(r.model) ?? []), r]);
  return {
    models: [...by.values()].map((rs) => ({
      provider: "openrouter",
      model: (rs[0] as Recording).model,
      modelName: (rs[0] as Recording).modelName,
      count: rs.length,
      latestId: (rs[0] as Recording).id,
      items: rs.slice(0, 4),
    })),
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  pageSize = 24;
  stored = [rec(2), rec(1)];
  window.scrollTo = vi.fn();
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  m.health.mockResolvedValue({ status: "ok" });
  m.providers.mockResolvedValue({ providers: [] });
  m.currentJob.mockResolvedValue({ job: null });
  m.generations.mockResolvedValue({ items: [], nextCursor: null });
  m.speechModels.mockResolvedValue({ models: [V3], fetchedAt: "2026-10-25T10:00:00.000Z" });
  m.providerBalance.mockResolvedValue({ provider: "openrouter", remainingUsd: 1 });
  m.recordingModels.mockImplementation(async () => groups());
  m.recordings.mockImplementation(async (cursor, _limit, filter) => {
    const all = stored.filter(
      (r) => (!filter || !("model" in filter) || r.model === filter.model) && (!cursor || r.id < cursor),
    );
    const items = all.slice(0, pageSize);
    return { items, nextCursor: all.length > pageSize ? (items.at(-1)?.id ?? null) : null };
  });
  m.recording.mockImplementation(async (id) => {
    const r = stored.find((s) => s.id === id);
    if (!r) throw new ApiError(404, "NOT_FOUND", "Recording not found");
    return r;
  });
  m.deleteRecording.mockImplementation(async (id) => {
    stored = stored.filter((r) => r.id !== id);
    return null;
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  resetAudioGallery();
  window.history.replaceState(null, "", "/");
});

function openApp(path: string) {
  window.history.replaceState(null, "", path);
  return renderWithQuery(<App />);
}
const nav = () => screen.getByRole("navigation", { name: "Sections" });
const go = (name: string) => fireEvent.click(within(nav()).getByRole("link", { name }));
const cardIds = (root: ParentNode = document) =>
  [...root.querySelectorAll("[data-recording-id]")].map((c) => c.getAttribute("data-recording-id"));
const cardOf = (i: number) => document.querySelector(`[data-recording-id="${rec(i).id}"]`) as HTMLElement;
const popTo = (url: string) =>
  act(() => {
    window.history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
const back = () =>
  act(async () => {
    window.history.back();
    await new Promise((r) => setTimeout(r, 20));
  });

/** Simulates a playing native player (jsdom has no media pipeline). */
function playing(el: HTMLAudioElement) {
  let paused = false;
  Object.defineProperty(el, "paused", { configurable: true, get: () => paused });
  el.pause = vi.fn(() => {
    paused = true;
  });
  return el;
}

describe("AC-02 — playback in the gallery", () => {
  it("opening a card's dialog pauses the card that plays", async () => {
    openApp("/audio/gallery");
    await screen.findByText(/Recording number 2/);
    const player = playing(cardOf(1).querySelector("audio") as HTMLAudioElement);
    fireEvent.click(within(cardOf(2)).getByText(/Recording number 2/));
    await screen.findByRole("dialog");
    expect(player.pause).toHaveBeenCalled();
    expect(player.paused).toBe(true);
  });

  it("a pending card's cost refresh keeps the same player element (no remount, playback goes on)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const pending = rec(1, { costStatus: "pending", costMicros: null, estimateMicros: 1600 });
    stored = [rec(2), pending];
    openApp("/audio/gallery");
    await screen.findByText("cost pending · ≈ $0.0016");
    const player = playing(cardOf(1).querySelector("audio") as HTMLAudioElement);
    stored = [rec(2), { ...pending, costStatus: "known", costMicros: 1500 }];
    await act(async () => vi.advanceTimersByTimeAsync(10_500));
    expect(await within(cardOf(1)).findByText("$0.0015")).toBeVisible();
    expect(cardOf(1).querySelector("audio")).toBe(player);
    expect(player.isConnected).toBe(true);
    expect(player.pause).not.toHaveBeenCalled();
  });
});

describe("AC-04 — a settled cost shows in every audio view", () => {
  const pending = () => rec(1, { costStatus: "pending", costMicros: null, estimateMicros: 1600 });
  const settle = async () => {
    stored = stored.map((r) => (r.id === rec(1).id ? { ...r, costStatus: "known", costMicros: 1500 } : r));
    await act(async () => vi.advanceTimersByTimeAsync(10_500));
  };

  it("in the open dialog and on its card behind it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stored = [rec(2), pending()];
    openApp("/audio/gallery");
    fireEvent.click(await screen.findByText(/Recording number 1/));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findAllByText(/cost pending/)).not.toHaveLength(0);
    await settle();
    await waitFor(() => expect(within(dialog).queryByText(/cost pending/)).toBeNull());
    expect(within(dialog).getAllByText("$0.0015").length).toBeGreaterThan(0);
    expect(m.recordings).toHaveBeenCalledTimes(1);
  });

  it("in one model's grid", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stored = [rec(2), pending()];
    openApp("/audio/gallery?model=elevenlabs%2Feleven-v3");
    const card = await waitFor(() => {
      const c = cardOf(1);
      expect(c).not.toBeNull();
      return c;
    });
    await within(card).findByText("cost pending · ≈ $0.0016");
    await settle();
    expect(await within(cardOf(1)).findByText("$0.0015")).toBeVisible();
    expect(m.recordings).toHaveBeenCalledTimes(1);
  });

  it("in «By model»", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stored = [rec(2), pending()];
    openApp("/audio/gallery?view=models");
    const section = await screen.findByRole("region", { name: "Eleven v3" });
    expect(await within(section).findByText("cost pending · ≈ $0.0016")).toBeVisible();
    await settle();
    expect(await within(section).findByText("$0.0015")).toBeVisible();
    expect(m.recordingModels).toHaveBeenCalledTimes(1);
  });
});

describe("AC-13 — the view lives in the address", () => {
  beforeEach(() => {
    stored = [rec(3), rec(2, TTS), rec(1)];
  });

  it("Back and Forward move between All and one model; a reload keeps the model's view", async () => {
    const { unmount } = openApp("/audio/gallery");
    await waitFor(() => expect(cardIds()).toEqual([rec(3).id, rec(2).id, rec(1).id]));
    fireEvent.click(screen.getByRole("button", { name: "Choose a model" }));
    fireEvent.click(await screen.findByRole("button", { name: /OpenAI TTS/ }));
    await waitFor(() => expect(cardIds()).toEqual([rec(2).id]));
    await back();
    await waitFor(() => expect(cardIds()).toEqual([rec(3).id, rec(2).id, rec(1).id]));
    await act(async () => {
      window.history.forward();
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(cardIds()).toEqual([rec(2).id]));
    // a reload: the same address in a fresh app
    unmount();
    resetAudioGallery();
    openApp(window.location.pathname + window.location.search);
    expect(await screen.findByRole("heading", { name: "OpenAI TTS · 1 recording" })).toBeVisible();
    expect(cardIds()).toEqual([rec(2).id]);
  });

  it("keeps each view's scroll; «Show all recordings» starts All where it was left", async () => {
    openApp("/audio/gallery");
    await waitFor(() => expect(cardIds()).toHaveLength(3));
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true });
    fireEvent.scroll(window);
    vi.mocked(window.scrollTo).mockClear();
    popTo("/audio/gallery?model=openai%2Ftts");
    await waitFor(() => expect(cardIds()).toEqual([rec(2).id]));
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
    Object.defineProperty(window, "scrollY", { value: 120, configurable: true });
    fireEvent.scroll(window);
    popTo("/audio/gallery");
    await waitFor(() => expect(cardIds()).toHaveLength(3));
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 300);
    popTo("/audio/gallery?model=openai%2Ftts");
    await waitFor(() => expect(cardIds()).toEqual([rec(2).id]));
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 120);
  });

  it("Gallery in the navigation opens All from a model's view and from «By model»", async () => {
    openApp("/audio/gallery?model=openai%2Ftts");
    await waitFor(() => expect(cardIds()).toEqual([rec(2).id]));
    go("Audio gallery");
    await waitFor(() => expect(cardIds()).toEqual([rec(3).id, rec(2).id, rec(1).id]));
    expect(window.location.search).toBe("");
    popTo("/audio/gallery?view=models");
    await screen.findByRole("region", { name: "OpenAI TTS" });
    go("Audio gallery");
    await waitFor(() => expect(screen.queryByRole("region", { name: "OpenAI TTS" })).toBeNull());
    expect(cardIds()).toEqual([rec(3).id, rec(2).id, rec(1).id]);
  });
});

describe("AC-18 — Speech and the gallery stay one list", () => {
  it("a recording that finishes while the gallery is on screen appears first there", async () => {
    let finish: (r: Recording) => void = () => {};
    m.createRecording.mockImplementation(
      () =>
        new Promise((res) => {
          finish = (r) => {
            stored = [r, ...stored];
            res(r);
          };
        }),
    );
    openApp("/audio/speech");
    await waitFor(() => expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Eleven v3"));
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate speech" }));
    go("Audio gallery");
    await waitFor(() => expect(cardIds(screen.getByRole("region", { name: "Audio gallery" }))).toHaveLength(2));
    await act(async () => finish(rec(3)));
    await waitFor(() =>
      expect(cardIds(screen.getByRole("region", { name: "Audio gallery" }))).toEqual([rec(3).id, rec(2).id, rec(1).id]),
    );
  });

  it("a deletion on Speech drops the card from the open gallery views and lowers the model counts", async () => {
    stored = [rec(3), rec(2), rec(1, TTS)];
    openApp("/audio/gallery?view=models");
    const section = await screen.findByRole("region", { name: "Eleven v3" });
    expect(within(section).getByText("2 recordings")).toBeVisible();
    go("Audio gallery");
    await waitFor(() => expect(cardIds()).toHaveLength(3));
    go("Speech");
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Recent" }));
    const recent = await screen.findByRole("button", { name: /^Delete recording «Recording number 3/ });
    fireEvent.click(recent);
    const confirm = await screen.findByRole("dialog", { name: "Delete this recording?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    go("Audio gallery");
    await waitFor(() => expect(cardIds()).toEqual([rec(2).id, rec(1).id]));
    popTo("/audio/gallery?view=models");
    const after = await screen.findByRole("region", { name: "Eleven v3" });
    expect(within(after).getByText("1 recording")).toBeVisible();
    expect(cardIds(after)).toEqual([rec(2).id]);
  });
});

describe("AC-21 — every recording once, across deletions between pages and a new recording", () => {
  it("pages after a deletion on the first page skip nothing and repeat nothing", async () => {
    pageSize = 2;
    stored = [5, 4, 3, 2, 1].map((i) => rec(i));
    openApp("/audio/gallery");
    await waitFor(() => expect(cardIds()).toEqual([rec(5).id, rec(4).id]));
    // delete the newest from its dialog, then close back onto the grid
    fireEvent.click(within(cardOf(5)).getByText(/Recording number 5/));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Delete" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Delete this recording?" })).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() => expect(window.location.pathname).toBe(`/audio/recordings/${rec(4).id}`));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // a new recording arrives meanwhile (e.g. from Speech in another moment)
    stored = [rec(6), ...stored];
    await waitFor(() => expect(cardIds()).not.toContain(rec(5).id));
    for (let page = 0; page < 5 && !screen.queryByText("That's everything"); page++) {
      const more = await screen.findByRole("button", { name: "Load more" });
      await waitFor(() => expect(more).not.toBeDisabled());
      fireEvent.click(more);
      await waitFor(() => expect(screen.queryByText("Loading more…")).toBeNull());
    }
    await screen.findByText("That's everything");
    const ids = cardIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of [4, 3, 2, 1]) expect(ids).toContain(rec(i).id);
    expect(ids).not.toContain(rec(5).id);
  });
});
