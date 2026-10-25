# Data-model audit — voice-presets (2026-10-25)

- **Staged, not live:** `docs/features/voice-presets/migrations/01_create_voice_presets.{up,down}.sql`. Promote-time hint: the repo is sequential 4-digit, next = `0016` (`implement` assigns it; add `0016` to the version list in `src/server/db/migrate.int.test.ts`).
- **Additive only:** two new tables + one index; no ALTER, no rebuild of `audio_generations` (its tags/comments cascade from it). Safe for the Owner's live `pnpm dev`.
- **Reversibility:** every CREATE has a DROP in the down file; rollback loses only presets and links. Checked: up → up (idempotent) → down → up on a fresh DB with 0001–0015 applied.
- **FK indexes:** `voice_preset_recordings.audio_generation_id` = PK; `preset_id` = leading column of `voice_preset_recordings_by_preset`.
- **Conventions:** match 0012/0013 (CHECK constraints, ULID text, ISO text, JSON settings). Deliberate divergence: the name length rule is not a DB CHECK (graphemes can't be counted in SQLite) — only a 240 code-point safety cap.
- **Drift:** none — no existing domain struct for presets; `RecordingRecord` gains no column.
- **TBD:** none.
