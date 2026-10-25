import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SpeechModel, VoiceSettings } from "../../../shared/speech";
import { controlsFor } from "../../../shared/speech-models";
import { ModelSelect } from "./ModelSelect";
import { VoiceControls } from "./VoiceControls";
import { VoiceSelect } from "./VoiceSelect";

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

const MODELS = [
  model({ id: "elevenlabs/eleven-v3", name: "Eleven v3" }),
  model({ id: "elevenlabs/eleven-v4", name: "Eleven v4", maxChars: 10_000 }),
  model({ id: "deepgram/aura-2", name: "Aura 2", maker: "Deepgram", maxCharsSource: "default", controls: [] }),
  model({
    id: "bytedance-seed/seed-audio-1-0",
    name: "Seed Audio",
    maker: "ByteDance",
    price: { unit: "per-output", outputLabel: "per second of audio" },
  }),
];

describe("ModelSelect", () => {
  it("lists models grouped by maker with price and character limit, and picks one", () => {
    const onChange = vi.fn();
    render(<ModelSelect id="m" models={MODELS} value="elevenlabs/eleven-v3" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /Eleven v3/ });
    fireEvent.click(trigger);
    const list = screen.getByRole("listbox", { name: "Speech models" });
    const groups = within(list).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["ElevenLabs", "Deepgram", "ByteDance"]);
    const v4 = within(list).getByRole("option", { name: /Eleven v4/ });
    expect(v4).toHaveTextContent("$0.08 / 1K chars");
    expect(v4).toHaveTextContent("10 000 chars");
    expect(within(list).getByRole("option", { name: /Aura 2/ })).toHaveTextContent("5 000 chars · limit not published");
    expect(within(list).getByRole("option", { name: /Seed Audio/ })).toHaveTextContent("priced per second of audio");
    expect(within(list).getByRole("option", { name: /Eleven v3/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(v4);
    expect(onChange).toHaveBeenCalledWith("elevenlabs/eleven-v4");
  });

  it("is disabled while there are no models yet", () => {
    render(<ModelSelect id="m" models={undefined} value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Loading models…" })).toBeDisabled();
  });
});

describe("VoiceSelect", () => {
  it("picks one of the model's voices", () => {
    const onChange = vi.fn();
    render(<VoiceSelect id="v" model={MODELS[0]} value="george" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /George/ }));
    fireEvent.click(screen.getByRole("option", { name: "Sarah" }));
    expect(onChange).toHaveBeenCalledWith("sarah");
    expect(screen.queryByRole("textbox", { name: "Filter voices" })).not.toBeInTheDocument();
  });

  it("filters a long voice list by typing", () => {
    const voices = Array.from({ length: 25 }, (_, i) => `en-US-Voice${i}:MAI-Voice-2`);
    render(
      <VoiceSelect
        id="v"
        model={model({ id: "microsoft/mai-voice-2", voices })}
        value={voices[0] ?? ""}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Voice0/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Filter voices" }), { target: { value: "voice1" } });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(["en-US-Voice1:MAI-Voice-2", "en-US-Voice10:MAI-Voice-2"]));
    expect(options).not.toContain("en-US-Voice2:MAI-Voice-2");
  });

  it("offers the provider default or a typed voice name when the model lists none", () => {
    function Harness() {
      const [v, setV] = useState<string | null>(null);
      return (
        <>
          <VoiceSelect
            id="v"
            model={model({ id: "fish-audio/s1", voiceMode: "optional", voices: [] })}
            value={v}
            onChange={setV}
          />
          <output>{v ?? "default"}</output>
        </>
      );
    }
    render(<Harness />);
    const typed = screen.getByRole("textbox", { name: "Type a voice name" });
    expect(typed).toHaveAttribute("placeholder", "Provider default");
    fireEvent.change(typed, { target: { value: "my-voice" } });
    expect(screen.getByRole("status")).toHaveTextContent("my-voice");
    fireEvent.change(typed, { target: { value: "  " } });
    expect(screen.getByRole("status")).toHaveTextContent("default");
  });
});

describe("VoiceControls", () => {
  function Harness({ id }: { id: string }) {
    const controls = controlsFor(id);
    const [settings, setSettings] = useState<VoiceSettings>({ stability: 0.2, similarity: 0.3, speakerBoost: false });
    return (
      <>
        <VoiceControls controls={controls} settings={settings} onChange={setSettings} />
        <output>{JSON.stringify(settings)}</output>
      </>
    );
  }

  it("renders only the model's controls, from its descriptors", () => {
    render(<Harness id="elevenlabs/eleven-flash-v2" />);
    expect(screen.getAllByRole("slider").map((s) => s.getAttribute("aria-label"))).toEqual([
      "Speed",
      "Stability",
      "Similarity",
    ]);
    expect(screen.getByRole("switch", { name: "Speaker Boost" })).not.toBeChecked();
    expect(screen.queryByRole("slider", { name: "Style Exaggeration" })).not.toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument(); // speed 1 by default
  });

  it("shows stepped stability by its labels and offers delivery instructions where accepted", () => {
    render(<Harness id="elevenlabs/eleven-v3" />);
    // stability 0.2 snaps to the nearest step, 0 — «Creative»
    expect(screen.getByRole("slider", { name: "Stability" })).toHaveAttribute("aria-valuetext", "Creative");
    const { unmount } = render(<Harness id="google/gemini-3.8-flash-tts" />);
    const instructions = screen.getByRole("textbox", { name: "Delivery instructions" });
    expect(instructions).toHaveAttribute("maxLength", "1000");
    fireEvent.change(instructions, { target: { value: "warm" } });
    expect(screen.getAllByRole("status").at(-1)).toHaveTextContent('"instructions":"warm"');
    unmount();
  });

  it("resets to the model's defaults", () => {
    render(<Harness id="elevenlabs/eleven-flash-v2" />);
    fireEvent.click(screen.getByRole("button", { name: "Reset values" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      JSON.stringify({ speed: 1, stability: 0.5, similarity: 0.75, speakerBoost: true }),
    );
  });

  it("says so when the model has no adjustable settings", () => {
    render(<Harness id="deepgram/aura-2" />);
    expect(screen.getByText("No adjustable settings for this model")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reset values" })).not.toBeInTheDocument();
  });
});
