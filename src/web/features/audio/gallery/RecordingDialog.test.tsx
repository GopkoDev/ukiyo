import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { ApiError, api } from "@/lib/api";
import { mediaDialogState } from "@/lib/router";
import { renderWithQuery } from "@/test-utils";
import { testRecording as rec } from "../../../../../tests/helpers/testRecording";
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
    setRecordingComment: vi.fn(),
    addRecordingTag: vi.fn(),
    removeRecordingTag: vi.fn(),
    deleteRecording: vi.fn(),
  },
}));
const m = vi.mocked(api);
const ALL = { grid: { kind: "all" }, order: { kind: "all" } } as const;

const byId = new Map(
  [3, 2, 1].map((i) => [rec(i).id, rec(i, { settings: { stability: 0.5, instructions: "Speak warmly, slowly" } })]),
);

beforeEach(() => {
  vi.resetAllMocks();
  m.health.mockResolvedValue({ status: "ok" });
  m.providers.mockResolvedValue({ providers: [] });
  m.currentJob.mockResolvedValue({ job: null });
  m.recordingModels.mockResolvedValue({ models: [] });
  m.recordings.mockImplementation(async () => ({ items: [...byId.values()], nextCursor: null }));
  m.recording.mockImplementation(async (id) => {
    const r = byId.get(id);
    if (!r) throw new ApiError(404, "NOT_FOUND", "Recording not found");
    return r;
  });
});
afterEach(() => {
  resetAudioGallery();
  window.history.replaceState(null, "", "/");
});

async function openFromGrid(i: number) {
  window.history.replaceState(null, "", "/audio/gallery");
  renderWithQuery(<App />);
  fireEvent.click(await screen.findByText(new RegExp(`Recording number ${i}`)));
  return screen.findByRole("dialog");
}

describe("recording dialog (SCR-04, AC-05, AC-09)", () => {
  it("shows the recording's details and steps through the loaded order with buttons and arrow keys", async () => {
    const dialog = await openFromGrid(2);
    const d = within(dialog);
    expect(await d.findByText("Speak warmly, slowly")).toBeVisible();
    expect(d.getAllByText("Recording number 2, a short test text").length).toBeGreaterThan(0);
    expect(d.getByText("MP3")).toBeVisible();
    expect(d.getByRole("link", { name: "Download" })).toHaveAttribute("href", `${rec(2).url}?download=1`);
    expect(window.location.pathname).toBe(`/audio/recordings/${rec(2).id}`);
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    await waitFor(() => expect(window.location.pathname).toBe(`/audio/recordings/${rec(1).id}`));
    fireEvent.click(d.getByRole("button", { name: /Newer/ }));
    await waitFor(() => expect(window.location.pathname).toBe(`/audio/recordings/${rec(2).id}`));
  });

  it("blocks stepping while a tag is typed; arrows on the player never step", async () => {
    const dialog = await openFromGrid(2);
    const d = within(dialog);
    const tag = await d.findByLabelText("Add a tag");
    fireEvent.change(tag, { target: { value: "half typed" } });
    expect(d.getByRole("button", { name: /Older/ })).toBeDisabled();
    fireEvent.change(tag, { target: { value: "" } });
    fireEvent.keyDown(dialog.querySelector("audio") as HTMLAudioElement, { key: "ArrowRight" });
    expect(window.location.pathname).toBe(`/audio/recordings/${rec(2).id}`);
  });

  it("adds a tag and saves a comment; the card shows both without a list read", async () => {
    m.addRecordingTag.mockResolvedValue({ tags: ["intro"] });
    m.setRecordingComment.mockResolvedValue({ comment: { body: "keep", updatedAt: "2026-10-25T10:00:00.000Z" } });
    const dialog = await openFromGrid(2);
    const d = within(dialog);
    fireEvent.change(await d.findByLabelText("Add a tag"), { target: { value: "Intro" } });
    fireEvent.keyDown(d.getByLabelText("Add a tag"), { key: "Enter" });
    fireEvent.click(await d.findByRole("button", { name: "Add comment" }));
    fireEvent.change(d.getByLabelText("Comment"), { target: { value: "keep" } });
    fireEvent.click(d.getByRole("button", { name: "Save" }));
    expect(await d.findByTestId("comment-text")).toHaveTextContent("keep");
    expect(m.addRecordingTag).toHaveBeenCalledWith(rec(2).id, "Intro");
    const card = document.querySelector(`[data-recording-id="${rec(2).id}"]`) as HTMLElement;
    expect(within(card).getByText("intro")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "Has a comment", hidden: true })).toBeInTheDocument();
    expect(m.recordings).toHaveBeenCalledTimes(1);
  });

  it("deletes and moves to the older neighbour with «Recording deleted.»; the card leaves the grid", async () => {
    m.deleteRecording.mockResolvedValue(null);
    const dialog = await openFromGrid(2);
    fireEvent.click(await within(dialog).findByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this recording?" });
    expect(within(confirm).getByText(/Its audio file, tags and comment are deleted too/)).toBeVisible();
    const kept = byId.get(rec(2).id);
    byId.delete(rec(2).id);
    try {
      fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(window.location.pathname).toBe(`/audio/recordings/${rec(1).id}`));
      expect(await screen.findByRole("status")).toHaveTextContent("Recording deleted.");
      await waitFor(() => expect(document.querySelector(`[data-recording-id="${rec(2).id}"]`)).toBeNull());
    } finally {
      if (kept) byId.set(rec(2).id, kept);
    }
  });

  it("a failed deletion keeps the recording and says so", async () => {
    m.deleteRecording.mockRejectedValue(new ApiError(500, "STORAGE_ERROR", "Couldn't delete this recording"));
    const dialog = await openFromGrid(2);
    fireEvent.click(await within(dialog).findByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this recording?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Couldn't delete this recording/)).toBeVisible();
    expect(window.location.pathname).toBe(`/audio/recordings/${rec(2).id}`);
  });
});

describe("recording page (SCR-05, AC-06)", () => {
  it("shows the recording on its own page with a way back to the gallery", async () => {
    window.history.replaceState(null, "", `/audio/recordings/${rec(3).id}`);
    renderWithQuery(<App />);
    expect(await screen.findByText("Speak warmly, slowly")).toBeVisible();
    const main = screen.getByText("Speak warmly, slowly").closest("main, [data-slot='sidebar-inset']") as HTMLElement;
    // the breadcrumb and the page's own «← Gallery» both lead to the audio gallery's All view
    const back = within(main).getAllByRole("link", { name: "Gallery" });
    expect(back.map((l) => l.getAttribute("href"))).toEqual(["/audio/gallery", "/audio/gallery"]);
    expect(screen.queryByRole("button", { name: /Older/ })).toBeNull();
  });

  it("says a recording no longer exists, and when it can't be read", async () => {
    window.history.replaceState(null, "", "/audio/recordings/01R99999999999999999999999");
    renderWithQuery(<App />);
    expect(await screen.findByText("This recording no longer exists.")).toBeVisible();
  });

  it("a dialog state from this load opens the dialog over the grid, not the page", async () => {
    window.history.replaceState(mediaDialogState("audio-gallery", ALL), "", `/audio/recordings/${rec(1).id}`);
    renderWithQuery(<App />);
    expect(await screen.findByRole("dialog")).toBeVisible();
    await act(async () => {});
  });
});
