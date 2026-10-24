---
id: T16
title: "Register the audio components in the design canon and the architecture map"
layer: "docs"
deps: ["T13", "T14"]
blocks: []
acs: ["AC-07", "AC-15"]
files_hint: ["docs/design-system.md", "docs/architecture-map.md"]
owner: "pipeline agent (implement)"
estimate: "S"
context_budget: "S"
status: "todo"
step: ""
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T16 — Register the audio components in the design canon and the architecture map

## Place in the sequence

- **Blocked by:** T13 — Rebuild the Speech page on the new contract · T14 — List recent recordings with reuse, delete and live pending costs · **Blocks:** — · **Wave:** 7.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to see only the controls the chosen model accepts (for example speed, stability or delivery instructions)
> **So that** every setting I change actually affects the result
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: design-system.md lists Tabs, Slider, Label and the new audio components with their states; architecture-map.md describes the rebuilt audio module, the speech port and the grouped sections.

## Inlined context

> **New components:** Tabs, Slider, Label (inventory addition) · NEW: VoiceControls · NEW: ModelSelect · NEW: VoiceSelect · NEW: CostLabel · NEW: RecordingItem
>
> — `screens.md §New components, abridged`

> **Map:** audio module rebuilt (routes/service/domain/repo/wav), providers/speech-port + openrouter-speech + speech-catalog, file-store audio ops, cost-sync lookupFor, sections grouped Image/Audio
>
> — `sad.md §5, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-07 — happy path

> **Given** the Owner chooses a model
> **When** the controls are shown
> **Then** only the controls that model accepts appear, each with its own range and default. For example: ElevenLabs models show stability, similarity and, where the model supports them, style, speaker boost and speed; models that take delivery instructions show a free-text «delivery instructions» field; models that honour speed show a speed control. The voice list is that model's own voices. Each model's price and character limit are shown next to it in the model list. The list is grouped by the model's maker, ElevenLabs first and the others in alphabetical order, with each group in catalog order. When a model offers more than 20 voices, the voice list can be filtered by typing. Delivery instructions take up to 1 000 characters, and they are not billed characters.
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — happy path

> **Given** the Owner has made recordings
> **When** the Owner opens the Speech page's recent recordings
> **Then** the ten latest are listed, newest first, each with a player, its text excerpt, voice, model, time, cost (with its status) and a download action. Choosing one puts its text, model, voice and settings back into the form, so the Owner can generate again. If the form holds unsent text that differs from the recording's, the page asks before replacing it. A recording whose model is no longer offered still shows its model's name and plays. Choosing it says that the model is no longer offered and keeps the current model. It still fills in the text, plus the voice and the settings that the current model accepts.
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] design-system.md inventory rows (source path, states, notes)
- [ ] architecture-map.md module inventory row for audio + providers; Constraints: prototype entry replaced by the rebuilt state

## Edge cases

| Case | Behaviour |
|---|---|
| component renamed during implement | inventory uses the shipped name |

## Definition of Done

- [ ] design-system.md lists Tabs, Slider, Label and the new audio components with their states; architecture-map.md describes the rebuilt audio module, the speech port and the grouped sections
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
