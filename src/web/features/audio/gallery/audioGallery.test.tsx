import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { ApiError, api } from "@/lib/api";
import { isDialogVisit, useRoute } from "@/lib/router";
import { renderWithQuery } from "@/test-utils";
import { intersectAll } from "../../../../../tests/helpers/intersection";
import { AudioGalleryPage } from "./AudioGallery";
import { testRecording as rec } from "./testRecording";
import { resetAudioGallery } from "./useAudioGalleryView";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    health: vi.fn(),
    providers: vi.fn(),
    currentJob: vi.fn(),
    recordings: vi.fn(),
    recording: vi.fn(),
    recordingModels: vi.fn(),
  },
}));
const m = vi.mocked(api);

const GROUPS = {
  models: [
    {
      provider: "openrouter",
      model: "elevenlabs/eleven-v3",
      modelName: "Eleven v3",
      count: 2,
      latestId: rec(3).id,
      items: [],
    },
    { provider: "openrouter", model: "openai/tts", modelName: "OpenAI TTS", count: 1, latestId: rec(2).id, items: [] },
  ],
};

function at(path: string) {
  window.history.replaceState(null, "", path);
  return renderWithQuery(<AudioGalleryPage />);
}

beforeEach(() => {
  vi.resetAllMocks();
  m.recordingModels.mockResolvedValue(GROUPS);
});
afterEach(() => {
  resetAudioGallery();
  window.history.replaceState(null, "", "/");
});

describe("audio gallery grid (SCR-02)", () => {
  it("shows a card per recording: voice, time, two-line text, player loading nothing, cost, duration, model, settings, tags, comment marker", async () => {
    m.recordings.mockResolvedValue({
      items: [
        rec(2, {
          tags: ["a", "b", "c", "d"],
          comment: { body: "x", updatedAt: "2026-10-25T10:00:00.000Z" },
          settings: { speed: 1.1, stability: 0.5, speakerBoost: true, instructions: "warm" },
          costStatus: "pending",
          costMicros: null,
          estimateMicros: 1600,
        }),
        rec(1),
      ],
      nextCursor: null,
    });
    m.recording.mockResolvedValue(rec(2, { costStatus: "pending", costMicros: null, estimateMicros: 1600 }));
    at("/audio/gallery");
    const card = (await screen.findByText(/Recording number 2/)).closest("[data-recording-id]") as HTMLElement;
    const c = within(card);
    expect(c.getByText("George")).toBeVisible();
    expect(c.getByText(/Recording number 2/)).toHaveClass("line-clamp-2");
    const player = card.querySelector("audio");
    expect(player).toHaveAttribute("preload", "none");
    expect(c.getByText("cost pending · ≈ $0.0016")).toBeVisible();
    expect(c.getByText("800 ms")).toBeVisible();
    expect(c.getByText("Eleven v3")).toBeVisible();
    const settings = within(c.getByRole("list", { name: "Settings" }));
    for (const l of ["speed 1.1", "stability 0.5", "speaker boost", "instructions"])
      expect(settings.getByText(l)).toBeVisible();
    expect(c.getByText("+1")).toBeVisible();
    expect(c.getByRole("img", { name: "Has a comment" })).toBeVisible();
    expect(screen.getByText("That's everything")).toBeVisible();
  });

  it("pages with Load more and the sentinel; a failed next page offers Try again without retrying", async () => {
    m.recordings
      .mockResolvedValueOnce({ items: [rec(3), rec(2)], nextCursor: rec(2).id })
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ items: [rec(1)], nextCursor: null });
    at("/audio/gallery");
    await screen.findByText(/Recording number 3/);
    expect(m.recordings).toHaveBeenCalledWith(undefined, 24, undefined);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Couldn't load more.")).toBeVisible();
    expect(m.recordings).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Recording number 1/)).toBeVisible();
    expect(m.recordings).toHaveBeenLastCalledWith(rec(2).id, 24, undefined);
    expect(screen.getByText("That's everything")).toBeVisible();
  });

  it("loads the next page when the sentinel comes into view", async () => {
    m.recordings
      .mockResolvedValueOnce({ items: [rec(3)], nextCursor: rec(3).id })
      .mockResolvedValueOnce({ items: [rec(2)], nextCursor: null });
    at("/audio/gallery");
    await screen.findByText(/Recording number 3/);
    act(() => intersectAll());
    expect(await screen.findByText(/Recording number 2/)).toBeVisible();
  });

  it("says when the gallery can't be read, and when there is nothing yet", async () => {
    m.recordings.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ items: [], nextCursor: null });
    at("/audio/gallery");
    expect(await screen.findByText("Couldn't load the gallery")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No recordings yet.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to Speech" })).toHaveAttribute("href", "/audio/speech");
  });

  it("a player that can't play says Audio unavailable and keeps the card's details", async () => {
    m.recordings.mockResolvedValue({ items: [rec(1)], nextCursor: null });
    at("/audio/gallery");
    const card = (await screen.findByText(/Recording number 1/)).closest("[data-recording-id]") as HTMLElement;
    fireEvent.error(card.querySelector("audio") as HTMLAudioElement);
    expect(within(card).getByText("Audio unavailable")).toBeVisible();
    expect(within(card).getByText("Eleven v3")).toBeVisible();
  });

  it("a pending card reads only its own recording and settles in place, without re-reading the page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const pending = rec(1, { costStatus: "pending", costMicros: null, estimateMicros: 1600 });
      m.recordings.mockResolvedValue({ items: [rec(2), pending], nextCursor: null });
      m.recording
        .mockResolvedValueOnce(pending)
        .mockResolvedValue({ ...pending, costStatus: "known", costMicros: 1500 });
      at("/audio/gallery");
      await screen.findByText("cost pending · ≈ $0.0016");
      await act(async () => vi.advanceTimersByTimeAsync(10_500));
      expect(await screen.findByText("$0.0015")).toBeVisible();
      expect(m.recording).toHaveBeenCalledWith(pending.id);
      expect(m.recording.mock.calls.every(([id]) => id === pending.id)).toBe(true);
      expect(m.recordings).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("one model (AC-13, AC-15)", () => {
  it("lists models by their newest recording with counts; choosing one shows its grid with a heading", async () => {
    m.recordings.mockResolvedValue({ items: [rec(3), rec(1)], nextCursor: null });
    at("/audio/gallery");
    await screen.findByText(/Recording number 3/);
    fireEvent.click(screen.getByRole("button", { name: "Choose a model" }));
    const options = await screen.findAllByRole("button", { name: /Eleven v3|OpenAI TTS/ });
    expect(options.map((o) => o.textContent)).toEqual(["Eleven v3elevenlabs/eleven-v32", "OpenAI TTSopenai/tts1"]);
    fireEvent.click(options[0] as HTMLElement);
    expect(window.location.search).toBe("?model=elevenlabs%2Feleven-v3");
    expect(await screen.findByRole("heading", { name: "Eleven v3 · 2 recordings" })).toBeVisible();
    expect(m.recordings).toHaveBeenLastCalledWith(undefined, 24, { model: "elevenlabs/eleven-v3" });
    fireEvent.click(screen.getByRole("button", { name: "Show all recordings" }));
    expect(window.location.search).toBe("");
  });

  it("says there are no recordings with a model that has none", async () => {
    m.recordings.mockResolvedValue({ items: [], nextCursor: null });
    at("/audio/gallery?model=gone%2Fmodel");
    expect(await screen.findByText("No recordings with gone/model.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Show all recordings" })).toBeVisible();
  });

  it("says when the model choice can't be read, with Try again", async () => {
    m.recordings.mockResolvedValue({ items: [rec(1)], nextCursor: null });
    m.recordingModels.mockRejectedValueOnce(new ApiError(500, "HTTP_ERROR", "down"));
    at("/audio/gallery");
    await screen.findByText(/Recording number 1/);
    fireEvent.click(screen.getByRole("button", { name: "Choose a model" }));
    expect(await screen.findByText("Couldn't load your models.")).toBeVisible();
  });
});

describe("in the app (AC-01)", () => {
  it("lists Speech then Gallery in the Audio group; a card click opens a dialog visit over the grid", async () => {
    m.health.mockResolvedValue({ status: "ok" });
    m.providers.mockResolvedValue({ providers: [] });
    m.currentJob.mockResolvedValue({ job: null });
    m.recordings.mockResolvedValue({ items: [rec(1)], nextCursor: null });
    m.recording.mockResolvedValue(rec(1));
    window.history.replaceState(null, "", "/audio/gallery");
    let route: ReturnType<typeof useRoute> | undefined;
    function Spy() {
      route = useRoute();
      return null;
    }
    renderWithQuery(
      <>
        <App />
        <Spy />
      </>,
    );
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const audio = within(nav).getByText("Audio").closest("[data-sidebar='group']") as HTMLElement;
    expect(
      within(audio)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Speech", "Gallery"]);
    expect(within(audio).getByRole("link", { name: "Audio gallery" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(await screen.findByText(/Recording number 1/));
    await waitFor(() => expect(route && isDialogVisit(route)).toBe(true));
    expect(window.location.pathname).toBe(`/audio/recordings/${rec(1).id}`);
  });
});
