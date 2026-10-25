import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import type { SpeechModel } from "../../../shared/speech";
import { speechModelPreferencesKey } from "../models/preferences";
import { SpeechPage } from "./SpeechPage";

/** The Speech page's model list with the Owner's speech-model preferences (models-page-audio AC-03, AC-04, AC-08). */
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    speechModels: vi.fn(),
    speechModelPreferences: vi.fn(),
    providers: vi.fn(),
    providerBalance: vi.fn(),
    recordings: vi.fn(),
  },
}));
const m = vi.mocked(api);
const model = (id: string, name: string, maker: string): SpeechModel => ({
  id,
  name,
  maker,
  maxChars: 5000,
  maxCharsSource: "family",
  voiceMode: "optional",
  voices: [],
  price: { unit: "unknown" },
  controls: [],
});
const V3 = model("elevenlabs/eleven-v3", "Eleven v3", "ElevenLabs");
const FLASH = model("elevenlabs/eleven-flash-v2", "Flash v2", "ElevenLabs");
const TTS = model("openai/tts-1", "TTS 1", "OpenAI");
const pref = (id: string, favorite: boolean, hidden: boolean) => ({
  provider: "openrouter" as const,
  model: id,
  favorite,
  hidden,
  updatedAt: "2026-10-25T10:00:00.000Z",
});

beforeEach(() => {
  vi.resetAllMocks();
  m.speechModels.mockResolvedValue({ models: [V3, FLASH, TTS], fetchedAt: "2026-10-25T10:00:00.000Z" });
  m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: true }] });
  m.providerBalance.mockResolvedValue({ provider: "openrouter", remainingUsd: 1 });
  m.recordings.mockResolvedValue({ items: [], nextCursor: null });
});
afterEach(() => vi.useRealTimers());

const modelButton = () => screen.getByRole("button", { name: "Model" });
function groups() {
  fireEvent.click(modelButton());
  const list = screen.getByRole("listbox", { name: "Speech models" });
  const out = within(list)
    .getAllByRole("group")
    .map((g) => [
      g.getAttribute("aria-label"),
      within(g)
        .getAllByRole("option")
        .map((o) => o.textContent?.split("price")[0]),
    ]);
  fireEvent.keyDown(list, { key: "Escape" });
  return out;
}

describe("Speech model list with preferences", () => {
  it("lists favorites first, leaves hidden ones out, and picks the first favorite (AC-03, AC-04)", async () => {
    m.speechModelPreferences.mockResolvedValue({
      preferences: [pref(TTS.id, true, false), pref(FLASH.id, false, true)],
    });
    renderWithQuery(<SpeechPage />);
    await waitFor(() => expect(modelButton()).toHaveTextContent("TTS 1"));
    expect(groups()).toEqual([
      ["Favorites", ["TTS 1"]],
      ["ElevenLabs", ["Eleven v3"]],
    ]);
  });

  it("keeps the selected model when it gets hidden — top of its maker's group, marked Hidden (AC-04)", async () => {
    m.speechModelPreferences.mockResolvedValue({ preferences: [] });
    const { client } = renderWithQuery(<SpeechPage />);
    await waitFor(() => expect(modelButton()).toHaveTextContent("Eleven v3"));
    await waitFor(() =>
      expect(client.getQueryData(speechModelPreferencesKey("openrouter"))).toEqual({ preferences: [] }),
    );
    m.speechModelPreferences.mockResolvedValue({ preferences: [pref(V3.id, true, true)] });
    act(() => {
      client.setQueryData(speechModelPreferencesKey("openrouter"), { preferences: [pref(V3.id, true, true)] });
    });
    expect(modelButton()).toHaveTextContent("Eleven v3");
    expect(groups()).toEqual([
      ["ElevenLabs", ["Eleven v3Hidden", "Flash v2"]],
      ["OpenAI", ["TTS 1"]],
    ]);
  });

  it("an unreadable preference list is the plain list and never blocks generating (AC-08)", async () => {
    m.speechModelPreferences.mockRejectedValue(new ApiError(500, "HTTP_ERROR", "down"));
    renderWithQuery(<SpeechPage />);
    await waitFor(() => expect(modelButton()).toHaveTextContent("Eleven v3"));
    expect(groups()).toEqual([
      ["ElevenLabs", ["Eleven v3", "Flash v2"]],
      ["OpenAI", ["TTS 1"]],
    ]);
    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), { target: { value: "Hi" } });
    expect(screen.getByRole("button", { name: "Generate speech" })).toBeEnabled();
  });

  it("a slow preference read doesn't hold the pick past 1.5 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    m.speechModelPreferences.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<SpeechPage />);
    await waitFor(() => expect(modelButton()).toHaveTextContent("Eleven v3"));
    await act(async () => vi.advanceTimersByTimeAsync(1600));
    expect(modelButton()).toHaveTextContent("Eleven v3");
  });
});
