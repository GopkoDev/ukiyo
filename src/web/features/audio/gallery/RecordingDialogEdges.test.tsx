import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { ApiError, api } from "@/lib/api";
import { mediaDialogState } from "@/lib/router";
import { renderWithQuery } from "@/test-utils";
import { testRecording as rec } from "../../../../../tests/helpers/testRecording";
import type { Recording } from "../../../../shared/speech";
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

let stored: Recording[] = [];
const groups = () => {
  const by = new Map<string, Recording[]>();
  for (const r of stored) by.set(r.model, [...(by.get(r.model) ?? []), r]);
  return {
    models: [...by.entries()].map(([model, items]) => ({
      provider: "openrouter",
      model,
      modelName: items[0]?.modelName ?? model,
      count: items.length,
      latestId: items[0]?.id ?? "",
      items: items.slice(0, 4),
    })),
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  stored = [rec(3, { model: "a/one", modelName: "One" }), rec(2), rec(1, { model: "a/one", modelName: "One" })];
  m.health.mockResolvedValue({ status: "ok" });
  m.providers.mockResolvedValue({ providers: [] });
  m.currentJob.mockResolvedValue({ job: null });
  m.recordingModels.mockImplementation(async () => groups());
  m.recordings.mockImplementation(async (_c, _l, filter) => ({
    items: stored.filter((r) => !filter || !("model" in filter) || r.model === filter.model),
    nextCursor: null,
  }));
  m.recording.mockImplementation(async (id) => {
    const r = stored.find((x) => x.id === id);
    if (!r) throw new ApiError(404, "NOT_FOUND", "Recording not found");
    return r;
  });
  m.deleteRecording.mockImplementation(async (id) => {
    stored = stored.filter((r) => r.id !== id);
    return null;
  });
});
afterEach(() => {
  resetAudioGallery();
  window.history.replaceState(null, "", "/");
});

const open = async (path: string, text: RegExp) => {
  window.history.replaceState(null, "", path);
  renderWithQuery(<App />);
  fireEvent.click(await screen.findByText(text));
  const d = await screen.findByRole("dialog");
  await within(d).findByRole("button", { name: "Delete" });
  return d;
};
const deleteIn = async (dialog: HTMLElement) => {
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  const confirm = await screen.findByRole("dialog", { name: "Delete this recording?" });
  fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
};

describe("dialog edges (AC-05, AC-06, AC-09)", () => {
  it("shows the estimate beside a known cost", async () => {
    const d = await open("/audio/gallery", /Recording number 2/);
    expect(within(d).getByText("≈ $0.0024 (before generating)")).toBeVisible();
  });

  it("an open delete confirmation blocks stepping, and Esc closes it before the dialog", async () => {
    const d = await open("/audio/gallery", /Recording number 2/);
    fireEvent.click(within(d).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this recording?" });
    fireEvent.keyDown(confirm, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete this recording?" })).toBeNull());
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(window.location.pathname).toBe(`/audio/recordings/${rec(2).id}`);
  });

  it("an unsaved comment edit blocks stepping; Esc cancels the edit first; arrows in the tag field never step", async () => {
    const d = await open("/audio/gallery", /Recording number 2/);
    fireEvent.click(within(d).getByRole("button", { name: "Add comment" }));
    fireEvent.change(within(d).getByLabelText("Comment"), { target: { value: "draft" } });
    expect(within(d).getByRole("button", { name: /Older/ })).toBeDisabled();
    fireEvent.keyDown(within(d).getByLabelText("Comment"), { key: "Escape" });
    await waitFor(() => expect(within(d).queryByLabelText("Comment")).toBeNull());
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.keyDown(within(d).getByLabelText("Add a tag"), { key: "ArrowRight" });
    expect(window.location.pathname).toBe(`/audio/recordings/${rec(2).id}`);
  });

  it("a recording that can't be read says so with Try again, in the dialog and on the page", async () => {
    m.recording.mockRejectedValue(new ApiError(500, "HTTP_ERROR", "down"));
    window.history.replaceState(
      mediaDialogState("audio-gallery", { grid: { kind: "all" }, order: { kind: "all" } }),
      "",
      `/audio/recordings/${rec(2).id}`,
    );
    const { unmount } = renderWithQuery(<App />);
    const d = await screen.findByRole("dialog");
    expect(await within(d).findByText("Couldn't load this recording")).toBeVisible();
    expect(within(d).getByRole("button", { name: "Try again" })).toBeVisible();
    unmount();
    window.history.replaceState(null, "", `/audio/recordings/${rec(2).id}`);
    renderWithQuery(<App />);
    expect(await screen.findByText("Couldn't load this recording")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("the dialog says a recording no longer exists", async () => {
    window.history.replaceState(
      mediaDialogState("audio-gallery", { grid: { kind: "all" }, order: { kind: "all" } }),
      "",
      "/audio/recordings/01R99999999999999999999999",
    );
    renderWithQuery(<App />);
    expect(
      await within(await screen.findByRole("dialog")).findByText("This recording no longer exists."),
    ).toBeVisible();
  });
});

describe("deleting (AC-11, AC-12, AC-14, AC-15, AC-21)", () => {
  it("with no neighbour left the dialog closes onto the grid with the notice", async () => {
    stored = [rec(1)];
    const d = await open("/audio/gallery", /Recording number 1/);
    await deleteIn(d);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Recording deleted.")).toBeVisible();
    expect(screen.getByText("No recordings yet.")).toBeVisible();
  });

  it("from the recording page it lands on the gallery with the notice", async () => {
    window.history.replaceState(null, "", `/audio/recordings/${rec(2).id}`);
    renderWithQuery(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete this recording?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(window.location.pathname).toBe("/audio/gallery"));
    expect(await screen.findByText("Recording deleted.")).toBeVisible();
  });

  it("on the page, a recording already deleted elsewhere says it no longer exists", async () => {
    window.history.replaceState(null, "", `/audio/recordings/${rec(2).id}`);
    renderWithQuery(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    stored = stored.filter((r) => r.id !== rec(2).id);
    m.deleteRecording.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "Recording not found"));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Delete this recording?" })).getByRole("button", {
        name: "Delete",
      }),
    );
    expect(await screen.findByText("This recording no longer exists.")).toBeVisible();
    expect(window.location.pathname).toBe(`/audio/recordings/${rec(2).id}`);
  });

  it("from a model's grid, stepping stays within the model and deleting its last recording closes onto «No recordings with»", async () => {
    const d = await open("/audio/gallery?model=a%2Fone", /Recording number 3/);
    fireEvent.keyDown(d, { key: "ArrowRight" });
    await waitFor(() => expect(window.location.pathname).toBe(`/audio/recordings/${rec(1).id}`)); // skips rec(2), another model
    await within(screen.getByRole("dialog")).findByRole("button", { name: "Delete" });
    await deleteIn(screen.getByRole("dialog")); // rec(1) → its newer neighbour rec(3) shows
    await waitFor(() => expect(window.location.pathname).toBe(`/audio/recordings/${rec(3).id}`));
    await within(screen.getByRole("dialog")).findByRole("button", { name: "Delete" });
    await deleteIn(screen.getByRole("dialog")); // the model's last one: no neighbour left
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("No recordings with One.")).toBeVisible();
  });

  it("from «By model», deleting a model's last recording drops its section and shows the notice", async () => {
    stored = [rec(2), rec(1, { model: "a/one", modelName: "One" })];
    window.history.replaceState(null, "", "/audio/gallery?view=models");
    renderWithQuery(<App />);
    const section = await screen.findByRole("region", { name: "One" });
    fireEvent.click(within(section).getByText(/Recording number 1/));
    const d = await screen.findByRole("dialog");
    await within(d).findByRole("button", { name: "Delete" });
    await deleteIn(d);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("region", { name: "One" })).toBeNull());
    expect(screen.getByText("Recording deleted.")).toBeVisible();
  });
});
