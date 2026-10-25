---
id: T8
title: "Add the recording detail route and let sections own their detail renderers"
layer: "wiring"
deps: []
blocks: ["T9", "T11"]
acs: ["AC-06", "AC-20"]
files_hint: ["src/web/lib/router.tsx", "src/web/sections.tsx", "src/web/App.tsx", "src/web/lib/router.test.tsx", "src/web/sections.test.tsx"]
owner: "agent (sdd:implement)"
estimate: "M"
context_budget: "S"
status: "todo"
step: ""
---

# T8 — Add the recording detail route and let sections own their detail renderers

## Place in the sequence

- **Blocked by:** — · **Blocks:** T9 — Coordinate playback app-wide so one recording plays at a time, T11 — Build the Audio → Gallery section: grid, recording card, model choice and states · **Wave:** 1.
- **Lane:** serialized with tasks sharing `src/web/App.tsx`, `src/web/sections.tsx`.

## Why (user story)

> **As the** Owner
> **I want** to open a recording in a dialog with everything about it and step to its neighbours
> **So that** I can review recordings one after another, and share an address that opens one directly
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: add the recording detail route and let sections own their detail renderers.

## Inlined context

> A second route kind `{ name: "recording", id }` for `/audio/recordings/:id`, and a `detail` slot on `Section` (`route` kind, crumb `label`, `Page`, `Dialog`) that App renders for the section that already claims the route through the existing `owns`; the dialog state names its gallery (`"gallery"` | `"audio-gallery"`).
>
> — `adr/0048, Option 1 (chosen), verbatim`

> Call sites to generalise: `App.tsx` (crumb «Generation», the `hidden` rule for detail routes, the detail/dialog rendering), `router.tsx` (`dialogState` typed on the image `GalleryView`, `isDialogVisit` checking `name === "detail"` and `dialog === "gallery"`), and Gallery's `owns`.
>
> — `adr/0048, Consequences, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 — cross-context

> **Given** the Owner has the address of one recording
> **When** the Owner opens it directly (pasted, reloaded or in a new tab)
> **Then** the recording shows on its own page under the audio gallery, with a way back to the gallery's «All» view (the address names the recording, not the view it was opened from), the same details and actions as the dialog, and no stepping. If it can't be read, the page or dialog says «Couldn't load this recording» with Try again. If the recording no longer exists, the page or the dialog says «This recording no longer exists» instead of an error, and tagging, commenting or deleting it changes nothing. After a deletion in the dialog, Back never returns to the deleted recording. A recording's address never opens an image generation, and a generation's address never opens a recording. The image gallery's own addresses and detail pages keep working as before.
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — domain invariant

> **Given** the image gallery is open, or an image generation is open in its dialog
> **When** the Owner uses it after this step
> **Then** every image gallery behaviour works as before: grid, paging, dialog stepping, notes, tags, delete, re-run, use as input, and the model and prompt views. Pieces now shared with the audio gallery change nothing the Owner sees there.
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `parseRoute`: `/audio/recordings/:id` → `{name:"recording", id}`
- [ ] `dialogState(gallery, views)` / `isDialogVisit(route, gallery?)` generalised; image callers keep their behaviour
- [ ] `Section.detail?: {route, label, Page, Dialog}`; Gallery gets `detail` for generations
- [ ] App: detail kinds rendered from `current.detail`; kept-mounted sections hidden on any detail route; crumb uses `detail.label`
- [ ] Unit tests: parse both kinds, a recording id never matches the generation route and vice versa

## Edge cases

| Case | Behaviour |
|---|---|
| `/audio/recordings/` without id | page route → not found |
| generation address after the change | renders exactly as before |

## Definition of Done

- [ ] router + sections unit tests pass; all App tests pass without edits
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
