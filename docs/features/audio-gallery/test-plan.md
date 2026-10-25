---
status: Draft
updated_at: "2026-10-25"
feature_size: "M"
---

# Test plan — audio-gallery

## Test plan

Levels: unit · integration · component · contract · load (+ e2e-through-UI). Integration means the real app over a real SQLite file in a throwaway temp data dir (`createTestApp`), speech catalog answered from recorded fixtures (or a hanging fake). Component means a web component, or the whole App frame, rendered in a simulated DOM with a mocked typed API client. There is no browser-driven e2e harness in the repo, so the e2e-through-UI paths of `ux-flows.md` are walked by hand at ship against a copy of the owner's data; that is the only manual level. Contract means the shared zod schemas parse every route's answer (the route `satisfies` the type and the typed client parses it) — checked inside the integration tests.

Order of work matters for AC-20: the image-gallery extraction (ADR-0049) lands first, gated by the unchanged image suites, before any audio UI uses the shared layer.

### AC → tests

| AC | Test | Level |
|---|---|---|
| AC-01 | the gallery lists recordings newest first in pages of 24 with the next cursor; each item carries tags (insertion order) and its comment | integration |
| AC-01 | the grid shows a card per recording with player, cost label, duration, two-line text, model name, voice, one badge per recorded setting, first three tags + «+N», comment marker, relative time; «Load more» and the sentinel load the next page; after the last page «That's everything» | component |
| AC-01 | the Audio group lists Speech then Gallery; Gallery is marked current on the gallery and on a recording address | component |
| AC-02 | starting one player pauses every other one in the document; a route change pauses whatever plays; pausing keeps the position | unit (playback coordinator, simulated media) |
| AC-02 | opening a card's dialog pauses the playing card; the hidden Speech page does not autoplay a fresh result while another section shows | component |
| AC-02 | card players fetch nothing before play (preload none) and a pending-cost refresh does not remount a card's player | component |
| AC-03 | first-read failure → «Couldn't load the gallery» + Retry; next-page failure → «Couldn't load more» + Try again, no automatic retry; no recordings → «No recordings yet» + link to Speech; a player error → «Audio unavailable» with the card's other details kept | component |
| AC-04 | a pending card reads only its own recording every 10 s and, once settled, the card changes in every audio view (grid, model grid, By model) and the open dialog, without any list re-read; unknown cost never «$0» | component |
| AC-04 | a prototype recording's amount shows as its cost | integration |
| AC-05 | a card click opens the dialog over the grid with the full details (text, model, voice, all settings incl. instructions, times, characters, file type, cost + estimate); the address names the recording | component |
| AC-05 | Newer / Older and ← → step through the loaded order; past the last loaded card the next page loads then the step happens; a failed next page keeps the recording with «Couldn't load the next one» + Try again | component |
| AC-05 | Close / Esc / Back return to the grid with the last shown card in view and focus on it | component |
| AC-06 | a direct visit to a recording address shows the full page with «← Gallery» to All; a deleted recording says «This recording no longer exists»; a read failure says «Couldn't load this recording» + Try again | component |
| AC-06 | a recording address never opens a generation and a generation address never opens a recording; image detail and dialog routes behave as before | unit (router parse, sectionFor) + component |
| AC-06 | reading an unknown recording id answers not found; tag, comment or delete on it changes nothing and answers not found | integration |
| AC-07 | adding a tag normalizes it, keeps insertion order, ignores a duplicate; removing works; a comment save stores it exactly; an empty or whitespace-only save removes it; last save wins | integration |
| AC-07 | a tag or comment change shows on the recording and on its card in every view at once, with zero list-page reads | component |
| AC-08 | the server refuses an invalid tag, an eleventh tag and a comment over 2 000 characters with the reason in the field; nothing is stored | integration |
| AC-08 | the notes card shows the reason under the field and keeps the typed text; an action on a recording deleted elsewhere shows it no longer exists | component |
| AC-08 | the shared tag and comment rules (length in code points, any alphabet, collapse, lower-case) | unit (existing `curation.test.ts`, extended for reuse) |
| AC-09 | with an unsaved comment, typed tag text or an open delete confirmation stepping is unavailable with «Save or cancel your changes first»; Esc closes the confirmation / cancels the edit before the dialog; arrows inside a text field and on the focused player never step; stepping stops playback | component |
| AC-10 | recording tags never appear on a generation and image tags never on a recording; the same word in both stays separate | integration |
| AC-11 | deleting removes the row, its tags, its comment and its file in one step; its cost watch stops | integration |
| AC-11 | in the dialog the neighbour comes from the order before the deletion (older, loading the next page if needed, else newer) with «Recording deleted.»; with none, or a failed next page, the dialog closes onto the view with the notice; on the page, the gallery shows the notice; the card leaves every view and the Speech recent list and latest result | component |
| AC-12 | a failing file move rolls the deletion back: row, tags, comment and file all intact | integration |
| AC-12 | a failed deletion shows «Couldn't delete this recording»; already gone shows that it no longer exists | component |
| AC-13 | the list filtered by an exact model id pages only that model newest first; the model groups are ordered by each model's newest recording with exact counts | integration |
| AC-13 | the model choice lists models with counts; choosing one shows its grid with heading, count and «Show all recordings»; the view lives in the address (Back, reload); each view keeps its scroll and «Show all» starts at the top; Gallery in the navigation opens All; a failed models read says so with Try again | component |
| AC-14 | By model shows a section per model with name, count, four latest and «Show all N»; a card opened there steps through all of that model's recordings; closing returns to the section unchanged | component |
| AC-14 | one display name per model id: newest stored name, else the last catalog read, else the id — the same in groups, pages and the detail; a retired model keeps its section | integration |
| AC-15 | an address naming a model without recordings shows «No recordings with <model>» + «Show all recordings»; deleting a model's last recording from its grid's dialog closes onto that state | component |
| AC-16 | Reuse from a card, the dialog and the page lands on Speech with the form filled and the recording as the latest result (no autoplay); from the dialog and the page the history entry is replaced so Back returns to the grid; nothing is generated | component |
| AC-17 | Reuse with differing unsent text asks; «Keep mine» leaves form and result; a retired model keeps the current model with the notice; Reuse waits for the model list and says so when it fails; while generating it says to wait and changes nothing; a deleted recording says it no longer exists | component |
| AC-18 | a recording generated on Speech appears first in the open gallery views; a deletion on Speech removes the card, its tags and comment from the gallery views and their counts | component + integration |
| AC-18 | the image gallery, its model views and the recent generations never list recordings; the audio gallery never lists generations | integration |
| AC-19 | a foreign-origin request to list recordings, read model groups, set a comment, add or remove a tag or delete is refused and nothing changes | integration |
| AC-20 | every existing image gallery, dialog, curation, model and prompt view test passes with unchanged expectations after the extraction | component + integration (existing suites) |
| AC-21 | over a seeded set with deletions between pages, every recording appears once per view, never skipped at a page boundary; counts equal the recordings; «Show all N» opens exactly N; a new recording moves its model's group first; deleting a model's last recording drops its group | integration |
| AC-21 | in the UI, the same invariants hold across a new recording and a deletion while views are open | component |
| §6 Migration safety | a DB at 0012 with prototype-shaped rows: 0013 + 0014 apply, every recording row is unchanged, deletion cascades both children; rolling both back removes the tables and the index and keeps the rows | integration |
| contract | every new route's answer parses with the shared zod schema (`Recording` with tags + comment, `RecordingModelGroupsResponse`, `CommentResponse`, `TagsResponse`) | contract (inside integration) |

### e2e-through-UI (manual at ship)

Walk the ux-flows on a copy of the owner's data: US-01 browse + play two cards; US-02 open, step to the end, direct address; US-03 tag + comment; US-04 delete in the dialog; US-05 model choice + By model; US-06 Reuse into Speech with unsent text.

## Integration strategy

- **Dependency:** a real SQLite file in a fresh temp data dir per test (`tests/helpers/test-app.ts`), migrated like on boot; thrown away in `cleanup()`. No mocked datastore.
- **Provider HTTP:** only the speech catalog is touched (display names); answered from the recorded `tests/fixtures/openrouter/speech-models.json`, or a hanging fake fetch for catalog independence. No speech generation is sent.
- **Seed:** `tests/helpers/recordings.ts` `seedRecording()` (step 18) gains `tags` / `comment` overrides and a `modelName: null` prototype variant.
- **Cleanup boundary:** per test (temp dir removed, timers cancelled via `stopBackground`). Component tests reset the query client, the gallery scroll memory and the playback coordinator between tests.

## Load

The repo's timing tests (the serial `nfr` / `nfr-web` projects) carry the numeric NFRs:

| NFR | Scenario | Threshold |
|---|---|---|
| A gallery page | 1 000 seeded recordings across 30 models, each with 10 tags and a comment; 50 reads each of a first page, a continued page, a one-model page (24 items) | p95 ≤ 300 ms server time |
| Model choice and «By model» | same seed; 50 reads of the groups with the four latest | p95 ≤ 300 ms server time |
| Tag / comment save | same seed; 50 tag adds and 50 comment saves | p95 ≤ 100 ms server time |
| Delete | 50 deletions of seeded recordings with 10 tags, a comment and a file | p95 ≤ 300 ms server time |
| Catalog independence | the page and groups scenarios with a hanging catalog fetch | thresholds above still hold |
| Requests while browsing | component: paging 5 pages, stepping 10 recordings, 3 tag/comment changes; count requests | ≤ 1 per page, none in flight twice or after the last; ≤ 1 read per step, 0 when read; 0 list reads per curation change |
| Pending cost on cards | component with fake timers, 5 pages loaded, 2 pending | only the 2 recordings read, ≤ once per 10 s; settled within 10 s |
| Audio loading | component: 24 cards rendered | 0 audio fetches before play |

## CI placement

There is no CI. The local gate `pnpm typecheck && pnpm lint && pnpm test` runs every project — unit, integration, web, then the timing projects last and alone — before each commit.
