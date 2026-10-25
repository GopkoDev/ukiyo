---
id: T2
title: "Shared voice-preset schemas, name rules and presetMatches"
layer: "domain"
deps: []
blocks: ["T3"]
acs: ["AC-02", "AC-05", "AC-09", "AC-10", "AC-12"]
files_hint: ["src/shared/voice-presets.ts", "src/shared/voice-presets.test.ts"]
owner: "dmytro.hopko"
estimate: "S"
context_budget: "M"
status: "done"
step: "COMMIT"
---

# T2 — Shared voice-preset schemas, name rules and presetMatches

## Place in the sequence

- **Blocked by:** nothing · **Blocks:** T3.
- **Lane:** see files_hint overlaps.

## Why (user story)

> ### US-02: Apply a speaker
> 
> **As the** Owner
> **I want** to pick a saved preset on the Speech page and have its model, voice and settings applied at once
> **So that** I can record with it without setting every control again
>
> — `spec.md §4, US-02, verbatim`

## Inlined context

> SAD §4 item 2/3/8 + ADR-0058: one shared pure `presetMatches`; names counted as graphemes, unique by JS `toLowerCase()`; «No longer offered» = model absent, or a non-null voice a model with a voice list no longer lists.
>
> — `sad.md §4/§6 + adr/, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read [spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/). Do not guess.

## Data delta

No DB changes. — `data-model.md, abridged`

## API contract

Schemas `VoicePreset`, `PresetStats`, `CreatePresetRequest`, `UpdatePresetRequest`, `PresetRef` (contracts/openapi.yaml). — `contracts/openapi.yaml, abridged`

## Acceptance criteria

### AC-02 (US-01) — error

**Given** the Owner is naming a preset (saving a new one or renaming one)
**When** the name is empty after trimming, longer than 60 characters, or equal to another preset's name ignoring letter case (in any alphabet — «Диктор» and «диктор» clash) and surrounding spaces; length counts characters as the Owner sees them
**Then** nothing is saved and the dialog stays open saying respectively «Enter a name», «At most 60 characters» or «A voice named «<name>» already exists»; a name differing only in case from the preset's own current name is a valid rename; when the preset can't be saved for another reason the dialog says «Couldn't save — try again.» and keeps what was typed
— `spec.md §5, AC-02, verbatim`

### AC-05 (US-02, US-04) — domain invariant

**Given** a preset is applied
**When** the Owner changes the speech model, the voice or any voice setting (only the current values count, so changing a value and back restores plain «<name>»)
**Then** the Speech page shows the preset as «<name> · modified» while any value differs from the preset and as plain «<name>» again once every value equals it; a recording generated while it differs is saved with no preset link; a recording is linked only when the model, voice and settings sent equal the preset's at the moment Ukiyo receives the request — Ukiyo checks this itself, so a link never claims a setup the recording wasn't made with; «equal» means the same model, the same voice (the provider's default voice equals only the provider's default voice) and the settings sent — as the model accepts them, defaults filled in, delivery instructions trimmed, empty instructions meaning none — equal to the preset's stored settings exactly, so a setting the preset holds that the model no longer accepts counts as a difference (AC-10); «Detach» — an action next to the applied preset — removes the applied preset and leaves the form's values as they are; a preset that no longer exists stops being applied the same way
— `spec.md §5, AC-05, verbatim`

### AC-09 (US-02) — error

**Given** a preset whose speech model the provider no longer offers, or whose voice that model no longer lists among its voices
**When** the Owner sees it in the Speech page's preset list or in Voices
**Then** it is marked «No longer offered» and can't be applied (picking it does nothing but say «<model name> is no longer offered»), it can be renamed and deleted, its recordings stay listed on its page, and it applies again as before if the model and voice come back; when the speech model list can't be read the presets are listed but can't be applied until it loads
— `spec.md §5, AC-09, verbatim`

### AC-10 (US-02) — domain invariant

**Given** a preset holds a setting the speech model no longer accepts, or a value now outside the model's range
**When** the Owner applies it
**Then** the form shows only the settings the model accepts, brought into range, and the preset shows as «modified» until the Owner updates it — a preset is never silently changed by Ukiyo itself
— `spec.md §5, AC-10, verbatim`

### AC-12 (US-05) — domain invariant

**Given** a preset's recordings have known, pending and unavailable costs
**When** the Owner reads the preset's total cost
**Then** it is the sum of the known costs only, with what is missing named: «$0.42», «$0.42 + 1 pending», «$0.42 · 2 without a price», «$0.42 + 1 pending · 2 without a price»; with no known cost the sum reads «—» followed by the same counts («— + 1 pending»), and «—» alone only when the preset has no recordings; an unknown cost is never counted as zero and a recording's up-front estimate never enters the total; a pending cost that settles is reflected the next time the list or the page is read
— `spec.md §5, AC-12, verbatim`

## Definition of Done

src/shared/voice-presets.ts: VoicePreset/Stats/Responses/Create/Update schemas, presetName (trim, 1–60 graphemes via Intl.Segmenter, nameKey = toLowerCase), presetMatches(preset, setup, model) (settingsFor + key-order-free deep equal, null voice only equals null), presetAvailability(preset, models|undefined) → ok | retired | loading, presetCostText(stats); unit tests for each; gate green
