---
id: T4
title: "Add the audio gallery's server timing tests"
layer: "tests"
deps: ["T3"]
blocks: []
acs: ["AC-01", "AC-07", "AC-11", "AC-13", "AC-14"]
files_hint: ["src/server/modules/audio/nfr.int.test.ts"]
owner: "agent (sdd:implement)"
estimate: "S"
context_budget: "M"
status: "done"
step: "COMMIT"
---

# T4 — Add the audio gallery's server timing tests

## Place in the sequence

- **Blocked by:** T3 — Expose model filter, model groups and curation through the audio service, routes and shared schemas · **Blocks:** — · **Wave:** 4.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** a gallery of all my recordings, newest first, where I can play each one in place
> **So that** I can find and listen to anything I made, not only the latest ten
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

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

> **As the** Owner
> **I want** to see only one speech model's recordings, or an overview grouped by model
> **So that** I can compare what each model sounds like and costs
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers: add the audio gallery's server timing tests.

## Inlined context

> | A gallery page | any page (first or continued, all or one model) of 24 recordings, from 1 000 recordings across 30 models, each with 10 tags and a comment, ≤ 300 ms p95 server time |
> | Model choice and «By model» | … ≤ 300 ms p95 server time with 1 000 recordings across 30 models |
> | Tag / comment save | ≤ 100 ms p95 server time |
> | Delete | recording + file + tags + comment ≤ 300 ms p95 server time |
> | Catalog independence | the targets above hold with the speech catalog unreachable or hanging |
>
> — `spec.md §6, NFR rows, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Calls the T3 operations; no new surface.

## Acceptance criteria

### AC-01 — happy path

> **Given** the Owner has made recordings
> **When** the Owner opens Audio → Gallery
> **Then** the navigation marks «Gallery» in the Audio group, and the page shows a grid of recording cards, newest first. Each card shows:
> - a player that plays the recording in place;
> - its cost with its status, the estimate beside it when the cost isn't known (as on the Speech page);
> - how long the request took;
> - the first two lines of its text;
> - its model's name and its voice;
> - every setting it was made with (defaults included, since a recording keeps all it sent), as short labels (for example «speed 1.1», «stability 0.5», «speaker boost», «instructions» for delivery instructions);
> - its first three tags (with «+N» for more), and a marker when it has a comment;
> - how long ago it was made.
>
> The grid shows the first page. More cards load as the Owner scrolls near the end, and a «Load more» action does the same. After the last page it says that's everything.
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — happy path

> **Given** a recording is shown in its dialog or page
> **When** the Owner adds a tag, removes a tag, or writes and saves a comment
> **Then** the change is kept. The tag shows on the recording and on its card in every view where it appears at once, without a reload, and the card shows a comment marker once a comment is saved. A tag is trimmed, inner spaces are collapsed and it is lower-cased; adding one it already has changes nothing. The comment is edited with an explicit Save or Cancel, and the last save wins; saving an empty or whitespace-only comment removes it. The comment is kept exactly as written; tags are listed in the order they were added. Lengths count the characters the Owner sees, and any alphabet's letters are allowed. Tags and comments are always shown as plain text, never as markup — exactly the rules of image generations' notes (curate-gallery).
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy path

> **Given** a recording is shown in its dialog or on its page (as for image generations, a card has no Delete)
> **When** the Owner chooses Delete and confirms
> **Then** the recording, its audio file, its tags and its comment are gone together, with no undo. In the dialog, the neighbour is chosen from the order as it was before the deletion: the next older recording shows, loading the next page when the deleted one was the last loaded, or the newer one when there is no older, with «Recording deleted.» When there is none, or that next page can't be read, the dialog closes onto the grid with the notice. On the page, the Owner lands on the gallery with the notice. The card leaves the grid, any model view and the overview counts, and the Speech page's recent recordings and latest result drop it too, with no reload. Ukiyo stops waiting for its cost.
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — happy path

> **Given** recordings were made with several speech models
> **When** the Owner chooses one model from the gallery's model choice, which lists every model that has recordings with its count, ordered by each model's newest stored recording
> **Then** the grid shows only that model's recordings, newest first, with the same paging. A heading names the model with its count and offers «Show all recordings». Stepping in a dialog opened from this grid stays within the model. The view is kept in the address, so Back, a reload or a shared address shows the same view. Each view keeps its own scroll position; «Show all» starts at the top. Choosing Gallery in the navigation opens «All». If the model choice or «By model» can't be read, it says so with Try again.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — happy path

> **Given** recordings were made with several speech models
> **When** the Owner chooses «By model»
> **Then** the page shows one section per model, ordered by each model's newest stored recording. Each section has the model's name, its count, its four latest cards, and «Show all N», which opens that model's grid. A card opened from a section or from a model's grid steps through all of that model's recordings, newest first (loading more at the end, not only the four shown); the view behind the dialog does not change. Closing returns to the view it was opened from: a model's grid brings the last shown card into view, «By model» returns to the section unchanged. Deleting moves to the neighbour in that model's order; when it was the model's last recording, the dialog closes onto the view, where the model's grid shows «No recordings with <model>» and the «By model» section is gone. A model no longer offered still has its section under the name it was recorded with. Recordings are grouped and matched by their exact model id. A model has one display name, the same in the model choice, the headings, the cards and the dialog: the name stored with its newest recording that has one, else the name the speech catalog gives it, else its model id. The gallery stays usable when the speech catalog can't be reached.
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Seed 1 000 recordings / 30 models / 10 tags + comment each (`seedRecording`)
- [ ] p95 over 50 runs for: first page, continued page, one-model page, groups latest=4, tag add, comment save, delete
- [ ] Repeat page + groups with a hanging catalog fetch

## Edge cases

| Case | Behaviour |
|---|---|
| hanging catalog | same thresholds |

## Definition of Done

- [ ] nfr tests pass in the serial project
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
