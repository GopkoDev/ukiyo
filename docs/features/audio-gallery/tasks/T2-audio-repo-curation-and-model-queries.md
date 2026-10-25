---
id: T2
title: "Add model filter, model groups, stored names and tag/comment statements to the recordings repo"
layer: "infra"
deps: ["T1"]
blocks: ["T3"]
acs: ["AC-01", "AC-07", "AC-13", "AC-14", "AC-21"]
files_hint: ["src/server/modules/audio/repo.ts", "src/server/modules/audio/repo.int.test.ts", "tests/helpers/recordings.ts"]
owner: "agent (sdd:implement)"
estimate: "M"
context_budget: "M"
status: "done"
step: "COMMIT"
---

# T2 — Add model filter, model groups, stored names and tag/comment statements to the recordings repo

## Place in the sequence

- **Blocked by:** T1 — Promote the audio curation migrations and test them on prototype-shaped data · **Blocks:** T3 — Expose model filter, model groups and curation through the audio service, routes and shared schemas · **Wave:** 2.
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
> **I want** to see only one speech model's recordings, or an overview grouped by model
> **So that** I can compare what each model sounds like and costs
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers: add model filter, model groups, stored names and tag/comment statements to the recordings repo.

## Inlined context

> `list({cursor, limit, model?})`, `modelGroups({latest})`, tags/comment statements, `storedNames(models)`
>
> — `sad.md §5, audio/repo.ts, verbatim`

> Recordings are grouped and matched by their exact model id. A model has one display name, the same in the model choice, the headings, the cards and the dialog: the name stored with its newest recording that has one, else the name the speech catalog gives it, else its model id.
>
> — `spec.md §5, AC-14, abridged`

> The ≤ 10 tags rule is enforced in the repo's add-tag transaction (as for images, ADR-0015), not by the schema.
>
> — `data-model.md §Entities, audio_generation_tags, verbatim`

> Precedent to mirror: `src/server/modules/generations/repo.ts` — `tagsOf(ids)` / `commented(ids)` batched `IN (…)` reads, `addTagTx` (exists → duplicate → limit → insert at `max(position)+1`), `setComment` upsert/delete, `selectModelGroups` + `selectModelPage`.
>
> — `repo, generations/repo.ts:316-380,488-500, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

Reads/writes `audio_generation_tags`, `audio_generation_comments` (T1); reads `audio_generations.model`, `model_name`, `id` through `audio_generations_by_model`.

— `data-model.md §Indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface (the service and routes come in T3).

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

### AC-21 — domain invariant

> **Given** the Owner browses any view of the audio gallery while recordings are added and deleted
> **When** pages load, or a recording is made or deleted
> **Then** each recording appears once in a view — never twice and never skipped at a page boundary. A model's count equals its recordings, and «Show all N» opens exactly N. A new recording moves its model's section to the top of «By model». Deleting a model's last recording removes the model from the model choice and from «By model»; in that model's own view the page then shows «No recordings with <model>» (AC-15).
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Repo `Row` output gains `tags: string[]` and `comment: {body, updatedAt} | null` (batched per page: one tags query, one comments query)
- [ ] `list` takes optional `model` (exact id) using the `(model, id)` index
- [ ] `modelGroups({latest})`: per model id `provider`, `count`, `latestId = max(id)`, ordered by `latestId DESC`, plus `latest` newest rows each
- [ ] `storedNames(models)`: newest non-NULL `model_name` per model id
- [ ] `setComment(id, body|null, updatedAt)`, `addTag(id, tag)` (transaction: missing / duplicate / limit / added), `removeTag(id, tag)`; each returns `missing` for an unknown id
- [ ] `seedRecording` gains `tags`, `comment`, `modelName: null` options
- [ ] Integration tests in `repo.int.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| model with no recordings | empty page, no group |
| page boundary while rows are deleted | cursor by id: no duplicates, no skips |
| eleventh tag | `limit`, nothing inserted |
| duplicate tag | `duplicate`, tags unchanged |
| prototype rows only (NULL names) | `storedNames` has no entry for that model |

## Definition of Done

- [ ] repo integration tests for every new method pass
- [ ] no change to image repos
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
