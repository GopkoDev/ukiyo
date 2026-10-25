---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 21"
---

# 0057 — Link recordings to voice presets through a separate link table

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** dmytro.hopko (Owner/Architect), Claude (design pass, answers delegated by the Owner)

## Context

A recording may be linked to at most one voice preset (spec AC-04). Deleting a preset must keep its recordings and only drop the link (AC-07, AC-08); deleting a recording must drop its link (AC-16). The Owner's real database holds recordings with tags and comments that cascade from `audio_generations` (0013); the owner's running `pnpm dev` applies a new migration at once, and rollbacks must work (`migrateDown`).

## Decision drivers

- Never rebuild or risk `audio_generations` (a rebuild cascade-deletes tags and comments).
- Rollback must be possible: SQLite's `DROP COLUMN` refuses a column used in a foreign key.
- The preset page lists one preset's recordings newest first from an index (spec §6).

## Considered options

1. **A link table `voice_preset_recordings (audio_generation_id PRIMARY KEY REFERENCES audio_generations ON DELETE CASCADE, preset_id REFERENCES voice_presets ON DELETE CASCADE)` with an index on `(preset_id, audio_generation_id)`.**
2. **A nullable `preset_id` column on `audio_generations` with `REFERENCES voice_presets ON DELETE SET NULL`, added by `ALTER TABLE ADD COLUMN`.**
3. **A nullable column without a foreign key, cleared by the service when a preset is deleted.**

## Decision outcome

**Chosen:** Option 1. It is purely additive, both deletions are handled by the database (no service code to forget), the primary key enforces «at most one preset per recording», and the down migration is two `DROP TABLE`s. Option 2 is additive going up but its down migration can't drop the FK column without rebuilding `audio_generations` — exactly the rebuild we must avoid. Option 3 moves referential integrity into code and still needs a rebuild-free down (`DROP COLUMN` works without FK) but allows dangling ids.

## Consequences

**Positive**
- Existing recordings are unlinked by construction (no row); no backfill.
- Rollback is trivial and data-preserving for recordings.

**Negative**
- Reading a recording's preset is a join (one extra query per page, like tags/comments).

**Neutral**
- The recordings list by preset is a join on the link index.

## Links

- Spec: [[../spec.md]] AC-04, AC-07, AC-08, AC-16; §6 migration safety
- SAD: [[../sad.md]] §4 item 1
- Related: ADR-0042, ADR-0047
