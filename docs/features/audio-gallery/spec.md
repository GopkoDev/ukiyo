---
status: Draft
owner: "dmytro.hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-25"
feature_size: "M"
---

# Spec — audio-gallery

> **Glossary:** [CONTEXT](../../../CONTEXT.md)
> **Reference module / docs / channels used:** [`docs/roadmap.md`](../../roadmap.md) step 19 (owner request, audio epic); the shipped image gallery specs [`gallery-grid`](../gallery-grid/spec.md), [`generation-detail-modal`](../generation-detail-modal/spec.md), [`curate-gallery`](../curate-gallery/spec.md), [`gallery-by-model`](../gallery-by-model/spec.md) and their code in `src/web/features/gallery/`; step 18 [`text-to-speech`](../text-to-speech/spec.md) (recordings, cost status, recent recordings, reuse) and its handoff notes; `src/server/modules/audio/`.

## 1. Context

The Owner makes recordings on the Speech page, but only the ten latest are ever visible there. Older recordings are kept on the machine and cost money, yet the Owner cannot find, play, label or delete them. Images do not have this problem: their gallery pages through everything, opens a generation in a dialog, and lets the Owner tag it, comment on it, delete it, re-run it and narrow the grid to one model.

The trigger is the owner's audio epic (roadmap steps 18–21). Step 18 shipped recordings with an honest cost and the ten-latest list. This step gives recordings the same browsing and curation the images have. Step 21 (voice presets) will list the recordings made with a preset using these gallery cards, so the card has to be reusable.

Committed approach: a new «Gallery» section in the Audio group that mirrors the image gallery's look and behaviour. It is a newest-first grid of recording cards that loads more as the Owner scrolls. Each card has a player, its cost, its text, model, voice and settings, and its tags. A recording opens in a dialog over the grid, with ← → stepping and its own shareable address. Tags, one comment per recording, delete, «Reuse» on the Speech page, a filter to one speech model and a «By model» overview are all included. Building blocks are taken from the image gallery. Where a piece is truly common (the notes card, the delete confirmation, the dialog's stepping, the paging), it is shared rather than copied, and every image feature keeps working as it does today.

- Failure modes weighed before the AC (devil's-advocate pass, summarized here): several players playing at once; a recording deleted in one place still showing in another; a reuse that silently replaces unsent text or picks a retired model; stepping away from an unsaved comment; a pending cost that never settles on a card; the image gallery changing by accident when pieces are shared; a stale address that opens a recording that is gone. Each one has an AC or an NFR row.
- Decision (owner, 2026-10-25): recordings' tags and comments are stored apart from the image ones. The two tag vocabularies stay separate. They follow the same rules: a tag is 1–32 characters, normalized, at most 10 per item, and a comment is up to 2 000 characters.
- Decision (owner, 2026-10-25): «group by model» is included because it is cheap with the image gallery's pieces. «By prompt» (identical text) is not part of this step.

## 2. Goals

- The Owner can find, play and download every recording they ever made, not only the ten latest.
- The Owner can label recordings (tags, a comment), remove ones they don't want, and generate again from any of them.
- The image and audio galleries behave alike: same grid, dialog, stepping, curation and model views, and a change to one is never a surprise in the other.

## 3. Non-goals

- Grouping recordings by identical text («By prompt»). The owner asked for model views only, and recordings are rarely re-made with the same text.
- Free-text search, or filtering by tag, voice or date. Free-text search is out for images too (roadmap), and the owner did not ask for the others.
- Tag suggestions or autocomplete while typing. The image gallery has none, and the owner's request mirrors it.
- Voice presets and the «Voices» section (step 21), and speech models on the Models page (step 20). Both are later roadmap steps.
- Folders, and one gallery that mixes images and recordings. Folders are step 15, and images and audio stay separate sections by owner decision (step 18).
- Bulk actions (select many to tag or delete). The image gallery has none.

## 4. User stories

### US-01: Browse every recording

**As the** Owner
**I want** a gallery of all my recordings, newest first, where I can play each one in place
**So that** I can find and listen to anything I made, not only the latest ten

### US-02: Open one recording

**As the** Owner
**I want** to open a recording in a dialog with everything about it and step to its neighbours
**So that** I can review recordings one after another, and share an address that opens one directly

### US-03: Label recordings

**As the** Owner
**I want** to add tags and a comment to a recording
**So that** I can remember why I made it and group it with others

### US-04: Remove a recording

**As the** Owner
**I want** to delete a recording from the gallery or its dialog
**So that** recordings I don't want are gone from the machine

### US-05: Narrow to one speech model

**As the** Owner
**I want** to see only one speech model's recordings, or an overview grouped by model
**So that** I can compare what each model sounds like and costs

### US-06: Generate again from a recording

**As the** Owner
**I want** to reuse a recording's text, model, voice and settings on the Speech page
**So that** I can make a variation without retyping anything

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** the Owner has made recordings
**When** the Owner opens Audio → Gallery
**Then** the navigation marks «Gallery» in the Audio group, and the page shows a grid of recording cards, newest first. Each card shows:
- a player that plays the recording in place;
- its cost with its status, the estimate beside it when the cost isn't known (as on the Speech page);
- how long the request took;
- the first two lines of its text;
- its model's name and its voice;
- every setting it was made with (defaults included, since a recording keeps all it sent), as short labels (for example «speed 1.1», «stability 0.5», «speaker boost», «instructions» for delivery instructions);
- its first three tags (with «+N» for more), and a marker when it has a comment;
- how long ago it was made.

The grid shows the first page. More cards load as the Owner scrolls near the end, and a «Load more» action does the same. After the last page it says that's everything.

### AC-02 (US-01) — domain invariant

**Given** one card's player is playing
**When** the Owner starts another card's player (in the grid, the dialog or the Speech page)
**Then** the first one pauses where it was (playing it again resumes there), so at most one recording plays at a time in the Ukiyo tab. Opening a recording's dialog pauses a playing card; closing the dialog stops the dialog's player. Moving to another section pauses what was playing on the section left behind. A recording that finishes generating while the Owner is outside the Speech page does not start playing by itself. A player loads its audio only when the Owner starts it, not when the card appears, and a card's cost refreshing never restarts or interrupts its player.

### AC-03 (US-01) — error

**Given** the gallery can't be read, a further page can't be read, or a recording's audio file can't be played
**When** the Owner opens or scrolls the gallery
**Then** the page says what failed in plain words, with a retry: «Couldn't load the gallery» with Retry when nothing is shown; «Couldn't load more» with Try again under the cards already shown, with no automatic retry. A card whose audio won't play (found when the Owner tries to play it) says «Audio unavailable» in place of the player, and its other details stay visible. With no recordings at all, the page says «No recordings yet» and offers a way to the Speech page.

### AC-04 (US-01) — domain invariant

**Given** a card's cost is pending
**When** the provider reports the charge, or Ukiyo gives up waiting
**Then** within 10 seconds that recording's card in every view on screen, its open dialog or page, changes to the known amount, or to «cost unavailable» with its estimate, without a reload and without re-reading every loaded page. An unknown cost never shows as $0. Recordings kept from the prototype show their amount as the cost.

### AC-05 (US-02) — happy path

**Given** the Owner is on the audio gallery grid
**When** the Owner opens a card
**Then** a dialog shows the recording over the grid:
- a player and a download action;
- its full text;
- the model's name and the voice;
- every setting it was made with, including any delivery instructions in full;
- when it was made and how long the request took;
- the billed characters and the file type;
- the cost with its status and the estimate.

Newer and Older step through the grid's order as loaded, also with ← and →. Stepping past the last loaded card loads the next page, then moves on; if that page can't be read, the dialog stays on the current recording and says «Couldn't load the next one» with Try again. The address shows this recording. Close, Esc or Back returns to the grid where the Owner left it, with the last shown card in view.

### AC-06 (US-02) — cross-context

**Given** the Owner has the address of one recording
**When** the Owner opens it directly (pasted, reloaded or in a new tab)
**Then** the recording shows on its own page under the audio gallery, with a way back to the gallery's «All» view (the address names the recording, not the view it was opened from), the same details and actions as the dialog, and no stepping. If it can't be read, the page or dialog says «Couldn't load this recording» with Try again. If the recording no longer exists, the page or the dialog says «This recording no longer exists» instead of an error, and tagging, commenting or deleting it changes nothing. After a deletion in the dialog, Back never returns to the deleted recording. A recording's address never opens an image generation, and a generation's address never opens a recording. The image gallery's own addresses and detail pages keep working as before.

### AC-07 (US-03) — happy path

**Given** a recording is shown in its dialog or page
**When** the Owner adds a tag, removes a tag, or writes and saves a comment
**Then** the change is kept. The tag shows on the recording and on its card in every view where it appears at once, without a reload, and the card shows a comment marker once a comment is saved. A tag is trimmed, inner spaces are collapsed and it is lower-cased; adding one it already has changes nothing. The comment is edited with an explicit Save or Cancel, and the last save wins; saving an empty or whitespace-only comment removes it. The comment is kept exactly as written; tags are listed in the order they were added. Lengths count the characters the Owner sees, and any alphabet's letters are allowed. Tags and comments are always shown as plain text, never as markup — exactly the rules of image generations' notes (curate-gallery).

### AC-08 (US-03) — error

**Given** the Owner is adding a tag or saving a comment
**When** the tag is empty, longer than 32 characters or uses characters outside letters, digits, spaces, «-» and «_»; the recording already has 10 tags; or the comment is longer than 2 000 characters
**Then** nothing is saved, the typed text stays in the field, and the field says why in plain words, for example «Tags may contain letters, digits, spaces, - and _ (1–32 characters)» or «Comment must be at most 2 000 characters». A recording that was deleted elsewhere meanwhile shows that it no longer exists.

### AC-09 (US-03) — domain invariant

**Given** the dialog has an unsaved comment edit, typed tag text that isn't added, or an open delete confirmation
**When** the Owner tries to step to a neighbour
**Then** stepping is unavailable, with the reason «Save or cancel your changes first». Esc first cancels an open comment edit, and closes the dialog only on the next press. Esc likewise closes an open delete confirmation before the dialog. Close, Back and Reuse are not blocked: as in the image dialog, they leave the recording and drop an unsaved comment edit or typed tag text. Nothing typed for one recording can ever apply to another. Inside a text field, ← and → move the cursor and never step. While the dialog's player has the keyboard focus, ← and → belong to the player and never step. Stepping to a neighbour stops the current playback.

### AC-10 (US-03) — cross-context

**Given** the Owner tags a recording
**When** the Owner later looks at image generations
**Then** the recording's tags never appear on any image generation, and image tags never appear on recordings. The same word may be used in both, and each keeps its own.

### AC-11 (US-04) — happy path

**Given** a recording is shown in its dialog or on its page (as for image generations, a card has no Delete)
**When** the Owner chooses Delete and confirms
**Then** the recording, its audio file, its tags and its comment are gone together, with no undo. In the dialog, the neighbour is chosen from the order as it was before the deletion: the next older recording shows, loading the next page when the deleted one was the last loaded, or the newer one when there is no older, with «Recording deleted.» When there is none, or that next page can't be read, the dialog closes onto the grid with the notice. On the page, the Owner lands on the gallery with the notice. The card leaves the grid, any model view and the overview counts, and the Speech page's recent recordings and latest result drop it too, with no reload. Ukiyo stops waiting for its cost.

### AC-12 (US-04) — error

**Given** the Owner has confirmed a deletion
**When** the deletion fails
**Then** the recording stays complete: its file still plays, and its tags and comment are unchanged. The page says «Couldn't delete this recording». If it was already deleted elsewhere, the Owner sees that it no longer exists.

### AC-13 (US-05) — happy path

**Given** recordings were made with several speech models
**When** the Owner chooses one model from the gallery's model choice, which lists every model that has recordings with its count, ordered by each model's newest stored recording
**Then** the grid shows only that model's recordings, newest first, with the same paging. A heading names the model with its count and offers «Show all recordings». Stepping in a dialog opened from this grid stays within the model. The view is kept in the address, so Back, a reload or a shared address shows the same view. Each view keeps its own scroll position; «Show all» starts at the top. Choosing Gallery in the navigation opens «All». If the model choice or «By model» can't be read, it says so with Try again.

### AC-14 (US-05) — happy path

**Given** recordings were made with several speech models
**When** the Owner chooses «By model»
**Then** the page shows one section per model, ordered by each model's newest stored recording. Each section has the model's name, its count, its four latest cards, and «Show all N», which opens that model's grid. A card opened from a section or from a model's grid steps through all of that model's recordings, newest first (loading more at the end, not only the four shown); the view behind the dialog does not change. Closing returns to the view it was opened from: a model's grid brings the last shown card into view, «By model» returns to the section unchanged. Deleting moves to the neighbour in that model's order; when it was the model's last recording, the dialog closes onto the view, where the model's grid shows «No recordings with <model>» and the «By model» section is gone. A model no longer offered still has its section under the name it was recorded with. Recordings are grouped and matched by their exact model id. A model has one display name, the same in the model choice, the headings, the cards and the dialog: the name stored with its newest recording that has one, else the name the speech catalog gives it, else its model id. The gallery stays usable when the speech catalog can't be reached.

### AC-15 (US-05) — error

**Given** an address names a speech model without any recordings, for example after its last recording was deleted
**When** the Owner opens it
**Then** the page says «No recordings with <model>» and offers «Show all recordings». It never shows an empty grid without explanation.

### AC-16 (US-06) — happy path

**Given** a recording is shown as a card, in its dialog or on its page
**When** the Owner chooses Reuse
**Then** the Owner lands on the Speech page with its text, model, voice and settings in the form, and this recording as the latest result. Back from there returns to the gallery, not to a closed dialog. Reuse never generates anything by itself.

### AC-17 (US-06) — cross-context

**Given** the Speech form holds unsent text that differs from the recording's, or the recording's model is no longer offered
**When** the Owner chooses Reuse
**Then** with unsent text, the Speech page asks before replacing it, and «Keep mine» leaves the form and the latest result as they were. With a retired model, the page says the model is no longer offered and keeps the current model. It still fills in the text, the voice and the settings that model accepts, as Reuse from the recent recordings does. «No longer offered» is said only when the Speech page's model list has loaded and lacks the model. Reuse is applied once that list is known; if it can't be loaded, the page says so with a retry, and the form is not changed. While a recording is being generated, Reuse is not applied: the page says to wait for the current request, and the form and the request stay as they are.

### AC-18 (US-01, US-04) — cross-context

**Given** the Owner generates a recording on the Speech page, deletes one there or in the gallery, or curates one in the gallery
**When** the Owner moves between the Speech page and the audio gallery
**Then** both show the same recordings: a new recording is first in the gallery — also when it finishes while the gallery is on screen, where it appears first in every open view at once — and a deleted one is in neither — a deletion on the Speech page also removes its tags and comment, and drops its card from the grid, the model views and their counts. The image gallery, its model views and the recent generations next to the Generate form never show recordings, and the audio gallery never shows image generations.

### AC-19 (US-01, US-03, US-04) — authorization

**Given** Ukiyo is running
**When** a page from another site in the Owner's browser asks Ukiyo to list recordings, change a recording's tags or comment, or delete one
**Then** Ukiyo refuses, as it does every other request from another site, and nothing changes.

### AC-20 (US-01) — domain invariant

**Given** the image gallery is open, or an image generation is open in its dialog
**When** the Owner uses it after this step
**Then** every image gallery behaviour works as before: grid, paging, dialog stepping, notes, tags, delete, re-run, use as input, and the model and prompt views. Pieces now shared with the audio gallery change nothing the Owner sees there.

### AC-21 (US-05) — domain invariant

**Given** the Owner browses any view of the audio gallery while recordings are added and deleted
**When** pages load, or a recording is made or deleted
**Then** each recording appears once in a view — never twice and never skipped at a page boundary. A model's count equals its recordings, and «Show all N» opens exactly N. A new recording moves its model's section to the top of «By model». Deleting a model's last recording removes the model from the model choice and from «By model»; in that model's own view the page then shows «No recordings with <model>» (AC-15).

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| A gallery page | any page (first or continued, all or one model) of 24 recordings, from 1 000 recordings across 30 models, each with 10 tags and a comment, ≤ 300 ms p95 server time | `nfr` integration test over a seeded data dir |
| Model choice and «By model» | the model list with counts, and the groups with their four latest cards, ≤ 300 ms p95 server time with 1 000 recordings across 30 models | `nfr` integration test |
| Tag / comment save | ≤ 100 ms p95 server time | `nfr` integration test |
| Delete | recording + file + tags + comment ≤ 300 ms p95 server time; after a failed or interrupted deletion the recording is either fully present or fully gone | integration test with a failing file step |
| Requests while browsing | ≤ 1 request per page; none while one is in flight or after the last; a dialog step costs ≤ 1 recording read and 0 for one already read; a tag or comment change costs 0 list-page reads | component test counting requests |
| Pending cost on cards | a settled cost shows on every visible card, dialog and page within 10 s; refreshed by asking only for the pending recordings, not every loaded page, at most once every 10 s | component test counting requests |
| Audio loading | 0 audio bytes fetched for cards the Owner hasn't played | component test (player preload) |
| Image gallery unchanged | every existing image gallery, dialog, curation, model and prompt view test passes with no change to what it expects | the existing `web` and `integration` suites, run before and after the extraction |
| Catalog independence | the targets above hold with the speech catalog unreachable or hanging | `nfr` test with a hanging fake catalog |
| Migration safety | the new storage applies on top of the Owner's current recordings database without changing or losing any recording | migration test on a prototype-shaped copy + ship check on a copy of the Owner's data |

## 6.1 Security / privacy

- **Data classification:** confidential — the Owner's own recordings, texts, tags and comments (as curate-gallery classifies notes).
- **Personal data touched:** comments and tags are free text the Owner writes; they stay on the machine and are never sent to a provider.
- **AuthZ/AuthN impact:** no new boundary; every new action stays behind the existing guard against requests from other sites (AC-19).
- **Abuse cases:**
  - A foreign page lists, tags or deletes recordings: refused (AC-19).
  - A crafted tag or comment injects markup into the page: shown as plain text only, never as markup.
  - A crafted recording address reads a file outside the data dir: audio is served only for a recorded recording, from inside the data dir (unchanged from step 18).
- **Security review:** N/A — same local-only model, no new secrets or boundaries.

## 7. Metrics / KPIs

- **Recordings reachable from the UI** — baseline: the 10 latest; target: 100 % of stored recordings at ship (checked on a copy of the Owner's data).
- **Image gallery regressions** — baseline: 0 failing image gallery tests; target: 0 after the shared pieces are extracted.
- **Recordings with a file but no record, or a record but no file, after deletions** — baseline: 0; target: 0.

## 8. Open questions

None open. Settled while specifying (owner request 2026-10-25, or taken as the image gallery's default):

- [x] Reuse from a card as well as from the dialog/page? **Yes** — the owner's request names «a card/detail».
- [x] Delete from a card? **No** — as in the image gallery, Delete lives in the dialog and the page (assumed default).
- [x] Deferred test coverage from review 2026-10-25 (code judged correct, cases not yet asserted at component level): AC-02 opening the dialog pauses a playing card and a cost refresh never remounts a card's player; AC-04 a settled cost shown in the open dialog / model grid / «By model»; AC-13 the view surviving Back and reload, per-view scroll, Gallery in the navigation opening «All»; AC-18 a recording finishing while the gallery is on screen, and a Speech-page deletion dropping gallery cards and counts; AC-21 deletions between pages in the UI. Default now: covered by the code paths' shared tests (`patchRecordings`, `MediaDialog`, playback unit tests) and the manual e2e walk at ship. — owner: agent (next audio step, `models-page-audio`), due: before PR #8 is merged. **Done 2026-10-25:** every case above is asserted in `src/web/features/audio/gallery/GalleryLiveViews.test.tsx` (App-level component tests; no production change was needed).
