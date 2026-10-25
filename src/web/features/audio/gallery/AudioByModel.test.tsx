import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import { testRecording as rec } from "../../../../../tests/helpers/testRecording";
import { AudioGalleryPage } from "./AudioGallery";
import { audioDialogViews } from "./audioGalleryView";
import { resetAudioGallery } from "./useAudioGalleryView";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { recordings: vi.fn(), recording: vi.fn(), recordingModels: vi.fn() },
}));
const m = vi.mocked(api);

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  resetAudioGallery();
  window.history.replaceState(null, "", "/");
});

describe("audio «By model» (SCR-03, AC-14)", () => {
  it("shows a section per model with its name, count, four latest cards and Show all N", async () => {
    m.recordingModels.mockResolvedValue({
      models: [
        {
          provider: "openrouter",
          model: "a/one",
          modelName: "One",
          count: 5,
          latestId: rec(6).id,
          items: [rec(6), rec(5), rec(4), rec(3)],
        },
        {
          provider: "openrouter",
          model: "retired/x",
          modelName: "Retired X",
          count: 1,
          latestId: rec(1).id,
          items: [rec(1)],
        },
      ],
    });
    window.history.replaceState(null, "", "/audio/gallery?view=models");
    renderWithQuery(<AudioGalleryPage />);
    const one = await screen.findByRole("region", { name: "One" });
    expect(within(one).getByText("5 recordings")).toBeVisible();
    expect(one.querySelectorAll("[data-recording-id]")).toHaveLength(4);
    expect(within(one).getByRole("link", { name: "Show all 5" })).toHaveAttribute(
      "href",
      "/audio/gallery?model=a%2Fone",
    );
    expect(screen.getByRole("region", { name: "Retired X" })).toBeVisible();
    expect(m.recordingModels).toHaveBeenCalledWith(4);
    // a card opened from a section steps through that model's recordings, the «By model» view behind it
    fireEvent.click(within(one).getByText(/Recording number 6/));
    expect(audioDialogViews(window.history.state)).toEqual({
      grid: { kind: "models" },
      order: { kind: "model", model: "a/one" },
    });
  });

  it("says when the models can't be read, with Try again; and when there are none", async () => {
    m.recordingModels.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ models: [] });
    window.history.replaceState(null, "", "/audio/gallery?view=models");
    renderWithQuery(<AudioGalleryPage />);
    expect(await screen.findByText("Couldn't load the models.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No recordings yet.")).toBeVisible();
  });
});
