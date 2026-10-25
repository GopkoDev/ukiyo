---
id: T13
title: "Build the recording dialog and page with notes, details and delete"
layer: "ui"
deps: ["T6", "T7", "T11"]
blocks: ["T14", "T15"]
acs: ["AC-05", "AC-06", "AC-07", "AC-08", "AC-09", "AC-11", "AC-12"]
files_hint: ["src/web/features/audio/gallery/RecordingDialog.tsx", "src/web/features/audio/gallery/RecordingDetail.tsx", "src/web/features/audio/gallery/RecordingNotes.tsx", "src/web/features/audio/DeleteRecording.tsx", "src/web/features/audio/gallery/RecordingDialog.test.tsx"]
owner: "agent (sdd:implement)"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T13 — Build the recording dialog and page with notes, details and delete

## Place in the sequence

- **Blocked by:** T6 — Extract the dialog stepping engine and frame from the image dialog, T7 — Extract the notes card from the image Notes, T11 — Build the Audio → Gallery section: grid, recording card, model choice and states · **Blocks:** T14 — Hand Reuse from the gallery to the Speech page, T15 — Prove cross-section coherence and the request budgets · **Wave:** 6.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to open a recording in a dialog with everything about it and step to its neighbours
> **So that** I can review recordings one after another, and share an address that opens one directly
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As the** Owner
> **I want** to add tags and a comment to a recording
> **So that** I can remember why I made it and group it with others
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As the** Owner
> **I want** to delete a recording from the gallery or its dialog
> **So that** recordings I don't want are gone from the machine
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task delivers: build the recording dialog and page with notes, details and delete.

## Inlined context

> SCR-04: Dialog; DialogFrame header: title = text excerpt, Newer/Older, Close; left: player + Download + full text; right: Reuse, Delete, NotesCard, Details (Model, Voice, Settings incl. full instructions, Created, Duration, Characters, File type, Cost = CostLabel + status Badge). States: loading · gone «This recording no longer exists.» · error «Couldn't load this recording» + Try again · busy · loading next · next failed · deleted notice «Recording deleted.» · not in order · delete failed «Couldn't delete this recording».
>
> — `screens.md, SCR-04, abridged`

> SCR-05 page: «← Gallery» (to All) + the same content in one column, no steps. SCR-07 confirm: «Delete this recording?», excerpt, «Its audio file, tags and comment are deleted too. This can't be undone.», Cancel (autofocus) / Delete; «Deleting…».
>
> — `screens.md, SCR-05, SCR-07, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `getRecording`; writes `setRecordingComment`, `addRecordingTag`, `removeRecordingTag`, `deleteRecording` via T10/step 18.

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

### AC-06 — cross-context

> **Given** the Owner has the address of one recording
> **When** the Owner opens it directly (pasted, reloaded or in a new tab)
> **Then** the recording shows on its own page under the audio gallery, with a way back to the gallery's «All» view (the address names the recording, not the view it was opened from), the same details and actions as the dialog, and no stepping. If it can't be read, the page or dialog says «Couldn't load this recording» with Try again. If the recording no longer exists, the page or the dialog says «This recording no longer exists» instead of an error, and tagging, commenting or deleting it changes nothing. After a deletion in the dialog, Back never returns to the deleted recording. A recording's address never opens an image generation, and a generation's address never opens a recording. The image gallery's own addresses and detail pages keep working as before.
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — happy path

> **Given** a recording is shown in its dialog or page
> **When** the Owner adds a tag, removes a tag, or writes and saves a comment
> **Then** the change is kept. The tag shows on the recording and on its card in every view where it appears at once, without a reload, and the card shows a comment marker once a comment is saved. A tag is trimmed, inner spaces are collapsed and it is lower-cased; adding one it already has changes nothing. The comment is edited with an explicit Save or Cancel, and the last save wins; saving an empty or whitespace-only comment removes it. The comment is kept exactly as written; tags are listed in the order they were added. Lengths count the characters the Owner sees, and any alphabet's letters are allowed. Tags and comments are always shown as plain text, never as markup — exactly the rules of image generations' notes (curate-gallery).
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — error

> **Given** the Owner is adding a tag or saving a comment
> **When** the tag is empty, longer than 32 characters or uses characters outside letters, digits, spaces, «-» and «_»; the recording already has 10 tags; or the comment is longer than 2 000 characters
> **Then** nothing is saved, the typed text stays in the field, and the field says why in plain words, for example «Tags may contain letters, digits, spaces, - and _ (1–32 characters)» or «Comment must be at most 2 000 characters». A recording that was deleted elsewhere meanwhile shows that it no longer exists.
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

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

### AC-12 — error

> **Given** the Owner has confirmed a deletion
> **When** the deletion fails
> **Then** the recording stays complete: its file still plays, and its tags and comment are unchanged. The page says «Couldn't delete this recording». If it was already deleted elsewhere, the Owner sees that it no longer exists.
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `RecordingDialog` = `DialogFrame` + `useDialogStepping` with the audio list query, `/audio/recordings/:id` address, «Recording deleted.» notices, `patchRecordings`
- [ ] `RecordingDetail` (layout dialog | page) + `useRecording(id)` (pending refetch 10 s)
- [ ] `RecordingNotes` = `NotesCard` + audio api + patchRecordings
- [ ] `DeleteRecording`: report busy, use `DialogDeleteContext` when present; page → `/audio/gallery?deleted=1`; copy mentions tags and comment
- [ ] Wire `detail: {route:"recording", label:"Recording", Page, Dialog}` on the audio section
- [ ] Component tests: stepping, busy, Esc, keys on player, delete branches, gone/error

## Edge cases

| Case | Behaviour |
|---|---|
| arrow key on focused player | player seeks, no step |
| delete the model's last recording from its grid | closes onto «No recordings with <model>» |
| Close with unsaved comment | dialog closes, edit dropped |

## Definition of Done

- [ ] component tests for SCR-04/05/06/07 states pass
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
