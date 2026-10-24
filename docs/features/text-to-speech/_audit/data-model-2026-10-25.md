# Data-model audit — text-to-speech (2026-10-25)

- **Staged migrations:** `docs/features/text-to-speech/migrations/01_rebuild_audio_generations.up.sql` + `.down.sql`. They are **staged, not yet in the live `migrations/` tree**; `implement` promotes them.
- **Promote-time hint:** sequential 4-digit + snake name (`migrations/NNNN_name.{up,down}.sql`), next = `0012` → `0012_rebuild_audio_generations`. `0011_*` stays byte-for-byte unchanged (owner rule).
- **Verified on a copy of the owner's DB** (scratchpad, never `./data`): up → 19 rows, all `known`, Σ `cost_micros` 492 480 preserved; down → 19 rows, Σ preserved. The runner's single transaction with `foreign_keys = ON` is fine: no table references `audio_generations`.
- **Convention deviations:** none. CHECKs, TEXT ULIDs and the status/amount CHECK follow 0002/0005.
- **Breaking-change decomposition:** none needed. The table rebuild ships together with its only reader.
- **Forward risk (steps 19–21):** once child tables with `ON DELETE CASCADE` exist, any later rebuild of `audio_generations` (or running this `down`) would cascade-delete them. Later rebuilds must copy the children first.
- **Drift:** intentional (prototype `Row` lacks the new columns; rewritten in implement).
- **TBD:** none.
