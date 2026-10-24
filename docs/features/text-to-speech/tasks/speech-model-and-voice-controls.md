---
id: T12
title: "Build ModelSelect, VoiceSelect and descriptor-driven VoiceControls"
layer: "ui"
deps: ["T2"]
blocks: ["T13"]
acs: ["AC-07", "AC-08", "AC-09"]
files_hint: ["src/web/features/audio/ModelSelect.tsx", "src/web/features/audio/VoiceSelect.tsx", "src/web/features/audio/VoiceControls.tsx", "src/web/features/audio/controls.test.tsx"]
owner: "pipeline agent (implement)"
estimate: "M"
context_budget: "M"
status: "done"
step: "COMMIT"
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T12 — Build ModelSelect, VoiceSelect and descriptor-driven VoiceControls

## Place in the sequence

- **Blocked by:** T2 — Add the speech family spec map and the shared speech DTOs · **Blocks:** T13 — Rebuild the Speech page on the new contract · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to see only the controls the chosen model accepts (for example speed, stability or delivery instructions)
> **So that** every setting I change actually affects the result
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: component tests prove grouping by maker with price/limit, voice filtering above 20, provider default + typed voice for voice-less models, only the model's controls rendered from descriptors, steps labels, Reset to the model's defaults leaving voice and text.

## Inlined context

> **SCR-02 (controls):** no voices listed: Voice shows «Provider default» plus a «Type a voice name» input · many voices: voice list with a filter input when > 20 voices · unknown model: Voice adjustment shows «No adjustable settings for this model»
>
> — `screens.md SCR-02, abridged`

> **New components:** NEW: VoiceControls — renders controls from the model's descriptors (slider / steps / switch / text) · NEW: ModelSelect — a grouped `Select` by maker with price and limit per row · NEW: VoiceSelect — Popover + Input + a list, like ModelPicker's popover
>
> — `screens.md §New components, abridged`

> **Reuse:** Select, Popover, Input, Slider, Switch, Textarea, Label, Button (ghost) from `src/web/components/ui/`; the prototype SliderRow / SettingsTab in `features/audio/SpeechPage.tsx` as the visual precedent
>
> — `design-system.md inventory, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `SpeechModel` (shared schema).

## Acceptance criteria

### AC-07 — happy path

> **Given** the Owner chooses a model
> **When** the controls are shown
> **Then** only the controls that model accepts appear, each with its own range and default. For example: ElevenLabs models show stability, similarity and, where the model supports them, style, speaker boost and speed; models that take delivery instructions show a free-text «delivery instructions» field; models that honour speed show a speed control. The voice list is that model's own voices. Each model's price and character limit are shown next to it in the model list. The list is grouped by the model's maker, ElevenLabs first and the others in alphabetical order, with each group in catalog order. When a model offers more than 20 voices, the voice list can be filtered by typing. Delivery instructions take up to 1 000 characters, and they are not billed characters.
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** the Owner changes a control and then switches to a model that doesn't accept it
> **When** the Owner generates
> **Then** only the new model's accepted settings are sent and recorded, and a setting the model ignores is never shown as applied. The text is kept. The voice is kept if the new model offers it; otherwise the model's first listed voice is selected, or «provider default» when it lists none. A control that both models accept keeps its value, brought into the new model's range when it is outside it. Ukiyo does not remember separate values per model. «Reset values» restores the current model's defaults for the voice controls and the delivery instructions, and leaves the voice and the text as they are.
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** a catalog model Ukiyo has no specific knowledge of, or a model whose catalog entry lists no voices
> **When** the Owner chooses it
> **Then** it stays usable. An unknown model offers the voice and the text only. A model without listed voices lets the Owner either use the provider's default voice or type a voice name, and the recording names the voice that was asked for («provider default» when none was). A model's character limit comes from what Ukiyo knows about its family. Otherwise it comes from the limit the catalog states for it. When neither gives one, a default of 5 000 characters applies, labelled «limit not published». Text over the limit is refused before sending and never cut short. Ukiyo never hides a catalog model because it doesn't know its controls.
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] ModelSelect (Select + SelectGroup per maker, price via T11 `priceText`, limit)
- [ ] VoiceSelect (Popover list, filter Input when >20, «Provider default» + typed name for voiceMode optional)
- [ ] VoiceControls (kind → Slider / steps Slider with stepLabels / Switch / Textarea maxLength 1000) + Reset
- [ ] Tests

## Edge cases

| Case | Behaviour |
|---|---|
| model with 97 voices | filter by typing narrows the list |
| voiceMode optional, typed «my-voice» | value «my-voice» passed up |
| controls [] | «No adjustable settings for this model» |

## Definition of Done

- [ ] component tests prove grouping by maker with price/limit, voice filtering above 20, provider default + typed voice for voice-less models, only the model's controls rendered from descriptors, steps labels, Reset to the model's defaults leaving voice and text
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
