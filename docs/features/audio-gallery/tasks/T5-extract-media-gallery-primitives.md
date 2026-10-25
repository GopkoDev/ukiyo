---
id: T5
title: "Extract the media-neutral gallery primitives into a shared media-gallery layer"
layer: "ui"
deps: []
blocks: ["T6", "T7", "T11"]
acs: ["AC-20"]
files_hint: ["src/web/features/media-gallery/", "src/web/features/gallery/DialogBusy.tsx", "src/web/features/gallery/neighbours.ts", "src/web/features/gallery/gridPlace.ts", "src/web/features/gallery/Gallery.tsx"]
owner: "agent (sdd:implement)"
estimate: "S"
context_budget: "S"
status: "todo"
step: ""
---

# T5 — Extract the media-neutral gallery primitives into a shared media-gallery layer

## Place in the sequence

- **Blocked by:** — · **Blocks:** T6 — Extract the dialog stepping engine and frame from the image dialog, T7 — Extract the notes card from the image Notes, T11 — Build the Audio → Gallery section: grid, recording card, model choice and states · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** a gallery of all my recordings, newest first, where I can play each one in place
> **So that** I can find and listen to anything I made, not only the latest ten
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: extract the media-neutral gallery primitives into a shared media-gallery layer.

## Inlined context

> A shared `src/web/features/media-gallery/` layer: … the busy/escape/delete contexts, `neighbours`, `gridPlace` (card attribute as a parameter), `usePagingSentinel`; the image components become thin wrappers over it. Media-specific parts (cards, details, view parsing, query keys, cache patching) stay per medium. … the extraction is done first, against the unchanged image tests, before any audio UI uses it.
>
> — `adr/0049, Options 1 + outcome, abridged`

> **Hard rule:** every existing image gallery, dialog, curation, model and prompt view test passes with no change to what it expects.
>
> — `spec.md §6, Image gallery unchanged, verbatim`

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

- [ ] Move `DialogBusy.tsx`, `neighbours.ts` to `media-gallery/`; keep re-exports at the old paths
- [ ] `gridPlace.ts`: `bringCardIntoView(id, attr = "data-generation-id")` in media-gallery; image calls unchanged
- [ ] Extract the grid's sentinel/armed/paused logic from `Gallery.tsx` `Grid` into `media-gallery/usePagingSentinel.ts`; `Grid` uses it
- [ ] Run the image web suites unchanged

## Edge cases

| Case | Behaviour |
|---|---|
| dialog open while scrolling | sentinel paused, re-armed by the Owner's own scroll (unchanged) |

## Definition of Done

- [ ] all existing `src/web/features/gallery/*.test.tsx` and `App*.test.tsx` pass without edits
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
