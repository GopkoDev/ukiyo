import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import { testRecording as rec } from "../../../../../tests/helpers/testRecording";
import type { Recording, SpeechModel } from "../../../../shared/speech";
import { controlsFor } from "../../../../shared/speech-models";
import { resetAudioGallery } from "./useAudioGalleryView";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    health: vi.fn(),
    providers: vi.fn(),
    currentJob: vi.fn(),
    generations: vi.fn(),
    speechModels: vi.fn(),
    speechCredits: vi.fn(),
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

let stored: Recording[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  stored = [rec(2), rec(1)];
  m.health.mockResolvedValue({ status: "ok" });
  m.providers.mockResolvedValue({ providers: [] });
  m.currentJob.mockResolvedValue({ job: null });
  m.generations.mockResolvedValue({ items: [], nextCursor: null });
  m.speechModels.mockResolvedValue({ models: [V3], fetchedAt: "2026-10-25T10:00:00.000Z" });
  m.speechCredits.mockResolvedValue({ remainingUsd: 1 });
  m.recordingModels.mockResolvedValue({ models: [] });
  m.recordings.mockImplementation(async () => ({ items: [...stored], nextCursor: null }));
  m.recording.mockImplementation(async (id) => stored.find((r) => r.id === id) ?? rec(0));
  m.deleteRecording.mockImplementation(async (id) => {
    stored = stored.filter((r) => r.id !== id);
    return null;
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => {
  resetAudioGallery();
  window.history.replaceState(null, "", "/");
});

const nav = () => screen.getByRole("navigation", { name: "Sections" });
const go = (name: string) => fireEvent.click(within(nav()).getByRole("link", { name }));
const cards = () =>
  [...document.querySelectorAll("[data-recording-id]")].map((c) => c.getAttribute("data-recording-id"));

describe("Speech ↔ audio gallery (AC-18)", () => {
  it("a recording generated on Speech is first in the gallery", async () => {
    m.createRecording.mockImplementation(async () => {
      const r = rec(3);
      stored = [r, ...stored];
      return r;
    });
    window.history.replaceState(null, "", "/audio/gallery");
    renderWithQuery(<App />);
    await screen.findByText(/Recording number 2/);
    go("Speech");
    await waitFor(() => expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Eleven v3"));
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate speech" }));
    await screen.findByRole("region", { name: "Latest recording" });
    go("Audio gallery");
    await waitFor(() => expect(cards()[0]).toBe(rec(3).id));
  });

  it("deleting in the gallery drops the recording from Speech's latest result and recent list", async () => {
    m.createRecording.mockImplementation(async () => {
      const r = rec(3);
      stored = [r, ...stored];
      return r;
    });
    window.history.replaceState(null, "", "/audio/speech");
    renderWithQuery(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Eleven v3"));
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate speech" }));
    await screen.findByRole("region", { name: "Latest recording" });
    go("Audio gallery");
    fireEvent.click(await screen.findByText(/Recording number 3/));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this recording?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(cards()).not.toContain(rec(3).id));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    go("Speech");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Latest recording" })).toBeNull());
  });

  it("Reuse from the dialog lands on Speech; Back returns to the grid, not the dialog", async () => {
    window.history.replaceState(null, "", "/audio/gallery");
    renderWithQuery(<App />);
    fireEvent.click(await screen.findByText(/Recording number 2/));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: /Reuse/ }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Text" })).toHaveValue(rec(2).text));
    expect(window.location.pathname).toBe("/audio/speech");
    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(window.location.pathname).toBe("/audio/gallery"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stepping reads each recording once; an already read one costs no request", async () => {
    stored = [rec(3), rec(2), rec(1)];
    window.history.replaceState(null, "", "/audio/gallery");
    renderWithQuery(<App />);
    fireEvent.click(await screen.findByText(/Recording number 3/));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("button", { name: "Delete" });
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    await waitFor(() => expect(window.location.pathname).toBe(`/audio/recordings/${rec(2).id}`));
    await within(screen.getByRole("dialog")).findByRole("button", { name: "Delete" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    await waitFor(() => expect(window.location.pathname).toBe(`/audio/recordings/${rec(3).id}`));
    expect(m.recording.mock.calls.map(([id]) => id)).toEqual([rec(3).id, rec(2).id]);
    expect(m.recordings).toHaveBeenCalledTimes(1);
  });
});
