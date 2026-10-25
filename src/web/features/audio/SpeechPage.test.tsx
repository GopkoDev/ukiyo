import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Boxes } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { ApiError, api } from "@/lib/api";
import { SECTIONS, type Section } from "@/sections";
import { renderWithQuery } from "@/test-utils";
import type { Recording, SpeechModel } from "../../../shared/speech";
import { controlsFor } from "../../../shared/speech-models";
import { SpeechPage } from "./SpeechPage";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    health: vi.fn(async () => ({ status: "ok" })),
    speechModels: vi.fn(),
    speechCredits: vi.fn(),
    recordings: vi.fn(),
    createRecording: vi.fn(),
    deleteRecording: vi.fn(),
    recording: vi.fn(),
  },
}));
const m = vi.mocked(api);

const model = (over: Partial<SpeechModel> & { id: string }): SpeechModel => ({
  name: over.id,
  maker: "ElevenLabs",
  maxChars: 5000,
  maxCharsSource: "family",
  voiceMode: "required",
  voices: ["george", "sarah"],
  price: { unit: "per-character", usdPerChar: 0.00008 },
  controls: controlsFor(over.id),
  ...over,
});
const V3 = model({ id: "elevenlabs/eleven-v3", name: "Eleven v3" });
const FLASH = model({ id: "elevenlabs/eleven-flash-v2", name: "Flash v2" });
const OPENAI = model({ id: "openai/tts-1", name: "TTS 1", maker: "OpenAI", voices: ["alloy"] });
const FISH = model({ id: "fish-audio/s1", name: "S1", maker: "Fish Audio", voiceMode: "optional", voices: [] });

const recording = (over: Partial<Recording> = {}): Recording => ({
  id: "01N0000000000000000000000A",
  createdAt: new Date().toISOString(),
  provider: "openrouter",
  model: V3.id,
  modelName: "Eleven v3",
  voice: "george",
  text: "Hello there",
  settings: { stability: 0.5, similarity: 0.75, style: 0 },
  mediaType: "audio/mpeg",
  characters: 11,
  costMicros: null,
  costStatus: "pending",
  estimateMicros: 880,
  durationMs: 900,
  url: "/api/audio/recordings/01N0000000000000000000000A/file",
  ...over,
});

beforeEach(() => {
  m.speechModels.mockResolvedValue({ models: [V3, FISH], fetchedAt: "2026-10-25T10:00:00.000Z" });
  m.speechCredits.mockResolvedValue({ remainingUsd: 12.5 });
  m.recordings.mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

const text = () => screen.getByRole("textbox", { name: "Text" });
const generate = () => screen.getByRole("button", { name: /Generate speech|Generating…/ });

/** The model trigger is named by its label («Model»); its text is the chosen model. */
const modelButton = () => screen.getByRole("button", { name: "Model" });
async function loaded(name = "Eleven v3") {
  await waitFor(() => expect(modelButton()).toHaveTextContent(name));
}
async function ready() {
  renderWithQuery(<SpeechPage />);
  await loaded();
}

describe("Speech page — compose (SCR-02)", () => {
  it("counts billed characters against the model's limit and shows the estimate and the balance", async () => {
    await ready();
    expect(generate()).toBeDisabled(); // nothing typed
    fireEvent.change(text(), { target: { value: "  Hello there  " } });
    expect(screen.getByText("11 / 5 000 characters")).toBeVisible();
    expect(screen.getByText("≈ $0.00088")).toBeVisible();
    expect(await screen.findByText("$12.50")).toBeVisible();
    expect(generate()).toBeEnabled();
  });

  it("blocks text over the limit and blank text, with the counter in the warning colour", async () => {
    await ready();
    fireEvent.change(text(), { target: { value: "a".repeat(5001) } });
    const counter = screen.getByText("5 001 / 5 000 characters");
    expect(counter).toHaveClass("text-destructive");
    expect(generate()).toBeDisabled();
    fireEvent.change(text(), { target: { value: "   \n " } });
    expect(generate()).toBeDisabled();
  });

  it("says how to configure OpenRouter and disables generating when it isn't configured", async () => {
    m.speechCredits.mockRejectedValue(new ApiError(409, "PROVIDER_NOT_CONFIGURED", "not configured"));
    await ready();
    fireEvent.change(text(), { target: { value: "Hi" } });
    expect(
      await screen.findByText(/Speech needs OpenRouter — set OPENROUTER_API_KEY in .env.local and restart the server/),
    ).toBeVisible();
    expect(generate()).toBeDisabled();
  });

  it("offers Try again when the models can't be loaded", async () => {
    m.speechModels.mockRejectedValueOnce(new ApiError(502, "PROVIDER_ERROR", "down"));
    renderWithQuery(<SpeechPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await loaded();
  });

  it("labels the limit when the catalog published none", async () => {
    m.speechModels.mockResolvedValue({
      models: [
        model({ id: "deepgram/aura-2", name: "Aura 2", maker: "Deepgram", maxCharsSource: "default", controls: [] }),
      ],
      fetchedAt: "x",
    });
    renderWithQuery(<SpeechPage />);
    await loaded("Aura 2");
    expect(screen.getByText(/0 \/ 5 000 characters · limit not published/)).toBeVisible();
  });
});

describe("Speech page — generate", () => {
  it("sends one request with the model's accepted settings and shows the result with its cost and download", async () => {
    let finish: (r: Recording) => void = () => {};
    m.createRecording.mockImplementation(() => new Promise((res) => (finish = res)));
    await ready();
    fireEvent.change(text(), { target: { value: "Hello there" } });
    fireEvent.click(generate());
    fireEvent.click(generate());
    await waitFor(() => expect(generate()).toHaveTextContent("Generating…"));
    expect(generate()).toBeDisabled();
    expect(m.createRecording).toHaveBeenCalledTimes(1);
    expect(m.createRecording).toHaveBeenCalledWith({
      text: "Hello there",
      model: "elevenlabs/eleven-v3",
      voice: "george",
      settings: { stability: 0.5, similarity: 0.75, style: 0 },
    });
    await act(async () => finish(recording()));
    const result = await screen.findByRole("region", { name: "Latest recording" });
    expect(within(result).getByText("George")).toBeVisible();
    expect(within(result).getByText("cost pending · ≈ $0.00088")).toBeVisible();
    expect(within(result).getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/audio/recordings/01N0000000000000000000000A/file?download=1",
    );
    const player = result.querySelector("audio");
    expect(player).toHaveAttribute("src", "/api/audio/recordings/01N0000000000000000000000A/file");
    expect(player?.autoplay).toBe(true);
    await waitFor(() => expect(m.speechCredits).toHaveBeenCalledTimes(2)); // balance refreshed (AC-14)
  });

  it("sends no voice for the provider default of a model without listed voices", async () => {
    m.createRecording.mockResolvedValue(recording({ model: FISH.id, voice: null, modelName: "S1" }));
    await ready();
    fireEvent.click(modelButton());
    fireEvent.click(screen.getByRole("option", { name: /S1/ }));
    fireEvent.change(text(), { target: { value: "Hi" } });
    fireEvent.click(generate());
    await waitFor(() =>
      expect(m.createRecording).toHaveBeenCalledWith({ text: "Hi", model: "fish-audio/s1", voice: null, settings: {} }),
    );
    expect(await screen.findByText("Provider default")).toBeVisible();
  });

  it("shows the provider's reason, keeps the form and lets the Owner try again", async () => {
    m.createRecording.mockRejectedValueOnce(
      new ApiError(
        502,
        "PROVIDER_ERROR",
        "The provider did not answer within 180 s — the provider may still charge for it",
      ),
    );
    await ready();
    fireEvent.change(text(), { target: { value: "Hello there" } });
    fireEvent.click(generate());
    expect(await screen.findByRole("alert")).toHaveTextContent("may still charge for it");
    expect(text()).toHaveValue("Hello there");
    expect(generate()).toBeEnabled();
  });

  it("says the audio arrived but couldn't be saved", async () => {
    m.createRecording.mockRejectedValueOnce(
      new ApiError(
        500,
        "STORAGE_ERROR",
        "The audio arrived but couldn't be saved — the provider may still charge for it",
      ),
    );
    await ready();
    fireEvent.change(text(), { target: { value: "Hi" } });
    fireEvent.click(generate());
    expect(await screen.findByRole("alert")).toHaveTextContent("The audio arrived but couldn't be saved");
  });

  it("generates with Cmd/Ctrl+Enter", async () => {
    m.createRecording.mockResolvedValue(recording());
    await ready();
    fireEvent.change(text(), { target: { value: "Hi" } });
    fireEvent.keyDown(text(), { key: "Enter", metaKey: true });
    await waitFor(() => expect(m.createRecording).toHaveBeenCalledTimes(1));
  });
});

describe("Speech page — across sections (AC-02, AC-17)", () => {
  it("keeps the text and an in-flight generation while the Owner visits another section", async () => {
    let finish: (r: Recording) => void = () => {};
    m.createRecording.mockImplementation(() => new Promise((res) => (finish = res)));
    const other: Section = { id: "other", path: "/other", label: "Other", icon: Boxes, page: () => <p>Other page</p> };
    const speech = SECTIONS.find((s) => s.id === "speech") as Section;
    window.history.replaceState(null, "", "/audio/speech");
    renderWithQuery(<App sections={[other, speech]} />);
    await loaded();
    fireEvent.change(text(), { target: { value: "Hello there" } });
    fireEvent.click(generate());
    const nav = () => screen.getByRole("navigation", { name: "Sections" });
    fireEvent.click(within(nav()).getByRole("link", { name: "Other" }));
    expect(screen.getByText("Other page")).toBeVisible();
    fireEvent.click(within(nav()).getByRole("link", { name: "Speech" }));
    await waitFor(() => expect(generate()).toHaveTextContent("Generating…"));
    expect(text()).toHaveValue("Hello there");
    fireEvent.click(within(nav()).getByRole("link", { name: "Other" }));
    await act(async () => finish(recording()));
    fireEvent.click(within(nav()).getByRole("link", { name: "Speech" }));
    expect(await screen.findByRole("region", { name: "Latest recording" })).toBeVisible();
    expect(m.createRecording).toHaveBeenCalledTimes(1);
  });
});

describe("Speech page — recent recordings (SCR-04, AC-15, AC-18)", () => {
  const openRecent = () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Recent" }));

  it("puts a recording back into the form so the Owner can generate again", async () => {
    m.recordings.mockResolvedValue({
      items: [recording({ text: "Reuse me", voice: "sarah", settings: { stability: 1, similarity: 0.6, style: 0.2 } })],
      nextCursor: null,
    });
    await ready();
    openRecent();
    fireEvent.click(await screen.findByRole("button", { name: /Reuse «Reuse me/ }));
    expect(text()).toHaveValue("Reuse me");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Settings" }));
    expect(await screen.findByRole("button", { name: "Voice" })).toHaveTextContent("Sarah");
    expect(screen.getByRole("slider", { name: "Stability" })).toHaveAttribute("aria-valuetext", "Robust");
  });

  it("keeps the current model when the recording's model is no longer offered, and lists prototype recordings", async () => {
    m.recordings.mockResolvedValue({
      items: [
        recording({
          model: "elevenlabs/eleven-v1",
          modelName: "Eleven v1",
          text: "Old one",
          costStatus: "known",
          costMicros: 160,
        }),
      ],
      nextCursor: null,
    });
    await ready();
    openRecent();
    expect(await screen.findByText("$0.00016")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: /Reuse «Old one/ }));
    expect(await screen.findByText("Eleven v1 is no longer offered — kept Eleven v3")).toBeVisible();
    expect(text()).toHaveValue("Old one");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Settings" }));
    expect(await screen.findByRole("button", { name: "Model" })).toHaveTextContent("Eleven v3");
  });
});

describe("Speech page — review fixes", () => {
  it("updates the latest result's pending cost without a reload (R1, AC-13)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    m.createRecording.mockResolvedValue(recording());
    m.recording.mockResolvedValue(recording({ costStatus: "known", costMicros: 900 }));
    await ready();
    fireEvent.change(text(), { target: { value: "Hello there" } });
    fireEvent.click(generate());
    const result = await screen.findByRole("region", { name: "Latest recording" });
    expect(within(result).getByText("cost pending · ≈ $0.00088")).toBeVisible();
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(await within(result).findByText("$0.0009")).toBeVisible();
    expect(m.recording).toHaveBeenCalledWith("01N0000000000000000000000A");
    vi.useRealTimers();
  });

  it("drops a chosen voice the new model doesn't offer and keeps settings within its range (R2, AC-08)", async () => {
    m.speechModels.mockResolvedValue({ models: [V3, FISH, FLASH, OPENAI], fetchedAt: "x" });
    m.recordings.mockResolvedValue({
      items: [
        recording({ model: OPENAI.id, modelName: "TTS 1", voice: "alloy", text: "Fast", settings: { speed: 2 } }),
      ],
      nextCursor: null,
    });
    m.createRecording.mockResolvedValue(recording());
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Voice" }));
    fireEvent.click(screen.getByRole("option", { name: "Sarah" }));
    fireEvent.click(modelButton());
    fireEvent.click(screen.getByRole("option", { name: /S1/ }));
    expect(screen.getByRole("textbox", { name: "Type a voice name" })).toHaveValue("");
    fireEvent.change(text(), { target: { value: "Hi" } });
    fireEvent.click(generate());
    await waitFor(() => expect(m.createRecording).toHaveBeenLastCalledWith(expect.objectContaining({ voice: null })));

    // speed 2 on TTS 1 → Flash shows it brought into 0.7–1.2 → back on TTS 1 it stays 1.2, not 2
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Recent" }));
    fireEvent.click(await screen.findByRole("button", { name: /Reuse «Fast/ }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Replace your text?" })).getByRole("button", {
        name: "Replace",
      }),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Settings" }));
    expect(await screen.findByRole("slider", { name: "Speed" })).toHaveAttribute("aria-valuetext", "200%");
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    fireEvent.click(screen.getByRole("option", { name: /Flash v2/ }));
    expect(screen.getByRole("slider", { name: "Speed" })).toHaveAttribute("aria-valuetext", "120%");
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    fireEvent.click(screen.getByRole("option", { name: /TTS 1/ }));
    expect(screen.getByRole("slider", { name: "Speed" })).toHaveAttribute("aria-valuetext", "120%");
  });

  it("plays a new recording after an earlier one's file couldn't be played (R4)", async () => {
    m.createRecording
      .mockResolvedValueOnce(recording())
      .mockResolvedValueOnce(
        recording({ id: "01N0000000000000000000000B", url: "/api/audio/recordings/01N0000000000000000000000B/file" }),
      );
    await ready();
    fireEvent.change(text(), { target: { value: "Hi" } });
    fireEvent.click(generate());
    const result = await screen.findByRole("region", { name: "Latest recording" });
    fireEvent.error(result.querySelector("audio") as HTMLAudioElement);
    expect(within(result).getByText("Audio unavailable")).toBeVisible();
    fireEvent.click(generate());
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Latest recording" }).querySelector("audio")).toHaveAttribute(
        "src",
        "/api/audio/recordings/01N0000000000000000000000B/file",
      ),
    );
  });

  it("refreshes the balance after a failed generation too (R7)", async () => {
    m.createRecording.mockRejectedValueOnce(new ApiError(502, "PROVIDER_ERROR", "did not answer"));
    await ready();
    await screen.findByText("$12.50");
    fireEvent.change(text(), { target: { value: "Hi" } });
    fireEvent.click(generate());
    await screen.findByRole("alert");
    await waitFor(() => expect(m.speechCredits).toHaveBeenCalledTimes(2));
  });

  it("shows the error of a generation that failed while the Owner was in another section (R10, AC-02)", async () => {
    let fail: (e: Error) => void = () => {};
    m.createRecording.mockImplementation(() => new Promise((_, rej) => (fail = rej)));
    const other: Section = { id: "other", path: "/other", label: "Other", icon: Boxes, page: () => <p>Other page</p> };
    const speech = SECTIONS.find((s) => s.id === "speech") as Section;
    window.history.replaceState(null, "", "/audio/speech");
    renderWithQuery(<App sections={[other, speech]} />);
    await loaded();
    fireEvent.change(text(), { target: { value: "Hello there" } });
    fireEvent.click(generate());
    const nav = () => screen.getByRole("navigation", { name: "Sections" });
    fireEvent.click(within(nav()).getByRole("link", { name: "Other" }));
    await waitFor(() => expect(m.createRecording).toHaveBeenCalledTimes(1)); // the request is under way
    await act(async () => fail(new ApiError(502, "PROVIDER_ERROR", "Insufficient credits")));
    fireEvent.click(within(nav()).getByRole("link", { name: "Speech" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Insufficient credits");
    expect(text()).toHaveValue("Hello there");
  });

  it("keeps every id unique when the settings sheet is open (R12)", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("dialog", { name: "Speech settings" });
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
    expect(screen.getAllByRole("button", { name: "Model", hidden: true })).toHaveLength(2); // one per panel, each labelled
  });
});
