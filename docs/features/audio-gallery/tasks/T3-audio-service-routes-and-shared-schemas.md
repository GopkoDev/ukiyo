---
id: T3
title: "Expose model filter, model groups and curation through the audio service, routes and shared schemas"
layer: "ports"
deps: ["T2"]
blocks: ["T4", "T10"]
acs: ["AC-04", "AC-06", "AC-07", "AC-08", "AC-10", "AC-13", "AC-14", "AC-15", "AC-18", "AC-19"]
files_hint: ["src/shared/speech.ts", "src/server/modules/audio/service.ts", "src/server/modules/audio/routes.ts", "src/server/modules/audio/domain.ts", "src/server/modules/providers/speech-catalog.ts", "src/server/app.ts", "src/server/modules/audio/routes.int.test.ts", "src/web/features/audio/"]
owner: "agent (sdd:implement)"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T3 — Expose model filter, model groups and curation through the audio service, routes and shared schemas

## Place in the sequence

- **Blocked by:** T2 — Add model filter, model groups, stored names and tag/comment statements to the recordings repo · **Blocks:** T4 — Add the audio gallery's server timing tests, T10 — Add the audio gallery's API client, view parsing, query keys and cache patching · **Wave:** 3.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** a gallery of all my recordings, newest first, where I can play each one in place
> **So that** I can find and listen to anything I made, not only the latest ten
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

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
> **I want** to see only one speech model's recordings, or an overview grouped by model
> **So that** I can compare what each model sounds like and costs
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers: expose model filter, model groups and curation through the audio service, routes and shared schemas.

## Inlined context

> Extend the one `Recording` DTO with `tags` and `comment` (additive), add `model` to the list query, add a model-groups read (`/audio/recordings/models?latest=N`, before `/:id`), and curation routes mirroring images (comment put, tag add, tag remove).
>
> — `adr/0051, Considered options 1 (chosen), verbatim`

> Read-time resolution, no data change: stored names first (one query per page: newest non-NULL name per model), then `catalog.peek()` — the last successful catalog read, kept past its TTL and never fetching — then the id. The service warms the catalog in the background at boot.
>
> — `adr/0052, Considered options 1 (chosen), verbatim`

> Server: `NOT_FOUND` for unknown recordings on every curation route; `VALIDATION_ERROR` with `details.fields.tag|body` from the shared rules; deletion keeps step 18's atomic file move. Every new route sits behind the existing request guard (ADR-0007).
>
> — `sad.md §8, Errors / Security, abridged`

> **Contract-task rule:** `Recording` in `src/shared/speech.ts` gains required `tags` + `comment`; every web test fixture building a `Recording` (`src/web/features/audio/*.test.tsx`) is updated in this task so the gate stays green.
>
> — `tasks skill, compile-coupled, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

Reads/writes the T2 repo methods only. No DB changes.

## API contract

- `GET /audio/recordings?cursor&limit&model` → `RecordingPage` (items carry `tags`, `comment`) · 400 VALIDATION_ERROR (`fields.model`), 403.
- `GET /audio/recordings/models?latest=0..24` → `RecordingModelGroupsResponse {models:[{provider, model, modelName, count, latestId, items}]}` · 400, 403.
- `GET /audio/recordings/{id}` → `Recording` (+ tags, comment) · 404 NOT_FOUND.
- `PUT /audio/recordings/{id}/comment {body}` → `{comment}` · 400 (`fields.body`), 404.
- `POST /audio/recordings/{id}/tags {tag}` → `{tags}` · 400 (`fields.tag`, rule or 10-limit), 404.
- `DELETE /audio/recordings/{id}/tags/{tag}` → `{tags}` · 404.
- `modelName` everywhere = newest stored name for the model id, else last catalog read, else id.

— `contracts/openapi.yaml, operationIds listRecordings, listRecordingModels, getRecording, setRecordingComment, addRecordingTag, removeRecordingTag, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-04 — domain invariant

> **Given** a card's cost is pending
> **When** the provider reports the charge, or Ukiyo gives up waiting
> **Then** within 10 seconds that recording's card in every view on screen, its open dialog or page, changes to the known amount, or to «cost unavailable» with its estimate, without a reload and without re-reading every loaded page. An unknown cost never shows as $0. Recordings kept from the prototype show their amount as the cost.
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

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

### AC-10 — cross-context

> **Given** the Owner tags a recording
> **When** the Owner later looks at image generations
> **Then** the recording's tags never appear on any image generation, and image tags never appear on recordings. The same word may be used in both, and each keeps its own.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

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

### AC-15 — error

> **Given** an address names a speech model without any recordings, for example after its last recording was deleted
> **When** the Owner opens it
> **Then** the page says «No recordings with <model>» and offers «Show all recordings». It never shows an empty grid without explanation.
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — cross-context

> **Given** the Owner generates a recording on the Speech page, deletes one there or in the gallery, or curates one in the gallery
> **When** the Owner moves between the Speech page and the audio gallery
> **Then** both show the same recordings: a new recording is first in the gallery — also when it finishes while the gallery is on screen, where it appears first in every open view at once — and a deleted one is in neither — a deletion on the Speech page also removes its tags and comment, and drops its card from the grid, the model views and their counts. The image gallery, its model views and the recent generations next to the Generate form never show recordings, and the audio gallery never shows image generations.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — authorization

> **Given** Ukiyo is running
> **When** a page from another site in the Owner's browser asks Ukiyo to list recordings, change a recording's tags or comment, or delete one
> **Then** Ukiyo refuses, as it does every other request from another site, and nothing changes.
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `src/shared/speech.ts`: `Recording` += `tags: Tag[]`, `comment: Comment|null` (reuse `src/shared/curation.ts`); add `RecordingModelGroup(s)Response`
- [ ] `speech-catalog.ts`: `peek(provider)` returns the last successful entry even past TTL, never fetches
- [ ] `service.ts`: `list({cursor,limit,model})`, `get`, `models(latest)`, `setComment`, `addTag`, `removeTag` using `normalizeTag`/`checkComment`; names via `storedNames` → `peek` → id (no `namesById` await on read paths); `warmCatalog()` fire-and-forget
- [ ] `routes.ts`: query schema adds `model` (1–100); `/audio/recordings/models` before `/:id`; the three curation routes
- [ ] `app.ts`: call the background warm after wiring (errors swallowed)
- [ ] Update web fixtures for the new `Recording` fields
- [ ] Integration tests: filter, groups order/counts/names (stored, peek, id, hanging catalog), curation happy + refusals + not found, foreign origin refused for each route, recordings never in image lists

## Edge cases

| Case | Behaviour |
|---|---|
| hanging catalog | reads answer without waiting; names fall back to stored → id |
| unknown recording on curation | 404 NOT_FOUND, nothing changes |
| foreign origin | 403, nothing changes |
| model param longer than 100 | 400 VALIDATION_ERROR |
| tag param URL-encoded with spaces | decoded and removed |

## Definition of Done

- [ ] route integration tests for every operation pass, answers parse with the shared schemas
- [ ] Speech page tests still pass
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
