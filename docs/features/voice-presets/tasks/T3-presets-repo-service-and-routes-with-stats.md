---
id: T3
title: "Presets repo, service and routes with stats"
layer: "app"
deps: ["T1", "T2"]
blocks: ["T4"]
acs: ["AC-01", "AC-02", "AC-06", "AC-07", "AC-11", "AC-12", "AC-17"]
files_hint: ["src/server/modules/audio/presets-repo.ts", "src/server/modules/audio/service.ts", "src/server/modules/audio/routes.ts", "src/server/app.ts", "src/server/modules/audio/presets.int.test.ts"]
owner: "dmytro.hopko"
estimate: "M"
context_budget: "L"   # justified: one screen family; the ACs share one state machine
status: "done"
step: "COMMIT"
---

# T3 — Presets repo, service and routes with stats

## Place in the sequence

- **Blocked by:** T1, T2 · **Blocks:** T4.
- **Lane:** see files_hint overlaps.

## Why (user story)

> ### US-01: Save a speaker
> 
> **As the** Owner
> **I want** to save the model, voice and settings on the Speech page under a name
> **So that** I can get exactly this speaker back later
>
> — `spec.md §4, US-01, verbatim`

## Inlined context

> SAD §4 items 3–4, §6.2: catalog read only for a setup change (peek first — never waits on the provider when a list was read); stats computed on read: count, known sum, pending/unavailable counts, max(created_at).
>
> — `sad.md §4/§6 + adr/, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read [spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/). Do not guess.

## Data delta

`voice_presets` read/write; stats join over `voice_preset_recordings` + `audio_generations` (read-only). — `data-model.md, abridged`

## API contract

listVoicePresets, createVoicePreset, getVoicePreset, updateVoicePreset, deleteVoicePreset. — `contracts/openapi.yaml, abridged`

## Acceptance criteria

### AC-01 (US-01) — happy path

**Given** the Speech page shows a speech model, a voice (or the provider's default voice) and its voice settings, and no preset is applied
**When** the Owner chooses «Save», enters a name and confirms
**Then** a voice preset is kept on the machine with that name, the speech model, the voice and exactly the settings that model accepts (the ones the Speech page would send) — never the text; the preset becomes the applied one («<name>» shown, not «modified»), it appears in the Speech page's preset list and in Voices, and it is still there after a reload or a restart; the name field starts with a suggestion «<voice> · <model name>» the Owner may change
— `spec.md §5, AC-01, verbatim`

### AC-02 (US-01) — error

**Given** the Owner is naming a preset (saving a new one or renaming one)
**When** the name is empty after trimming, longer than 60 characters, or equal to another preset's name ignoring letter case (in any alphabet — «Диктор» and «диктор» clash) and surrounding spaces; length counts characters as the Owner sees them
**Then** nothing is saved and the dialog stays open saying respectively «Enter a name», «At most 60 characters» or «A voice named «<name>» already exists»; a name differing only in case from the preset's own current name is a valid rename; when the preset can't be saved for another reason the dialog says «Couldn't save — try again.» and keeps what was typed
— `spec.md §5, AC-02, verbatim`

### AC-06 (US-03) — happy path

**Given** an applied preset is shown as modified
**When** the Owner chooses «Save»
**Then** Ukiyo offers «Update «<name>»» and «Save as new»; «Update» replaces the preset's model, voice and settings with the current ones, keeps its name and links, and leaves the preset applied and unchanged; «Save as new» asks for a name (AC-01, AC-02) and applies the new preset; past recordings of the updated preset keep the model, voice and settings they were made with; while a preset is applied and unchanged «Save» has nothing to save and is unavailable
— `spec.md §5, AC-06, verbatim`

### AC-07 (US-03) — happy path

**Given** the Owner has a preset
**When** the Owner renames it (from the Speech page's applied preset or from Voices) or deletes it after confirming «Delete «<name>»? Its N recordings are kept.»
**Then** a rename shows the new name everywhere the preset appears — the Speech page, Voices, its page, the recording details — without a reload; a deletion removes it from the preset list and Voices, an applied deleted preset stops being applied (the form keeps its values), its page then reads «This voice no longer exists.» with a way back to Voices, and every recording it made is still in the audio gallery, unchanged, with no preset named; when an update, rename or deletion can't be saved, nothing changes and the Owner is told «Couldn't save — try again.» (or «Couldn't delete — try again.»)
— `spec.md §5, AC-07, verbatim`

### AC-11 (US-05) — happy path

**Given** the Owner has presets
**When** the Owner opens Voices from the Audio group of the navigation bar
**Then** the page lists every preset by name (ignoring case) with: its name, its speech model's name, its voice («Provider default» for the provider's default voice), its settings as the gallery cards show them («speed 1.1», «speaker boost»…), its number of recordings («3 recordings», «No recordings yet»), its total cost and its last use — when its newest existing recording was made («2 h ago»), «Never used» when it has none; the navigation's Audio group lists Speech, Gallery, Voices, Models in that order and marks Voices as current, on the list and on a preset's page
— `spec.md §5, AC-11, verbatim`

### AC-12 (US-05) — domain invariant

**Given** a preset's recordings have known, pending and unavailable costs
**When** the Owner reads the preset's total cost
**Then** it is the sum of the known costs only, with what is missing named: «$0.42», «$0.42 + 1 pending», «$0.42 · 2 without a price», «$0.42 + 1 pending · 2 without a price»; with no known cost the sum reads «—» followed by the same counts («— + 1 pending»), and «—» alone only when the preset has no recordings; an unknown cost is never counted as zero and a recording's up-front estimate never enters the total; a pending cost that settles is reflected the next time the list or the page is read
— `spec.md §5, AC-12, verbatim`

### AC-17 (US-01, US-02, US-03, US-04, US-05, US-06) — authorization

**Given** a page from another site is open in the Owner's browser
**When** it tries to read, create, change or delete a voice preset, or to generate a recording linked to one
**Then** Ukiyo refuses it like every other Ukiyo request and nothing changes
— `spec.md §5, AC-17, verbatim`

## Definition of Done

presets-repo.ts (CRUD, stats aggregate by name_key, unique clash → VALIDATION_ERROR fields.name), service operations (setup validated against catalog via peek() then fetch, settingsFor, checkVoice; rename without catalog), routes GET/POST /audio/presets, GET/PATCH/DELETE /audio/presets/:id wired in createApp; integration tests incl. foreign origin; gate green
