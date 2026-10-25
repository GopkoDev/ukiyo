---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 18"
---

# 0044 — Rebuild the audio table in a new migration, keeping prototype rows as known cost

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** pipeline agent under the owner's run brief (dmytro.hopko)

## Context

`audio_generations` (migration 0011, applied to the owner's DB with 19 rows) has no `cost_status`, its `voice` column is `NOT NULL CHECK (length 1–100)` (no room for «provider default»), and it has no estimate, duration or provider column. SQLite cannot drop a NOT NULL or change a CHECK in place. 0011 must stay byte-for-byte (owner rule).

## Decision drivers

- Owner rule: 0011 unchanged; every change is a new migration that keeps the existing rows (`known` when `cost_micros` is not null, otherwise `unavailable`).
- Spec AC-09 (voice may be «provider default»), AC-13 (cost status), AC-18 / §6 (100 % preservation).
- Steps 19–21 add sibling tables (tags, comments, presets) keyed by the recording id.

## Considered options

1. **Migration `0012_rebuild_audio_generations`** — create a new table with `provider`, `model_name` (nullable; the catalog name at save time, so a retired model still shows its name — spec AC-15; prototype rows get NULL and display falls back to the catalog name, then the id), nullable `voice`, `cost_status` (+ the 0002-style CHECK), `estimate_micros` and `duration_ms`, copy the rows across (`provider = 'openrouter'`, `cost_status = CASE WHEN cost_micros IS NULL THEN 'unavailable' ELSE 'known' END`, `estimate_micros = NULL`), drop the old table and rename. Add the partial pending index. `down` rebuilds the 0011 shape (rows without a voice get the voice `'default'`).
2. **`ALTER TABLE ADD COLUMN` only** — no rebuild, but the voice stays NOT NULL, so «provider default» needs a magic string forever, and no CHECK can tie the status to the amount.
3. **A new table `recordings`, leaving `audio_generations` behind** — a clean name, but two tables hold the same kind of thing, or a copy-and-drop happens anyway.

## Decision outcome

**Chosen:** Option 1. A rebuild is the SQLite-native way to change constraints, and it keeps the table name and ids, so file paths and step 19–21 foreign keys line up.

## Consequences

**Positive**
- Every recording carries an honest status; prototype rows keep their amounts as final `known` costs (spec §1 override).

**Negative**
- The rebuild copies the table once on upgrade (19 rows: instant); the migration must run in the runner's transaction with foreign keys considered.

**Neutral**
- Tested on a copy of the owner's real DB before ship (SAD §11).

## Links

- Spec: [[../spec.md]] AC-09, AC-13, AC-18
- SAD: [[../sad.md]] §4
- Related ADR: [[0042-save-recordings-through-the-file-store-with-a-single-file-staging-path]], [[0043-resolve-recording-costs-with-the-shared-cost-sync-resolver-and-keep-the-estimate-beside-the-cost]]
