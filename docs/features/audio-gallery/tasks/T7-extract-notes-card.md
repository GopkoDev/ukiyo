---
id: T7
title: "Extract the notes card from the image Notes"
layer: "ui"
deps: ["T5"]
blocks: ["T13"]
acs: ["AC-07", "AC-08", "AC-20"]
files_hint: ["src/web/features/media-gallery/NotesCard.tsx", "src/web/features/gallery/Notes.tsx"]
owner: "agent (sdd:implement)"
estimate: "S"
context_budget: "S"
status: "todo"
step: ""
---

# T7 — Extract the notes card from the image Notes

## Place in the sequence

- **Blocked by:** T5 — Extract the media-neutral gallery primitives into a shared media-gallery layer · **Blocks:** T13 — Build the recording dialog and page with notes, details and delete · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to add tags and a comment to a recording
> **So that** I can remember why I made it and group it with others
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: extract the notes card from the image Notes.

## Inlined context

> `NotesCard` (parameterised by curation calls and patch/gone callbacks)
>
> — `adr/0049, Option 1, verbatim`

> NotesCard — extracted from the image `Notes` so both media share it (ADR-0049); `Notes` becomes a wrapper
>
> — `screens.md, New components, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Calls nothing itself; receives `setComment(body)`, `addTag(raw)`, `removeTag(tag)` returning `{comment}` / `{tags}`.

## Acceptance criteria

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

### AC-20 — domain invariant

> **Given** the image gallery is open, or an image generation is open in its dialog
> **When** the Owner uses it after this step
> **Then** every image gallery behaviour works as before: grid, paging, dialog stepping, notes, tags, delete, re-run, use as input, and the model and prompt views. Pieces now shared with the audio gallery change nothing the Owner sees there.
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `NotesCard({item:{id,tags,comment}, setComment, addTag, removeTag, onPatched(fields), onGone(err)→bool})` holds today's state machine, busy/escape reporting and copy
- [ ] `Notes` = `NotesCard` with the image api + `patchCard`
- [ ] Unique input ids per instance (`useId`) only if the image tests don't query by id — else keep `comment`/`add-tag`

## Edge cases

| Case | Behaviour |
|---|---|
| save on a deleted item | onGone → detail refetch |

## Definition of Done

- [ ] `Notes.test.tsx` and dialog tests pass without edits
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
