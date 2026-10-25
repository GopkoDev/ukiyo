---
status: Draft
updated_at: "2026-10-25"
feature_size: "M"
---

# Test plan — voice-presets

## Test plan

Levels: unit · integration (real SQLite in a temp data dir via `createTestApp`, speech HTTP from `tests/fixtures/openrouter/` through the fake fetch) · component (Testing Library + jsdom, mocked typed client) · nfr (`*.nfr.int.test.ts`-style timing in the serial `nfr` project) · contract (shared zod schemas parse every answer, inside integration). e2e-through-UI is the manual walk at ship on a copy of the Owner's data (≤ 2 paid TTS calls, ≤ 80 characters each).

Data strategy: presets and recordings created through the API (`POST /api/audio/presets`, `POST /api/audio/recordings` with the fake speech provider); large datasets for NFRs inserted directly through the repos in one transaction.

### AC → tests

| AC | Test | Level |
|---|---|---|
| AC-01 | create stores name, model, model name, voice, `settingsFor` subset (an extra/out-of-range setting normalized), no text; read back after reopening the DB | integration |
| AC-01 | Save on Speech → name prefilled «<voice> · <model>», confirm → preset applied (plain name), listed | component (`SpeechPresets.test.tsx`) |
| AC-02 | `presetName`: trim, empty, 61 graphemes refused, 60 emoji / combining accents accepted, case-insensitive key («Диктор»/«диктор») | unit |
| AC-02 | duplicate name (any case, any alphabet) → field error, nothing stored; case-only rename of itself allowed | integration |
| AC-02 | dialog shows the field messages and «Couldn't save — try again.», keeps the text | component |
| AC-03 | pick a preset → model/voice/settings set, text kept, hidden model selected with «Hidden», overrides the automatic pick; list by name | component |
| AC-04 | applied unchanged → request carries presetId → recording linked; detail names the preset with a link; Voices count/total/last use include it | integration + component |
| AC-05 | `presetMatches`: same / other model / other voice / null vs voice / settings key order / defaults filled / instructions trimmed / dropped control counts as different | unit |
| AC-05 | edit a control → «modified», back → plain; modified → no presetId sent; Detach keeps values | component |
| AC-05 | request naming a preset with different settings, an unknown or malformed-but-valid id → 201 unlinked | integration |
| AC-06 | modified → Save offers Update / Save as new; Update replaces setup, keeps links, old recordings keep their own settings; Save disabled while applied unchanged | integration + component |
| AC-07 | rename shows everywhere without reload (Speech, Voices, page, recording detail); delete confirmation text with N; applied preset detaches; page shows «This voice no longer exists.»; failures show «Couldn't save/delete — try again.» | component |
| AC-08 | deleting a preset leaves recordings, tags, comments, files unchanged, `preset: null` | integration |
| AC-09 | retired model or dropped voice → «No longer offered», not applicable, renamable, deletable, recordings listed; catalog not loaded → listed, not applicable | unit (`presetAvailability`) + component |
| AC-10 | applying a preset whose stored settings the model no longer fully accepts → form normalized, shows «modified» | component |
| AC-11 | Voices lists presets by name with model, voice label, settings badges, «N recordings» / «No recordings yet», total, last use / «Never used»; Audio nav order Speech, Gallery, Voices, Models, Voices current on list and preset page | component (+ `sections.test.tsx`) |
| AC-12 | `presetCostText`: known only / + pending / · without a price / both / «— + 1 pending» / «—» with no recordings | unit |
| AC-12 | stats aggregate: known sum, pending and unavailable counts, estimates excluded | integration |
| AC-13 | preset page: header, grid of exactly its recordings newest first, paging; dialog over the grid steps only within the preset; Back returns; empty state | component + integration (`?preset=` paging) |
| AC-14 | Apply from Voices/page → Speech with preset applied, text kept, Back returns; in flight → notice; gone / not applicable → notice | component |
| AC-15 | reuse of a linked recording applies its preset only if it exists, is applicable and still matches | component |
| AC-16 | deleting a recording elsewhere updates the preset's count/total/last use and removes its card; dialog steps to its neighbour | component + integration |
| AC-17 | foreign-origin list/create/update/delete presets and linked generation refused, nothing changes | integration |
| AC-18 | preset deleted while the provider answers → recording saved, unlinked; updated meanwhile → link decided at receipt | integration (fake fetch with a hook between receipt and answer) |
| AC-19 | Voices / preset page / next page / Speech list read failures show their messages + Try again; generating still works | component |
| ADR-0059 | Voices owns its dialog visits, audio gallery every other recording route; reload of a dialog visit = audio gallery page | unit (`sectionFor`) + component |
| ADR-0060 | `/speech` and `/speech/` still redirect; `/audio/voices/<id>` stays | component (App) |
| §6 Voices list | 200 presets × 5 000 recordings ≤ 100 ms p95, no provider call | nfr |
| §6 Preset grid | one page of a preset's recordings ≤ 100 ms p95 with 5 000 recordings | nfr |
| §6 Preset changes | save/update/rename/delete ≤ 50 ms p95, also with a stale catalog entry (no provider wait) | nfr |
| §6 Apply | no request beyond the loaded list on apply | component (request count) |
| §6 Link check | no added provider call when linked | integration (call count) |
| §6 Migration | DB at 0015 with recordings + tags + comments → 0016 applies, rows unchanged and unlinked; rollback drops only the new tables; `0016` in the version list | integration (`migrate.int.test.ts`) |
| contract | `VoicePreset`, `VoicePresetsResponse`, `Recording.preset` parse every answer | integration |

### e2e-through-UI (manual at ship)

On a fresh copy of `./data`: Speech → set up a voice → Save → Generate (≤ 80 chars) → Voices shows 1 recording, the recording's detail names the preset; change a control («modified») → Generate (≤ 80 chars) → unlinked; Update preset; rename; open the preset page, dialog ← →; Apply from Voices; delete the preset → recordings kept; migration applied without touching the existing recordings.
