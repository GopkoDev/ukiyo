# Changelog — audio-gallery

## audio-gallery — every recording in a gallery of its own, with tags, comments, model views and Reuse

**What:**

- **Audio → Gallery** (`/audio/gallery`, accessible name «Audio gallery»): a newest-first grid of recording cards, 24 per page, loading more as you scroll (or «Load more»). Each card has:
  - a player that loads nothing until you press play — starting one pauses any other in the tab, and changing section pauses it;
  - the cost with its status, plus «≈ estimate» while the cost isn't known;
  - the duration, two lines of text, the voice, the model's name and one badge per recorded setting;
  - its first three tags with «+N», a comment marker, and **Reuse**.
- **A recording opens in a dialog over the grid.** It has its own address, `/audio/recordings/<id>`; a direct visit shows a full page.
  - It shows the player and download, the full text, every setting (delivery instructions in full), the times, the billed characters, the file type, the cost and status, and the estimate.
  - **Newer / Older** and ← → step through the loaded order, loading the next page at the end. Unsaved notes or an open delete confirmation block stepping. Arrows inside a text field or on the player never step.
- **Tags and one comment per recording.** They follow the same rules as images (tag 1–32 characters, normalized, at most 10; comment up to 2 000 characters) and are stored apart from image tags (ADR-0047).
- **Delete** from the dialog or the page removes the recording, its file, tags and comment together. The dialog then moves to the neighbour. The card leaves every view, and the Speech page's recent list and latest result drop it too.
- **One model, or «By model».**
  - The model choice lists every model with recordings and its count, newest first. Choosing one gives that model's grid, kept in the address.
  - «By model» shows one section per model with its four latest recordings and «Show all N».
  - A model has one display name everywhere, and a read never waits on OpenRouter's catalog (ADR-0052).
- **Reuse** from a card, the dialog or the page opens the Speech page with the recording's text, model, voice and settings (ADR-0053).
  - If the form holds different unsent text, it asks first.
  - For a retired model, it keeps the current model and says so.
  - It waits for the model list before applying, and never swaps the form while a request is running.
- **Image gallery:** unchanged for the Owner. Its dialog engine, notes card and grid primitives now live in a shared `media-gallery` layer that both galleries use (ADR-0049). Every image gallery test passes with unchanged expectations.

**Why:** The Speech page showed only the ten latest recordings. Older ones were kept and paid for, but the Owner could not find, label or delete them ([spec](./spec.md) §1).

| Decision | ADR |
|---|---|
| Recording tags and comments in their own cascading tables | [ADR-0047](./adr/0047-store-recording-tags-and-comments-in-their-own-cascading-tables.md) |
| A recording detail route; sections own their detail page and dialog | [ADR-0048](./adr/0048-add-a-recording-detail-route-and-let-sections-own-their-detail-renderers.md) |
| A shared media-gallery layer extracted from the image gallery | [ADR-0049](./adr/0049-extract-a-shared-media-gallery-layer-from-the-image-gallery.md) |
| One recording plays at a time, app-wide | [ADR-0050](./adr/0050-coordinate-playback-app-wide-so-one-recording-plays-at-a-time.md) |
| Tags and the comment on the one recording DTO; model views in the audio API | [ADR-0051](./adr/0051-carry-tags-and-the-comment-on-the-one-recording-dto-and-add-model-views-to-the-audio-api.md) |
| Model names without waiting on the catalog | [ADR-0052](./adr/0052-resolve-model-display-names-without-waiting-on-the-speech-catalog.md) |
| Reuse handed to Speech through its address | [ADR-0053](./adr/0053-hand-reuse-to-the-speech-page-through-its-address.md) |

**How to use:**

- In the UI: **Audio → Gallery**. Click a card's text to open it. Use **Choose a model** or **By model** to narrow the grid. **Reuse** takes you to Speech.
- In the API ([openapi.yaml](./contracts/openapi.yaml)):
  - `GET /api/audio/recordings?cursor&limit&model`
  - `GET /api/audio/recordings/models?latest=N`
  - `PUT /api/audio/recordings/{id}/comment`
  - `POST /api/audio/recordings/{id}/tags`
  - `DELETE /api/audio/recordings/{id}/tags/{tag}`
  - `GET` and `DELETE /api/audio/recordings/{id}`
  - Every recording now carries `tags` and `comment`.

**Operational notes:**

- **Migrations:** `0013_create_audio_curation` (two new child tables) and `0014_index_audio_generations_by_model` (an index). Both are additive and apply on boot, and no recording row is changed. `pnpm db:rollback` twice reverts both.
- **The Owner's `./data` already has 0013 + 0014 (flagged).** The Owner's own `pnpm dev` (`tsx watch`, started outside this run) restarted when the migration files appeared and applied them at 2026-10-25 01:11 UTC. On a copy taken afterwards, the 19 recordings were intact: Σ $0.49248, and the 19 prototype rows still have a NULL name.
- **Config:** none new. At boot, Ukiyo reads OpenRouter's (free) speech catalog once in the background, but only when some recording has no stored model name.
- **Rollback:** `pnpm db:rollback` ×2, then revert the branch.

**Acceptance criteria delivered:** AC-01 … AC-21 (spec §5).

- **Independent review:** PASS after fixes ([review](./_review/review-2026-10-25.md)).
  - Stage 2: 1 major and 9 minor findings, all fixed. The major one was the kept-mounted Speech page reacting to the image gallery's `?reuse=`.
  - Stage 1: 1 major (missing edge tests) and 6 minor findings, fixed or aligned in docs.
  - A few component-level test cases are deferred in spec §8 (owner: agent, due: before PR #8 merges).
- **Verified on the running app on 2026-10-25,** against a fresh copy of the Owner's data, built SPA, port 8791:
  - Lists, cards and names:
    - The 19 recordings were listed with `tags`/`comment`.
    - The groups read gave Eleven v4 (18) and Eleven Multilingual v2 (1), with names from the boot catalog read.
    - One-model paging in pages of 5 gave 17 of 17, unique.
  - Tags, comment and the guard:
    - «  Intro   Take » was stored as «intro take», and a duplicate was ignored.
    - «bad<tag>» was refused with the field reason.
    - The comment was stored and shown on the card's marker.
    - Foreign-origin tag and list requests got 403.
  - Deletion: deleting a tagged recording removed its row, file, tags and comment. Image tags were untouched (9 rows), and the image gallery lists no recordings.
  - `/audio/gallery`, `/audio/recordings/<id>`, `/gallery` and `/audio/speech` all served the SPA.
  - No paid provider call was made.
- **Not driven in a browser this run.** Clicking through the UI by hand (the ux-flows e2e walk) is left to the Owner at merge. It is covered by component tests.
