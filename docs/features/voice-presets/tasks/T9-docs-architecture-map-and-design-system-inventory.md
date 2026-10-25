---
id: T9
title: "Architecture map and design-system inventory"
layer: "docs"
deps: ["T7", "T8"]
blocks: []
acs: ["AC-11"]
files_hint: ["docs/architecture-map.md", "docs/design-system.md", "docs/features/voice-presets/tasks/"]
owner: "dmytro.hopko"
estimate: "S"
context_budget: "M"
status: "todo"
step: ""
---

# T9 — Architecture map and design-system inventory

## Place in the sequence

- **Blocked by:** T7, T8 · **Blocks:** nothing.
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

> SAD §5 building blocks.
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

## Definition of Done

architecture-map (audio module presets, migrations 0001–0016, sections incl. Voices, ADR-0057…0060) and design-system inventory (PresetSelect, dialogs, PresetCard, VoicesPage, PresetPage) updated; tasks marked done
