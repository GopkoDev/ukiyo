---
id: T6
title: "Extract the dialog stepping engine and frame from the image dialog"
layer: "ui"
deps: ["T5"]
blocks: ["T13"]
acs: ["AC-05", "AC-09", "AC-11", "AC-20"]
files_hint: ["src/web/features/media-gallery/useDialogStepping.ts", "src/web/features/media-gallery/DialogFrame.tsx", "src/web/features/gallery/GenerationDialog.tsx"]
owner: "agent (sdd:implement)"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T6 — Extract the dialog stepping engine and frame from the image dialog

## Place in the sequence

- **Blocked by:** T5 — Extract the media-neutral gallery primitives into a shared media-gallery layer · **Blocks:** T13 — Build the recording dialog and page with notes, details and delete · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to open a recording in a dialog with everything about it and step to its neighbours
> **So that** I can review recordings one after another, and share an address that opens one directly
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As the** Owner
> **I want** to delete a recording from the gallery or its dialog
> **So that** recordings I don't want are gone from the machine
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task delivers: extract the dialog stepping engine and frame from the image dialog.

## Inlined context

> The shared engine (ADR-0049) owns neighbours, next-page loading, busy blocking, Esc claims, delete-then-move and close-to-place; each medium supplies its list query, its detail renderer, its address and its notices («Generation deleted.» vs «Recording deleted.»).
>
> — `sad.md §8, Dialog stepping, verbatim`

> **Hard rule:** image tests keep their expectations (spec AC-20, §6).
>
> — `adr/0049, Decision drivers, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-05 — happy path

> **Given** the Owner is on the audio gallery grid
> **When** the Owner opens a card
> **Then** a dialog shows the recording over the grid:
> - a player and a download action;
> - its full text;
> - the model's name and the voice;
> - every setting it was made with, including any delivery instructions in full;
> - when it was made and how long the request took;
> - the billed characters and the file type;
> - the cost with its status and the estimate.
>
> Newer and Older step through the grid's order as loaded, also with ← and →. Stepping past the last loaded card loads the next page, then moves on; if that page can't be read, the dialog stays on the current recording and says «Couldn't load the next one» with Try again. The address shows this recording. Close, Esc or Back returns to the grid where the Owner left it, with the last shown card in view.
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** the dialog has an unsaved comment edit, typed tag text that isn't added, or an open delete confirmation
> **When** the Owner tries to step to a neighbour
> **Then** stepping is unavailable, with the reason «Save or cancel your changes first». Esc first cancels an open comment edit, and closes the dialog only on the next press. Esc likewise closes an open delete confirmation before the dialog. Close, Back and Reuse are not blocked: as in the image dialog, they leave the recording and drop an unsaved comment edit or typed tag text. Nothing typed for one recording can ever apply to another. Inside a text field, ← and → move the cursor and never step. While the dialog's player has the keyboard focus, ← and → belong to the player and never step. Stepping to a neighbour stops the current playback.
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy path

> **Given** a recording is shown in its dialog or on its page (as for image generations, a card has no Delete)
> **When** the Owner chooses Delete and confirms
> **Then** the recording, its audio file, its tags and its comment are gone together, with no undo. In the dialog, the neighbour is chosen from the order as it was before the deletion: the next older recording shows, loading the next page when the deleted one was the last loaded, or the newer one when there is no older, with «Recording deleted.» When there is none, or that next page can't be read, the dialog closes onto the grid with the notice. On the page, the Owner lands on the gallery with the notice. The card leaves the grid, any model view and the overview counts, and the Speech page's recent recordings and latest result drop it too, with no reload. Ukiyo stops waiting for its cost.
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — domain invariant

> **Given** the image gallery is open, or an image generation is open in its dialog
> **When** the Owner uses it after this step
> **Then** every image gallery behaviour works as before: grid, paging, dialog stepping, notes, tags, delete, re-run, use as input, and the model and prompt views. Pieces now shared with the audio gallery change nothing the Owner sees there.
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `useDialogStepping({id, query (infinite), go(id), onDeletedNotice, closeNotice, cardAttr, keepsScroll})` returns nav, step handlers, busy/escape/delete context values, afterDelete
- [ ] `DialogFrame` renders header (title, Newer/Older with tooltips, Close), notice strips, contexts, body
- [ ] `GenerationDialog` becomes a wrapper: image query, `/generations/:id` address, image notices, `patchSummaries`/invalidations as today
- [ ] Arrow keys: also ignore when the event target is an `audio`/`video` element (no image impact)

## Edge cases

| Case | Behaviour |
|---|---|
| refresh pushes the last card off the tail | anchored at end (unchanged) |
| delete of the last loaded card with more pages | loads the next page, then moves; failure closes with notice |

## Definition of Done

- [ ] `GenerationDialog.test.tsx`, `DialogViews.test.tsx`, `GenerationDialog.nfr.test.tsx`, `App.dialog.test.tsx` pass without edits
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
