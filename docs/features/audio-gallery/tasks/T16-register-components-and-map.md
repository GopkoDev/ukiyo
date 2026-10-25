---
id: T16
title: "Register the new components and update the architecture map"
layer: "docs"
deps: ["T15"]
blocks: []
acs: ["AC-20"]
files_hint: ["docs/design-system.md", "docs/architecture-map.md"]
owner: "agent (sdd:implement)"
estimate: "S"
context_budget: "S"
status: "todo"
step: ""
---

# T16 — Register the new components and update the architecture map

## Place in the sequence

- **Blocked by:** T15 — Prove cross-section coherence and the request budgets · **Blocks:** — · **Wave:** 9.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** a gallery of all my recordings, newest first, where I can play each one in place
> **So that** I can find and listen to anything I made, not only the latest ten
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: register the new components and update the architecture map.

## Inlined context

> The existing image gallery components (`Tile`, `CardBadges`, `Notes`, `GenerationDialog`, `ByModel`, `GalleryViews`) are not yet in the design-system inventory; implement registers them together with the new ones.
>
> — `screens.md, New components, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-20 — domain invariant

> **Given** the image gallery is open, or an image generation is open in its dialog
> **When** the Owner uses it after this step
> **Then** every image gallery behaviour works as before: grid, paging, dialog stepping, notes, tags, delete, re-run, use as input, and the model and prompt views. Pieces now shared with the audio gallery change nothing the Owner sees there.
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] design-system inventory rows: RecordingCard, RecordingDetail, NotesCard, DialogFrame, AudioGalleryViews + the image gallery components
- [ ] architecture-map: audio module rows (curation, model views), migrations 0013/0014, media-gallery layer, recording route, sections list

## Edge cases

| Case | Behaviour |
|---|---|
| — | — |

## Definition of Done

- [ ] docs updated
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
