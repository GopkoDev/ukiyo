---
status: Draft
updated_at: "2026-10-25"
feature_size: "M"
---

# Test plan — models-page-audio

## Test plan

Levels: unit · integration (real SQLite in a temp data dir via `createTestApp`, provider HTTP from fixtures or a fake fetch) · component (Testing Library + jsdom, mocked typed client) · contract (shared zod schemas parse every answer, inside integration). e2e-through-UI is the manual walk at ship on a copy of the Owner's data.

### AC → tests

| AC | Test | Level |
|---|---|---|
| AC-01 | Audio view lists speech models in Speech order with name/id, maker, price wording, limit (+ «limit not published»), voices («N voices» / «provider default»), controls or «—», heading count | component (`AudioModels.test.tsx`) |
| AC-01 | voice/controls wording helpers | unit |
| AC-02 | toggling ★ / Show in picker updates the row, persists (read back), twice = start | component + integration |
| AC-03 | `arrangeSpeechModels`: favorites first in Speech order, hidden out (even if favorite), no prefs = step 18 | unit |
| AC-03 | the Speech list shows the Favorites group and updates after a change on the Models page without reload | component |
| AC-04 | selected hidden model stays, top of its maker group, «Hidden»; auto-pick first favorite else first visible, never hidden; reuse of a retired model keeps current | unit + component |
| AC-05 | a speech star with an id that is also an image preference leaves the image row unchanged and vice versa | integration |
| AC-06 | «No longer offered» from a loaded catalog only; Forget clears; off-writes succeed with catalog down / not configured / model retired | component + integration |
| AC-07 | failed save reverts + message; flag-on for an unknown speech model refused, nothing stored | component + integration |
| AC-08 | catalog error + Try again; not configured; prefs unreadable (toggles disabled, no retired list); Speech list with unreadable prefs = step 18 | component |
| AC-09 | Image › Models → Image view, Audio › Models → Audio view, one entry current; tab switch pushes address; Back/Forward; reload; unknown tab = Image | component (App) + unit (`sectionFor`) |
| AC-10 | every existing Models page test passes unchanged; no speech model in Image view | component (existing suites) |
| AC-11 | sidebar lists configured providers with `$x.xx`; unconfigured not listed; «…» first | component |
| AC-12 | a null balance shows «—» with tooltip; a later failure after success shows «—»; other provider unaffected | component |
| AC-12 | one provider throwing / hanging (10 s) / unparseable → null, other provider present | integration (fake fetch) + unit (adapter parse) |
| AC-13 | balance re-read when a job leaves running, when a recording settles, every 5 min visible, on focus; a trigger mid-read → one more read | component (fake timers, request count) |
| AC-13 | Speech page's credits line equals the sidebar figure, one request | component |
| AC-14 | foreign-origin balances read and speech preference write refused | integration |
| AC-14 | no key in the balances answer | integration |
| AC-15 | OpenRouter balance = total_credits − total_usage; Vercel = published balance; nothing stored | unit (adapters) |
| §6 Migration | DB at 0014 with image preferences → 0015 applies, rows unchanged; rollback drops only the new table | integration |
| contract | `BalanceResponse`, `PreferencesResponse` (kind speech) parse | integration |

### e2e-through-UI (manual at ship)

Copy of the Owner's data, real keys, free reads only: open Audio › Models, star + hide a speech model, check the Speech list; switch tabs, Back, reload; balances visible on Generate, Gallery, Speech, a recording page.

## Integration strategy

- Real SQLite per test (`tests/helpers/test-app.ts`), migrated as on boot.
- Provider HTTP: speech catalog from `tests/fixtures/openrouter/speech/models.json`; credits from small inline fake-fetch answers (OpenRouter `/credits`, Vercel `/v1/credits`), plus a hanging route for the timeout case.
- No paid call.

## Load

| NFR | Scenario | Threshold |
|---|---|---|
| Preference save | 50 speech-preference writes, warm catalog | p95 ≤ 50 ms server time |
| Balance read | both providers answering | p95 ≤ 2 s; hanging one ≤ 10 s, the other present |

## CI placement

No CI; the local gate `pnpm typecheck && pnpm lint && pnpm test` before each commit.
