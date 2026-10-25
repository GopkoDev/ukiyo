---
id: T8
title: "Voices list, preset page and the recording's preset row"
layer: "ui"
deps: ["T6"]
blocks: ["T9"]
acs: ["AC-04", "AC-07", "AC-09", "AC-11", "AC-12", "AC-13", "AC-14", "AC-16", "AC-19"]
files_hint: ["src/web/features/audio/presets/", "src/web/features/audio/gallery/RecordingDetail.tsx", "src/web/features/audio/gallery/patchRecordings.ts", "src/web/features/audio/presets/Voices.test.tsx"]
owner: "dmytro.hopko"
estimate: "M"
context_budget: "L"   # justified: one screen family; the ACs share one state machine
status: "todo"
step: ""
---

# T8 — Voices list, preset page and the recording's preset row

## Place in the sequence

- **Blocked by:** T6 · **Blocks:** T9.
- **Lane:** see files_hint overlaps.

## Why (user story)

> ### US-06: Listen to one speaker's recordings
> 
> **As the** Owner
> **I want** to open a preset and browse all its recordings, and apply it from there
> **So that** I can compare its recordings and record with it again
> 
> ## 5. Acceptance criteria
>
> — `spec.md §4, US-06, verbatim`

## Inlined context

> SAD §4 items 5, 6, 11; screens.md SCR-04, SCR-05, SCR-06.
>
> — `sad.md §4/§6 + adr/, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read [spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/). Do not guess.

## Data delta

No DB changes. — `data-model.md, abridged`

## API contract

Calls listVoicePresets, getVoicePreset, listRecordings(preset). — `contracts/openapi.yaml, abridged`

## Acceptance criteria

### AC-04 (US-04) — happy path

**Given** a preset is applied and unchanged
**When** the Owner generates a recording
**Then** the recording is saved linked to that preset; its detail (dialog and page) names the preset with a way to open the preset's page; the preset's count, total and last use include it as soon as the recording is saved
— `spec.md §5, AC-04, verbatim`

### AC-07 (US-03) — happy path

**Given** the Owner has a preset
**When** the Owner renames it (from the Speech page's applied preset or from Voices) or deletes it after confirming «Delete «<name>»? Its N recordings are kept.»
**Then** a rename shows the new name everywhere the preset appears — the Speech page, Voices, its page, the recording details — without a reload; a deletion removes it from the preset list and Voices, an applied deleted preset stops being applied (the form keeps its values), its page then reads «This voice no longer exists.» with a way back to Voices, and every recording it made is still in the audio gallery, unchanged, with no preset named; when an update, rename or deletion can't be saved, nothing changes and the Owner is told «Couldn't save — try again.» (or «Couldn't delete — try again.»)
— `spec.md §5, AC-07, verbatim`

### AC-09 (US-02) — error

**Given** a preset whose speech model the provider no longer offers, or whose voice that model no longer lists among its voices
**When** the Owner sees it in the Speech page's preset list or in Voices
**Then** it is marked «No longer offered» and can't be applied (picking it does nothing but say «<model name> is no longer offered»), it can be renamed and deleted, its recordings stay listed on its page, and it applies again as before if the model and voice come back; when the speech model list can't be read the presets are listed but can't be applied until it loads
— `spec.md §5, AC-09, verbatim`

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

### AC-13 (US-06) — happy path

**Given** a preset has recordings
**When** the Owner opens it from Voices
**Then** its page (an address of its own that a reload or a copied link opens again) shows the preset's name, model, voice, settings, count, total and last use with «Apply», «Rename» and «Delete», and below them a newest-first grid of exactly its recordings in the audio gallery's cards, loading more as the Owner scrolls; each card shows the model, voice and settings that recording was actually made with (recordings made before an update may differ from the preset's current setup); opening a card shows the recording dialog over this grid, ← → step through this preset's recordings only, Back closes the dialog and returns to the preset's page at the same scroll; with no recordings the page reads «No recordings with this voice yet.» with «Apply»
— `spec.md §5, AC-13, verbatim`

### AC-14 (US-06) — cross-context

**Given** the Owner is on Voices or a preset's page
**When** the Owner chooses «Apply»
**Then** the Speech page opens with that preset applied and the text untouched (step 19's rule, audio-gallery AC-17: a request in flight is never swapped — «Wait for the current recording to finish, then apply.»); Back returns to where «Apply» was chosen; a preset that no longer exists or can't be applied leaves the form as it was and says why
— `spec.md §5, AC-14, verbatim`

### AC-16 (US-05) — cross-context

**Given** a preset's recording is deleted, or a new one is made, anywhere in Ukiyo
**When** the Owner looks at Voices or the preset's page without reloading
**Then** the count, the total and the last use match the recordings that exist, and a deleted recording's card is gone from the preset's grid; deleting a recording never deletes or changes a preset beyond its count, total and last use; the deleted recording's dialog steps to its neighbour within the preset's recordings as the gallery's does
— `spec.md §5, AC-16, verbatim`

### AC-19 (US-05, US-06) — error

**Given** the presets, a preset's page or its recordings can't be read
**When** the Owner opens Voices or a preset's page, or scrolls for more of its recordings
**Then** Voices says «Couldn't load your voices.» with «Try again»; a preset's page says «Couldn't load this voice.» with «Try again» (and «This voice no longer exists.» only when it was deleted); a failed further page says «Couldn't load more.» with «Try again» and keeps the cards already shown; on the Speech page an unreadable preset list says «Couldn't load your voices.» in the preset list and never blocks generating
— `spec.md §5, AC-19, verbatim`

## Definition of Done

SCR-04/05/06 built: VoicesPage (PresetCard grid, empty/error), PresetPage (header + RecordingCard grid with paging, dialog over it stepping within the preset, gone/error states, Apply/Rename/Delete), RecordingDetail «Voice preset» row; patchRecordings remove invalidates voice-presets; component tests; gate green
