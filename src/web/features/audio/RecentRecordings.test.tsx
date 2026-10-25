import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import type { Recording } from "../../../shared/speech";
import { RecentRecordings } from "./RecentRecordings";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { recordings: vi.fn(), deleteRecording: vi.fn() },
}));
const m = vi.mocked(api);

const rec = (i: number, over: Partial<Recording> = {}): Recording => ({
  id: `01N${String(i).padStart(23, "0")}`,
  createdAt: new Date(Date.now() - 120_000).toISOString(),
  provider: "openrouter",
  model: "elevenlabs/eleven-v3",
  modelName: "Eleven v3",
  voice: "george",
  text: `Recording number ${i}, a short test text`,
  settings: { stability: 0.5 },
  mediaType: "audio/mpeg",
  characters: 30,
  costMicros: 2400,
  costStatus: "known",
  estimateMicros: 2400,
  durationMs: 800,
  url: `/api/audio/recordings/01N${String(i).padStart(23, "0")}/file`,
  tags: [],
  comment: null,
  ...over,
});

beforeEach(() => m.recordings.mockResolvedValue({ items: [rec(2), rec(1)], nextCursor: null }));
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("Recent recordings (SCR-04)", () => {
  it("lists the ten latest with excerpt, voice, model, cost, player and download", async () => {
    renderWithQuery(<RecentRecordings draftText="" onReuse={() => {}} />);
    const items = await screen.findAllByRole("listitem");
    expect(m.recordings).toHaveBeenCalledWith(undefined, 10);
    expect(items).toHaveLength(2);
    const first = items[0] as HTMLElement;
    expect(within(first).getByRole("button", { name: /^Reuse «Recording number 2/ })).toBeVisible();
    expect(first).toHaveTextContent("George · Eleven v3 · 2 min ago");
    expect(within(first).getByText("$0.0024")).toBeVisible();
    expect(first.querySelector("audio")).toHaveAttribute("src", rec(2).url);
    expect(within(first).getByRole("link", { name: /^Download «Recording number 2/ })).toHaveAttribute(
      "href",
      `${rec(2).url}?download=1`,
    );
    expect(within(first).getByRole("button", { name: /^Delete recording «Recording number 2/ })).toBeVisible();
  });

  it("shows loading, empty and error states, with Try again", async () => {
    m.recordings.mockResolvedValueOnce({ items: [], nextCursor: null });
    const { unmount } = renderWithQuery(<RecentRecordings draftText="" onReuse={() => {}} />);
    expect(screen.getByText("Loading…")).toBeVisible();
    expect(await screen.findByText("No speech generated yet.")).toBeVisible();
    unmount();
    m.recordings.mockRejectedValueOnce(new Error("down"));
    renderWithQuery(<RecentRecordings draftText="" onReuse={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
  });

  it("refreshes every 10 s only while a cost is pending", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    m.recordings.mockResolvedValueOnce({
      items: [rec(1, { costStatus: "pending", costMicros: null })],
      nextCursor: null,
    });
    m.recordings.mockResolvedValue({ items: [rec(1)], nextCursor: null });
    renderWithQuery(<RecentRecordings draftText="" onReuse={() => {}} />);
    expect(await screen.findByText("cost pending · ≈ $0.0024")).toBeVisible();
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(await screen.findByText("$0.0024")).toBeVisible();
    const calls = m.recordings.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(m.recordings.mock.calls.length).toBe(calls); // nothing pending → no polling
  });

  it("reuses a recording at once when the form holds no different text, and asks first otherwise", async () => {
    const onReuse = vi.fn();
    const { rerender, client } = renderWithQuery(<RecentRecordings draftText="" onReuse={onReuse} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Reuse «Recording number 2/ }));
    expect(onReuse).toHaveBeenCalledWith(expect.objectContaining({ id: rec(2).id }));
    rerender(
      <QueryClientProvider client={client}>
        <RecentRecordings draftText="My unsent text" onReuse={onReuse} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Reuse «Recording number 1/ }));
    const dialog = await screen.findByRole("dialog", { name: "Replace your text?" });
    expect(within(dialog).getByRole("button", { name: "Keep mine" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep mine" }));
    expect(onReuse).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^Reuse «Recording number 1/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Replace" }));
    expect(onReuse).toHaveBeenLastCalledWith(expect.objectContaining({ id: rec(1).id }));
  });

  it("deletes after confirming, and removes the recording from the list", async () => {
    let finish: () => void = () => {};
    m.deleteRecording.mockImplementation(() => new Promise((res) => (finish = () => res(null))));
    renderWithQuery(<RecentRecordings draftText="" onReuse={() => {}} />);
    const first = (await screen.findAllByRole("listitem"))[0] as HTMLElement;
    fireEvent.click(within(first).getByRole("button", { name: /Delete recording/ }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this recording?" });
    expect(dialog).toHaveTextContent("Its audio file, tags and comment are deleted too. This can't be undone.");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    m.recordings.mockResolvedValue({ items: [rec(1)], nextCursor: null });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByText("Deleting…")).toBeVisible();
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(m.deleteRecording).toHaveBeenCalledWith(rec(2).id);
  });

  it("keeps the dialog open with a message when the deletion fails, and drops an already-deleted one quietly", async () => {
    m.deleteRecording.mockRejectedValueOnce(new ApiError(500, "STORAGE_ERROR", "Couldn't delete this recording"));
    renderWithQuery(<RecentRecordings draftText="" onReuse={() => {}} />);
    const first = (await screen.findAllByRole("listitem"))[0] as HTMLElement;
    fireEvent.click(within(first).getByRole("button", { name: /Delete recording/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByText("Couldn't delete this recording — try again")).toBeVisible();
    m.deleteRecording.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "Recording not found"));
    m.recordings.mockResolvedValue({ items: [rec(1)], nextCursor: null });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
  });
});
