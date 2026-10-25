import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import { testRecording } from "../../../../tests/helpers/testRecording";
import type { Recording, SpeechModel } from "../../../shared/speech";
import { controlsFor } from "../../../shared/speech-models";
import { SpeechPage } from "./SpeechPage";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    speechModels: vi.fn(),
    providers: vi.fn(),
    providerBalance: vi.fn(),
    recordings: vi.fn(),
    createRecording: vi.fn(),
    recording: vi.fn(),
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
  price: { unit: "per-character", usdPerChar: 0.00008 },
  controls: controlsFor("elevenlabs/eleven-v3"),
};
const R = testRecording(1, {
  text: "Reuse me from the gallery",
  voice: "sarah",
  settings: { stability: 1, similarity: 0.6, style: 0.2 },
});

const text = () => screen.getByRole("textbox", { name: "Text" });
const at = (search: string) => {
  window.history.replaceState(null, "", `/audio/speech${search}`);
  return renderWithQuery(<SpeechPage />);
};

beforeEach(() => {
  vi.resetAllMocks();
  m.speechModels.mockResolvedValue({ models: [V3], fetchedAt: "2026-10-25T10:00:00.000Z" });
  m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: true }] });
  m.providerBalance.mockResolvedValue({ provider: "openrouter", remainingUsd: 12.5 });
  m.recordings.mockResolvedValue({ items: [], nextCursor: null });
  m.recording.mockResolvedValue(R);
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("Reuse from the audio gallery (SCR-08, AC-16, AC-17)", () => {
  it("fills the form with the recording, shows it as the latest result without playing, and drops the mark", async () => {
    at(`?reuse=${R.id}`);
    await waitFor(() => expect(text()).toHaveValue("Reuse me from the gallery"));
    expect(m.recording).toHaveBeenCalledWith(R.id);
    const result = screen.getByRole("region", { name: "Latest recording" });
    expect(within(result).getByText("Sarah")).toBeVisible();
    expect(result.querySelector("audio")?.autoplay).toBe(false);
    expect(window.location.search).toBe("");
    expect(m.createRecording).not.toHaveBeenCalled();
  });

  it("waits for the model list; if it can't load, the form stays and the reuse applies after Try again", async () => {
    m.speechModels.mockRejectedValueOnce(new ApiError(502, "PROVIDER_ERROR", "down"));
    at(`?reuse=${R.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(text()).toHaveValue("Reuse me from the gallery"));
    expect(screen.queryByText(/no longer offered/)).toBeNull();
  });

  it("asks before replacing differing unsent text; Keep mine leaves the form and the result alone", async () => {
    const { unmount } = at("");
    await waitFor(() => expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Eleven v3"));
    fireEvent.change(text(), { target: { value: "My own draft" } });
    act(() => {
      window.history.pushState(null, "", `/audio/speech?reuse=${R.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const ask = await screen.findByRole("dialog", { name: "Replace your text?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Keep mine" }));
    expect(text()).toHaveValue("My own draft");
    expect(screen.queryByRole("region", { name: "Latest recording" })).toBeNull();
    unmount();
  });

  it("a retired model keeps the current model with the notice, filling the rest", async () => {
    m.recording.mockResolvedValue({ ...R, model: "retired/model", modelName: "Retired" });
    at(`?reuse=${R.id}`);
    await waitFor(() => expect(text()).toHaveValue("Reuse me from the gallery"));
    expect(screen.getByText("Retired is no longer offered — kept Eleven v3")).toBeVisible();
  });

  it("a deleted recording says so and changes nothing", async () => {
    m.recording.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Recording not found"));
    at(`?reuse=${R.id}`);
    expect(await screen.findByText("This recording no longer exists.")).toBeVisible();
    expect(text()).toHaveValue("");
  });

  it("while a recording is generating, reuse is not applied and the page says to wait", async () => {
    let finish: (r: Recording) => void = () => {};
    m.createRecording.mockImplementation(() => new Promise((res) => (finish = res)));
    at("");
    await waitFor(() => expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Eleven v3"));
    fireEvent.change(text(), { target: { value: "Being generated" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate speech" }));
    await screen.findByText("Generating…");
    act(() => {
      window.history.pushState(null, "", `/audio/speech?reuse=${R.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByText("Wait for the current recording to finish, then reuse.")).toBeVisible();
    expect(text()).toHaveValue("Being generated");
    await act(async () => finish(testRecording(9)));
  });

  it("ignores the image gallery's reuse address while it stays mounted elsewhere (review R1)", async () => {
    at("");
    await waitFor(() => expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Eleven v3"));
    act(() => {
      window.history.pushState(null, "", "/?reuse=01G00000000000000000000001&output=1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => {});
    expect(m.recording).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?reuse=01G00000000000000000000001&output=1");
    expect(screen.queryByText("This recording no longer exists.")).toBeNull();
  });
});
