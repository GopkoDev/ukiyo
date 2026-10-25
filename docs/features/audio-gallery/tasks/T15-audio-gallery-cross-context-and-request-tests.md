---
id: T15
title: "Prove cross-section coherence and the request budgets"
layer: "tests"
deps: ["T12", "T13", "T14"]
blocks: ["T16"]
acs: ["AC-02", "AC-18", "AC-20", "AC-21"]
files_hint: ["src/web/features/audio/gallery/CrossContext.test.tsx", "src/web/features/audio/gallery/Requests.nfr.test.tsx"]
owner: "agent (sdd:implement)"
estimate: "S"
context_budget: "M"
status: "todo"
step: ""
---

# T15 — Prove cross-section coherence and the request budgets

## Place in the sequence

- **Blocked by:** T12 — Build the audio «By model» overview, T13 — Build the recording dialog and page with notes, details and delete, T14 — Hand Reuse from the gallery to the Speech page · **Blocks:** T16 — Register the new components and update the architecture map · **Wave:** 8.
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

This task delivers: prove cross-section coherence and the request budgets.

## Inlined context

> | Requests while browsing | ≤ 1 request per page; none while one is in flight or after the last; a dialog step costs ≤ 1 recording read and 0 for one already read; a tag or comment change costs 0 list-page reads |
> | Pending cost on cards | a settled cost shows on every visible card, dialog and page within 10 s; refreshed by asking only for the pending recordings, not every loaded page, at most once every 10 s |
> | Audio loading | 0 audio bytes fetched for cards the Owner hasn't played |
>
> — `spec.md §6, NFR rows, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Mocked typed client only.

## Acceptance criteria

### AC-02 — domain invariant

> **Given** one card's player is playing
> **When** the Owner starts another card's player (in the grid, the dialog or the Speech page)
> **Then** the first one pauses where it was (playing it again resumes there), so at most one recording plays at a time in the Ukiyo tab. Opening a recording's dialog pauses a playing card; closing the dialog stops the dialog's player. Moving to another section pauses what was playing on the section left behind. A recording that finishes generating while the Owner is outside the Speech page does not start playing by itself. A player loads its audio only when the Owner starts it, not when the card appears, and a card's cost refreshing never restarts or interrupts its player.
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — cross-context

> **Given** the Owner generates a recording on the Speech page, deletes one there or in the gallery, or curates one in the gallery
> **When** the Owner moves between the Speech page and the audio gallery
> **Then** both show the same recordings: a new recording is first in the gallery — also when it finishes while the gallery is on screen, where it appears first in every open view at once — and a deleted one is in neither — a deletion on the Speech page also removes its tags and comment, and drops its card from the grid, the model views and their counts. The image gallery, its model views and the recent generations next to the Generate form never show recordings, and the audio gallery never shows image generations.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — domain invariant

> **Given** the image gallery is open, or an image generation is open in its dialog
> **When** the Owner uses it after this step
> **Then** every image gallery behaviour works as before: grid, paging, dialog stepping, notes, tags, delete, re-run, use as input, and the model and prompt views. Pieces now shared with the audio gallery change nothing the Owner sees there.
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — domain invariant

> **Given** the Owner browses any view of the audio gallery while recordings are added and deleted
> **When** pages load, or a recording is made or deleted
> **Then** each recording appears once in a view — never twice and never skipped at a page boundary. A model's count equals its recordings, and «Show all N» opens exactly N. A new recording moves its model's section to the top of «By model». Deleting a model's last recording removes the model from the model choice and from «By model»; in that model's own view the page then shows «No recordings with <model>» (AC-15).
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] App-level test: generate on Speech → card first in the open gallery; delete in gallery → gone from Speech recent + latest; delete on Speech → gone from gallery views and counts
- [ ] Request counting tests per §6
- [ ] Run the image suites as the AC-20 guard

## Edge cases

| Case | Behaviour |
|---|---|
| deletion while By model is off screen | re-read when next shown only |

## Definition of Done

- [ ] tests pass
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
