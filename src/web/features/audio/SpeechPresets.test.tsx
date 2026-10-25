import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { navigate } from "@/lib/router";
import { renderWithQuery } from "@/test-utils";
import type { Recording, SpeechModel } from "../../../shared/speech";
import { controlsFor } from "../../../shared/speech-models";
import type { VoicePreset } from "../../../shared/voice-presets";
import { SpeechPage } from "./SpeechPage";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    health: vi.fn(async () => ({ status: "ok" })),
    speechModels: vi.fn(),
    providers: vi.fn(),
    providerBalance: vi.fn(),
    speechModelPreferences: vi.fn(),
    recordings: vi.fn(),
    createRecording: vi.fn(),
    recording: vi.fn(),
    voicePresets: vi.fn(),
    createVoicePreset: vi.fn(),
    updateVoicePreset: vi.fn(),
    deleteVoicePreset: vi.fn(),
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
  price: { unit: "free" },
  controls: controlsFor(over.id),
  ...over,
});
const V2 = model({ id: "elevenlabs/eleven-multilingual-v2", name: "Multilingual v2" });
const FLASH = model({ id: "elevenlabs/eleven-flash-v2", name: "Flash v2" });
const STATS = { recordings: 0, knownCostMicros: null, pending: 0, unavailable: 0, lastUsedAt: null };
const preset = (over: Partial<VoicePreset> = {}): VoicePreset => ({
  id: "01P00000000000000000000001",
  name: "Narrator",
  provider: "openrouter",
  model: FLASH.id,
  modelName: "Flash v2",
  voice: "sarah",
  settings: { speed: 1.1, stability: 0.5, similarity: 0.75, speakerBoost: true },
  createdAt: "2026-10-25T10:00:00.000Z",
  updatedAt: "2026-10-25T10:00:00.000Z",
  stats: STATS,
  ...over,
});
const NARRATOR = preset();
const RETIRED = preset({ id: "01P00000000000000000000002", name: "old one", model: "gone/tts", modelName: "Gone TTS" });
const recording = (over: Partial<Recording> = {}): Recording => ({
  id: "01N0000000000000000000000A",
  createdAt: new Date().toISOString(),
  provider: "openrouter",
  model: FLASH.id,
  modelName: "Flash v2",
  voice: "sarah",
  text: "Hello there",
  settings: NARRATOR.settings,
  mediaType: "audio/mpeg",
  characters: 11,
  costMicros: 10,
  costStatus: "known",
  estimateMicros: 10,
  durationMs: 900,
  url: "/api/audio/recordings/01N0000000000000000000000A/file",
  tags: [],
  comment: null,
  preset: null,
  ...over,
});

beforeEach(() => {
  m.speechModels.mockResolvedValue({ models: [V2, FLASH], fetchedAt: "x" });
  m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: true }] });
  m.providerBalance.mockResolvedValue({ provider: "openrouter", remainingUsd: 12.5 });
  m.speechModelPreferences.mockResolvedValue({ preferences: [] });
  m.recordings.mockResolvedValue({ items: [], nextCursor: null });
  m.voicePresets.mockResolvedValue({ presets: [NARRATOR, RETIRED] });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

const panel = () => screen.getAllByRole("button", { name: "Voice preset" })[0] as HTMLElement;
const modelButton = () => screen.getAllByRole("button", { name: "Model" })[0] as HTMLElement;
const voiceButton = () => screen.getAllByRole("button", { name: "Voice" })[0] as HTMLElement;
const saveButton = () => screen.getAllByRole("button", { name: "Save" })[0] as HTMLElement;
async function ready() {
  window.history.replaceState(null, "", "/audio/speech");
  renderWithQuery(<SpeechPage />);
  await waitFor(() => expect(modelButton()).toHaveTextContent("Multilingual v2"));
  await waitFor(() => expect(panel()).toHaveTextContent("No voice preset"));
}
async function pick(name: string) {
  fireEvent.click(panel());
  const list = await screen.findByRole("listbox", { name: "Voice presets" });
  fireEvent.click(within(list).getByRole("option", { name: new RegExp(name) }));
}

describe("Speech page — voice presets (SCR-01)", () => {
  it("applies a preset in one click: model, voice and settings, text kept, no request (AC-03, §6 Apply)", async () => {
    await ready();
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Keep me" } });
    const calls = Object.values(m).reduce((n, f) => n + (f as ReturnType<typeof vi.fn>).mock.calls.length, 0);
    await pick("Narrator");
    expect(modelButton()).toHaveTextContent("Flash v2");
    expect(voiceButton()).toHaveTextContent("Sarah");
    expect(screen.getAllByRole("slider", { name: /Speed/ })[0]).toHaveAttribute("aria-valuenow", "1.1");
    expect(screen.getByRole("textbox", { name: "Text" })).toHaveValue("Keep me");
    expect(panel()).toHaveTextContent("Narrator");
    expect(panel()).not.toHaveTextContent("modified");
    expect(saveButton()).toBeDisabled();
    const after = Object.values(m).reduce((n, f) => n + (f as ReturnType<typeof vi.fn>).mock.calls.length, 0);
    expect(after).toBe(calls);
  });

  it("lists presets by name and marks one whose model is gone — it can't be applied (AC-09)", async () => {
    await ready();
    fireEvent.click(panel());
    const list = await screen.findByRole("listbox", { name: "Voice presets" });
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([expect.stringContaining("Narrator"), expect.stringContaining("old one")]);
    const old = within(list).getByRole("option", { name: /old one/ });
    expect(old).toHaveTextContent("No longer offered");
    fireEvent.click(old);
    expect(await screen.findByText("Gone TTS is no longer offered")).toBeVisible();
    expect(modelButton()).toHaveTextContent("Multilingual v2");
  });

  it("shows «modified» after an edit, plain again when back, and sends the preset only when unchanged (AC-05)", async () => {
    m.createRecording.mockResolvedValue(recording({ preset: { id: NARRATOR.id, name: "Narrator" } }));
    await ready();
    await pick("Narrator");
    fireEvent.click(voiceButton());
    fireEvent.click(
      within(await screen.findByRole("listbox", { name: "Voices" })).getByRole("option", { name: "George" }),
    );
    expect(panel()).toHaveTextContent("Narrator · modified");
    expect(saveButton()).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate speech" }));
    await waitFor(() => expect(m.createRecording).toHaveBeenCalledTimes(1));
    expect(m.createRecording.mock.calls[0]?.[0]).toMatchObject({ presetId: null, voice: "george" });
    fireEvent.click(voiceButton());
    fireEvent.click(
      within(await screen.findByRole("listbox", { name: "Voices" })).getByRole("option", { name: "Sarah" }),
    );
    expect(panel()).toHaveTextContent("Narrator");
    expect(panel()).not.toHaveTextContent("modified");
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate speech" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate speech" }));
    await waitFor(() => expect(m.createRecording).toHaveBeenCalledTimes(2));
    expect(m.createRecording.mock.calls[1]?.[0]).toMatchObject({
      presetId: NARRATOR.id,
      model: FLASH.id,
      voice: "sarah",
    });
  });

  it("detaches, keeping the values (AC-05)", async () => {
    await ready();
    await pick("Narrator");
    fireEvent.pointerDown(screen.getAllByRole("button", { name: "Voice preset actions" })[0] as HTMLElement, {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Detach" }));
    expect(panel()).toHaveTextContent("No voice preset");
    expect(modelButton()).toHaveTextContent("Flash v2");
  });

  it("saves the current setup under a suggested name and applies it (AC-01)", async () => {
    const saved = preset({
      id: "01P00000000000000000000003",
      name: "George · Multilingual v2",
      model: V2.id,
      voice: "george",
    });
    m.createVoicePreset.mockResolvedValue(saved);
    await ready();
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole("dialog", { name: "Save voice preset" });
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("George · Multilingual v2");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.createVoicePreset).toHaveBeenCalledTimes(1));
    expect(m.createVoicePreset.mock.calls[0]?.[0]).toMatchObject({
      name: "George · Multilingual v2",
      model: V2.id,
      voice: "george",
    });
    expect(m.createVoicePreset.mock.calls[0]?.[0]).not.toHaveProperty("text");
    await waitFor(() => expect(panel()).toHaveTextContent("George · Multilingual v2"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the field message or «Couldn't save — try again.» (AC-02)", async () => {
    m.createVoicePreset.mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", "taken", { fields: { name: "A voice named «Narrator» already exists" } }),
    );
    m.createVoicePreset.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "boom"));
    await ready();
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole("dialog", { name: "Save voice preset" });
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Enter a name")).toBeVisible();
    expect(m.createVoicePreset).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: "narrator" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("A voice named «Narrator» already exists")).toBeVisible();
    expect(name).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Couldn't save — try again.")).toBeVisible();
    expect(name).toHaveValue("narrator");
  });

  it("offers Update or Save as new for a modified preset; Update keeps it applied (AC-06)", async () => {
    m.updateVoicePreset.mockImplementation(async (_id, body) => preset({ voice: body.voice ?? null }));
    await ready();
    await pick("Narrator");
    fireEvent.click(voiceButton());
    fireEvent.click(
      within(await screen.findByRole("listbox", { name: "Voices" })).getByRole("option", { name: "George" }),
    );
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole("dialog", { name: "Save voice preset" });
    expect(within(dialog).getByRole("button", { name: "Save as new" })).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Update «Narrator»" }));
    await waitFor(() =>
      expect(m.updateVoicePreset).toHaveBeenCalledWith(
        NARRATOR.id,
        expect.objectContaining({ voice: "george", model: FLASH.id }),
      ),
    );
    await waitFor(() => expect(panel()).not.toHaveTextContent("modified"));
    expect(panel()).toHaveTextContent("Narrator");
  });

  it("renames and deletes the applied preset; a deleted one detaches (AC-07)", async () => {
    m.updateVoicePreset.mockResolvedValue(preset({ name: "Calm narrator" }));
    m.deleteVoicePreset.mockResolvedValue(null);
    await ready();
    await pick("Narrator");
    const actions = () => screen.getAllByRole("button", { name: "Voice preset actions" })[0] as HTMLElement;
    fireEvent.pointerDown(actions(), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename voice" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "Calm narrator" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(panel()).toHaveTextContent("Calm narrator"));
    fireEvent.pointerDown(actions(), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete «Calm narrator»?" });
    expect(confirm).toHaveTextContent("It has no recordings.");
    m.voicePresets.mockResolvedValue({ presets: [RETIRED] });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(panel()).toHaveTextContent("No voice preset"));
    expect(modelButton()).toHaveTextContent("Flash v2");
  });

  it("applies a preset handed over from Voices, keeps the text, and refuses a gone one (AC-14)", async () => {
    await ready();
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Keep me" } });
    act(() => navigate(`/audio/speech?preset=${NARRATOR.id}`));
    await waitFor(() => expect(panel()).toHaveTextContent("Narrator"));
    expect(modelButton()).toHaveTextContent("Flash v2");
    expect(window.location.search).toBe("");
    expect(screen.getByRole("textbox", { name: "Text" })).toHaveValue("Keep me");
    act(() => navigate("/audio/speech?preset=01P0000000000000000000000Z"));
    expect(await screen.findByText("This voice no longer exists.")).toBeVisible();
    act(() => navigate(`/audio/speech?preset=${RETIRED.id}`));
    expect(await screen.findByText("Gone TTS is no longer offered")).toBeVisible();
    expect(panel()).toHaveTextContent("Narrator");
  });

  it("re-applies the preset of a reused recording only if it still matches (AC-15)", async () => {
    m.recordings.mockResolvedValue({
      items: [
        recording({ id: "01N0000000000000000000000B", preset: { id: NARRATOR.id, name: "Narrator" } }),
        recording({ id: "01N0000000000000000000000C", voice: "george", preset: { id: NARRATOR.id, name: "Narrator" } }),
      ],
      nextCursor: null,
    });
    await ready();
    const tab = (name: string) => fireEvent.mouseDown(screen.getAllByRole("tab", { name })[0] as HTMLElement);
    const reuse = async (i: number) => {
      tab("Recent");
      fireEvent.click((await screen.findAllByRole("button", { name: /Reuse/ }))[i] as HTMLElement);
      tab("Settings");
    };
    await reuse(0);
    await waitFor(() => expect(panel()).toHaveTextContent("Narrator"));
    expect(panel()).not.toHaveTextContent("modified");
    await reuse(1);
    await waitFor(() => expect(panel()).toHaveTextContent("No voice preset"));
  });

  it("says the presets couldn't load and still lets the Owner generate (AC-19)", async () => {
    m.voicePresets.mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "boom"));
    window.history.replaceState(null, "", "/audio/speech");
    renderWithQuery(<SpeechPage />);
    await waitFor(() => expect(modelButton()).toHaveTextContent("Multilingual v2"));
    fireEvent.click(panel());
    expect(await screen.findByText("Couldn't load your voices.")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Hi" } });
    expect(screen.getByRole("button", { name: "Generate speech" })).toBeEnabled();
  });

  it("re-applies the preset of a recording reused from the gallery even when the presets arrive last (review R1, AC-15)", async () => {
    let release: (v: { presets: VoicePreset[] }) => void = () => {};
    m.voicePresets.mockReturnValue(new Promise((r) => (release = r)));
    m.recording.mockResolvedValue(recording({ preset: { id: NARRATOR.id, name: "Narrator" } }));
    window.history.replaceState(null, "", `/audio/speech?reuse=01N0000000000000000000000A`);
    renderWithQuery(<SpeechPage />);
    await waitFor(() => expect(m.recording).toHaveBeenCalled());
    await act(async () => release({ presets: [NARRATOR, RETIRED] }));
    await waitFor(() => expect(modelButton()).toHaveTextContent("Flash v2"));
    await waitFor(() => expect(panel()).toHaveTextContent("Narrator"));
    expect(panel()).not.toHaveTextContent("modified");
  });

  it("says the speech models couldn't load instead of «Loading models…» (review R4, AC-09)", async () => {
    m.speechModels.mockRejectedValue(new ApiError(502, "PROVIDER_ERROR", "down"));
    window.history.replaceState(null, "", `/audio/speech?preset=${NARRATOR.id}`);
    renderWithQuery(<SpeechPage />);
    expect(await screen.findByText("Couldn't load the speech models — the voice preset wasn't applied.")).toBeVisible();
    fireEvent.click(panel());
    fireEvent.click(
      within(await screen.findByRole("listbox", { name: "Voice presets" })).getByRole("option", { name: /Narrator/ }),
    );
    expect(await screen.findByText("Couldn't load the speech models.")).toBeVisible();
  });

  it("applies a preset whose model is hidden, marked «Hidden», over the automatic pick (AC-03)", async () => {
    m.speechModelPreferences.mockResolvedValue({
      preferences: [{ provider: "openrouter", model: FLASH.id, favorite: false, hidden: true, updatedAt: "x" }],
    });
    await ready();
    fireEvent.click(panel());
    const list = await screen.findByRole("listbox", { name: "Voice presets" });
    expect(within(list).getByRole("option", { name: /Narrator/ })).toHaveTextContent("Hidden");
    fireEvent.click(within(list).getByRole("option", { name: /Narrator/ }));
    expect(modelButton()).toHaveTextContent("Flash v2");
  });

  it("shows «modified» right after applying a preset holding a setting the model no longer accepts (AC-10)", async () => {
    m.voicePresets.mockResolvedValue({ presets: [preset({ settings: { ...NARRATOR.settings, style: 0.3 } })] });
    await ready();
    await pick("Narrator");
    expect(panel()).toHaveTextContent("Narrator · modified");
  });

  it("saves a modified preset as a new one and applies it (AC-06)", async () => {
    const fresh = preset({ id: "01P00000000000000000000009", name: "Calm reader", voice: "george" });
    m.createVoicePreset.mockResolvedValue(fresh);
    m.voicePresets.mockResolvedValue({ presets: [NARRATOR, RETIRED, fresh] });
    await ready();
    await pick("Narrator");
    fireEvent.click(voiceButton());
    fireEvent.click(
      within(await screen.findByRole("listbox", { name: "Voices" })).getByRole("option", { name: "George" }),
    );
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole("dialog", { name: "Save voice preset" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save as new" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "Calm reader" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(panel()).toHaveTextContent("Calm reader"));
    expect(m.updateVoicePreset).not.toHaveBeenCalled();
  });

  it("never swaps the form under a request in flight when a preset is handed over (AC-14)", async () => {
    m.createRecording.mockReturnValue(new Promise(() => {}));
    await ready();
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate speech" }));
    act(() => navigate(`/audio/speech?preset=${NARRATOR.id}`));
    expect(await screen.findByText("Wait for the current recording to finish, then apply.")).toBeVisible();
    expect(modelButton()).toHaveTextContent("Multilingual v2");
  });
});
