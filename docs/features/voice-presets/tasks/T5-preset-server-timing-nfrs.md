---
id: T5
title: "Preset server timing NFRs"
layer: "tests"
deps: ["T4"]
blocks: []
acs: ["AC-11", "AC-13"]
files_hint: ["src/server/modules/audio/presets.nfr.int.test.ts"]
owner: "dmytro.hopko"
estimate: "S"
context_budget: "M"
status: "done"
step: "COMMIT"
---

# T5 — Preset server timing NFRs

## Place in the sequence

- **Blocked by:** T4 · **Blocks:** nothing.
- **Lane:** see files_hint overlaps.

## Why (user story)

> ### US-05: Review my speakers
> 
> **As the** Owner
> **I want** a Voices section listing every preset with its model, voice, settings, number of recordings, total cost and last use
> **So that** I can see which speakers I use and what they cost
>
> — `spec.md §4, US-05, verbatim`

## Inlined context

> spec §6 rows Voices list / Preset page grid / Preset changes, verbatim targets.
>
> — `sad.md §4/§6 + adr/, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read [spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/). Do not guess.

## Data delta

No DB changes. — `data-model.md, abridged`

## API contract

Internal — no API surface. — `contracts/openapi.yaml, abridged`

## Acceptance criteria

### AC-11 (US-05) — happy path

**Given** the Owner has presets
**When** the Owner opens Voices from the Audio group of the navigation bar
**Then** the page lists every preset by name (ignoring case) with: its name, its speech model's name, its voice («Provider default» for the provider's default voice), its settings as the gallery cards show them («speed 1.1», «speaker boost»…), its number of recordings («3 recordings», «No recordings yet»), its total cost and its last use — when its newest existing recording was made («2 h ago»), «Never used» when it has none; the navigation's Audio group lists Speech, Gallery, Voices, Models in that order and marks Voices as current, on the list and on a preset's page
— `spec.md §5, AC-11, verbatim`

### AC-13 (US-06) — happy path

**Given** a preset has recordings
**When** the Owner opens it from Voices
**Then** its page (an address of its own that a reload or a copied link opens again) shows the preset's name, model, voice, settings, count, total and last use with «Apply», «Rename» and «Delete», and below them a newest-first grid of exactly its recordings in the audio gallery's cards, loading more as the Owner scrolls; each card shows the model, voice and settings that recording was actually made with (recordings made before an update may differ from the preset's current setup); opening a card shows the recording dialog over this grid, ← → step through this preset's recordings only, Back closes the dialog and returns to the preset's page at the same scroll; with no recordings the page reads «No recordings with this voice yet.» with «Apply»
— `spec.md §5, AC-13, verbatim`

## Definition of Done

nfr test: 200 presets × 5 000 recordings list ≤ 100 ms p95 without provider call; preset page ≤ 100 ms p95; save/update/rename/delete ≤ 50 ms p95 with a stale catalog entry; gate green
