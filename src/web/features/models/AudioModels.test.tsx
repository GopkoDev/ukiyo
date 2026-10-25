import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { renderWithQuery } from "@/test-utils";
import type { SpeechModel } from "../../../shared/speech";
import { controlsFor } from "../../../shared/speech-models";
import { SPEECH_MODELS_KEY } from "../audio/queryKeys";
import { AudioModels, controlsText, voicesText } from "./AudioModels";

/** SCR-02 — the Audio view (models-page-audio AC-01, AC-02, AC-05…AC-08). */
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    providers: vi.fn(),
    speechModels: vi.fn(),
    voicePresets: vi.fn(async () => ({ presets: [] })),
    speechModelPreferences: vi.fn(),
    modelPreferences: vi.fn(),
    setModelPreference: vi.fn(),
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
  voices: ["george", "aria"],
  price: { unit: "per-character", usdPerChar: 0.00008 },
  controls: controlsFor("elevenlabs/eleven-v3"),
};
const PLAIN: SpeechModel = {
  id: "acme/tts",
  name: "Acme TTS",
  maker: "Acme",
  maxChars: 4096,
  maxCharsSource: "default",
  voiceMode: "optional",
  voices: [],
  price: { unit: "unknown" },
  controls: [],
};
const pref = (model: string, over: { favorite?: boolean; hidden?: boolean } = {}) => ({
  provider: "openrouter" as const,
  model,
  favorite: false,
  hidden: false,
  updatedAt: "2026-10-25T10:00:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: true }] });
  m.speechModels.mockResolvedValue({ models: [V3, PLAIN], fetchedAt: "2026-10-25T10:00:00.000Z" });
  m.speechModelPreferences.mockResolvedValue({ preferences: [] });
});

const row = (id: string) => document.querySelector(`tr[data-model="${id}"]`) as HTMLElement;

describe("Audio view (SCR-02)", () => {
  it("lists every speech model with maker, price, limit, voices and controls (AC-01)", async () => {
    renderWithQuery(<AudioModels />);
    expect(await screen.findByText("OpenRouter · 2 speech models")).toBeVisible();
    const v3 = within(row(V3.id));
    for (const t of ["Eleven v3", V3.id, "ElevenLabs", "$0.08 / 1K chars", "5 000 chars", "2 voices"])
      expect(v3.getByText(t)).toBeVisible();
    expect(v3.getByText(controlsText(V3))).toBeVisible();
    const plain = within(row(PLAIN.id));
    for (const t of ["price unknown", "4 096 chars · limit not published", "provider default", "—"])
      expect(plain.getByText(t)).toBeVisible();
    expect(m.modelPreferences).not.toHaveBeenCalled(); // image preferences are never read here (AC-05)
  });

  it("stars and hides a speech model, saved as a speech preference (AC-02)", async () => {
    m.setModelPreference.mockImplementation(async (b) => pref(b.model, { favorite: b.favorite, hidden: b.hidden }));
    renderWithQuery(<AudioModels />);
    const star = await screen.findByRole("button", { name: "Favorite Eleven v3" });
    await waitFor(() => expect(star).toBeEnabled());
    m.speechModelPreferences.mockResolvedValue({ preferences: [pref(V3.id, { favorite: true })] });
    fireEvent.click(star);
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "true"));
    expect(m.setModelPreference).toHaveBeenCalledWith({
      provider: "openrouter",
      kind: "speech",
      model: V3.id,
      favorite: true,
    });
    m.speechModelPreferences.mockResolvedValue({ preferences: [pref(V3.id, { favorite: true, hidden: true })] });
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Show Eleven v3 in picker" })));
    expect(await within(row(V3.id)).findByText("Hidden")).toBeVisible();
  });

  it("reverts a failed toggle with a message (AC-07)", async () => {
    m.setModelPreference.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Unknown model"));
    renderWithQuery(<AudioModels />);
    const star = await screen.findByRole("button", { name: "Favorite Acme TTS" });
    await waitFor(() => expect(star).toBeEnabled());
    fireEvent.click(star);
    expect(await within(row(PLAIN.id)).findByRole("alert")).toHaveTextContent("Couldn't save — try again.");
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "false"));
  });

  it("lists preferences of models no longer offered, with Forget (AC-06)", async () => {
    m.speechModelPreferences.mockResolvedValue({
      preferences: [pref("retired/tts", { favorite: true, hidden: true })],
    });
    m.setModelPreference.mockResolvedValue({ ...pref("retired/tts"), updatedAt: null });
    renderWithQuery(<AudioModels />);
    const entry = (await screen.findByText("retired/tts")).closest("li") as HTMLElement;
    expect(within(entry).getByText("Favorite")).toBeVisible();
    m.speechModelPreferences.mockResolvedValue({ preferences: [] });
    fireEvent.click(within(entry).getByRole("button", { name: "Forget" }));
    await waitFor(() => expect(screen.queryByText("retired/tts")).toBeNull());
    expect(m.setModelPreference).toHaveBeenCalledWith({
      provider: "openrouter",
      kind: "speech",
      model: "retired/tts",
      favorite: false,
      hidden: false,
    });
  });

  it("says when the list can't be read, OpenRouter isn't configured, or preferences can't be read (AC-08)", async () => {
    m.speechModels.mockRejectedValueOnce(new ApiError(502, "PROVIDER_ERROR", "down"));
    const first = renderWithQuery(<AudioModels />);
    expect(await screen.findByText("Couldn't load the speech models.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Eleven v3")).toBeVisible();
    first.unmount();

    m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: false }] });
    const second = renderWithQuery(<AudioModels />);
    expect(await screen.findByText("OpenRouter isn't configured — add its key to .env.local.")).toBeVisible();
    second.unmount();

    m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: true }] });
    m.speechModelPreferences.mockRejectedValue(new ApiError(500, "HTTP_ERROR", "down"));
    renderWithQuery(<AudioModels />);
    expect(await screen.findByText("Favorites and hidden models couldn't be loaded.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Favorite Eleven v3" })).toBeDisabled();
    expect(screen.queryByText("No longer offered")).toBeNull();
  });
});

describe("catalog reads (spec §6 Audio view)", () => {
  it("reads nothing more with a warm catalog, and once with a cold one", async () => {
    const warm = renderWithQuery(<AudioModels />);
    await screen.findByText("Eleven v3");
    expect(m.speechModels).toHaveBeenCalledTimes(1);
    warm.unmount();
    m.speechModels.mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(SPEECH_MODELS_KEY, { models: [V3], fetchedAt: "2026-10-25T10:00:00.000Z" });
    render(
      <QueryClientProvider client={client}>
        <AudioModels />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("OpenRouter · 1 speech model")).toBeVisible();
    expect(m.speechModels).not.toHaveBeenCalled();
  });

  it("doesn't read the catalog for an unconfigured OpenRouter; a failed providers read disables the toggles with a notice", async () => {
    m.providers.mockResolvedValue({ providers: [{ id: "openrouter", name: "OpenRouter", configured: false }] });
    const first = renderWithQuery(<AudioModels />);
    await screen.findByText("OpenRouter isn't configured — add its key to .env.local.");
    expect(m.speechModels).not.toHaveBeenCalled();
    first.unmount();
    m.providers.mockRejectedValue(new ApiError(500, "HTTP_ERROR", "down"));
    renderWithQuery(<AudioModels />);
    expect(await screen.findByText("Favorites and hidden models couldn't be loaded.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Favorite Eleven v3" })).toBeDisabled();
  });
});

describe("wording helpers", () => {
  it("counts voices and names controls", () => {
    expect(voicesText({ voices: ["a"] })).toBe("1 voice");
    expect(voicesText({ voices: [] })).toBe("provider default");
    expect(controlsText({ controls: [] })).toBe("—");
  });
});
