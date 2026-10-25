---
id: T10
title: "Add the audio gallery's API client, view parsing, query keys and cache patching"
layer: "ui"
deps: ["T3"]
blocks: ["T11", "T14"]
acs: ["AC-04", "AC-13", "AC-18"]
files_hint: ["src/web/lib/api.ts", "src/web/features/audio/queryKeys.ts", "src/web/features/audio/gallery/audioGalleryView.ts", "src/web/features/audio/gallery/queries.ts", "src/web/features/audio/gallery/patchRecordings.ts", "src/web/features/audio/gallery/useRecordingPendingCost.ts"]
owner: "agent (sdd:implement)"
estimate: "M"
context_budget: "M"
status: "done"
step: "COMMIT"
---

# T10 — Add the audio gallery's API client, view parsing, query keys and cache patching

## Place in the sequence

- **Blocked by:** T3 — Expose model filter, model groups and curation through the audio service, routes and shared schemas · **Blocks:** T11 — Build the Audio → Gallery section: grid, recording card, model choice and states, T14 — Hand Reuse from the gallery to the Speech page · **Wave:** 4.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** a gallery of all my recordings, newest first, where I can play each one in place
> **So that** I can find and listen to anything I made, not only the latest ten
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As the** Owner
> **I want** to see only one speech model's recordings, or an overview grouped by model
> **So that** I can compare what each model sounds like and costs
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers: add the audio gallery's API client, view parsing, query keys and cache patching.

## Inlined context

> Every recordings read sits under `["recordings"]`: `["recordings","recent"]` (Speech recent recordings), `["recordings","list",view…]` (gallery views), `["recordings","models"]` (model choice + By model), `["recording", id]` (detail). A new recording or a deletion invalidates `["recordings"]` (views not on screen re-read only when next shown); a deletion from the dialog first removes the card in place, as for images; a curation or cost change patches the cards in place by data shape … and invalidates only the detail and the recent list.
>
> — `sad.md §8, Query keys, abridged`

> A pending card mounts a watcher that reads only that recording every 10 s and patches it everywhere when it settles (the image precedent, ADR-0031).
>
> — `sad.md §8, Pending cost, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Client for `listRecordings(cursor, limit, {model})`, `listRecordingModels(latest)`, `setRecordingComment`, `addRecordingTag`, `removeRecordingTag` — parsed with the shared schemas.

— `contracts/openapi.yaml, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-04 — domain invariant

> **Given** a card's cost is pending
> **When** the provider reports the charge, or Ukiyo gives up waiting
> **Then** within 10 seconds that recording's card in every view on screen, its open dialog or page, changes to the known amount, or to «cost unavailable» with its estimate, without a reload and without re-reading every loaded page. An unknown cost never shows as $0. Recordings kept from the prototype show their amount as the cost.
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — happy path

> **Given** recordings were made with several speech models
> **When** the Owner chooses one model from the gallery's model choice, which lists every model that has recordings with its count, ordered by each model's newest stored recording
> **Then** the grid shows only that model's recordings, newest first, with the same paging. A heading names the model with its count and offers «Show all recordings». Stepping in a dialog opened from this grid stays within the model. The view is kept in the address, so Back, a reload or a shared address shows the same view. Each view keeps its own scroll position; «Show all» starts at the top. Choosing Gallery in the navigation opens «All». If the model choice or «By model» can't be read, it says so with Try again.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — cross-context

> **Given** the Owner generates a recording on the Speech page, deletes one there or in the gallery, or curates one in the gallery
> **When** the Owner moves between the Speech page and the audio gallery
> **Then** both show the same recordings: a new recording is first in the gallery — also when it finishes while the gallery is on screen, where it appears first in every open view at once — and a deleted one is in neither — a deletion on the Speech page also removes its tags and comment, and drops its card from the grid, the model views and their counts. The image gallery, its model views and the recent generations next to the Generate form never show recordings, and the audio gallery never shows image generations.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `api.ts`: `recordings(cursor, limit, filter?)`, `recordingModels(latest)`, `setRecordingComment`, `addRecordingTag`, `removeRecordingTag`
- [ ] `audioGalleryView.ts`: `{kind:"all"}|{kind:"model",model}|{kind:"models"}` ↔ `?model=` / `?view=models`; `viewKey`; dialog-state views
- [ ] `queries.ts`: infinite list options per view (24 per page, staleTime ∞ like the image grid), models options (latest 4)
- [ ] `patchRecordings(qc, id, patch|"remove")` over every `["recordings"]` entry by shape (pages, recent page, groups with counts) + `["recording", id]`
- [ ] `useRecordingPendingCost(r)` (10 s, only that id)
- [ ] Unit tests for view parse/serialize and patching

## Edge cases

| Case | Behaviour |
|---|---|
| model id with slashes and dots | round-trips the address unchanged |
| remove the last item of a group | group dropped |

## Definition of Done

- [ ] unit tests pass
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
