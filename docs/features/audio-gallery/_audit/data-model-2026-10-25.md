# Data-model audit — audio-gallery — 2026-10-25

- **Staged, not live:** `docs/features/audio-gallery/migrations/01_create_audio_curation.{up,down}.sql`, `02_index_audio_generations_by_model.{up,down}.sql`. Migrations are staged — not yet in the live `migrations/` tree; `implement` promotes them.
- **Promote-time hint:** repo is 4-digit sequential (`src/server/db/migrate.ts` `FILE_RE`), last is `0012`; next ≈ `0013`, `0014` — assigned at promotion.
- **Self-check:** naming follows the repo (snake_case, `audio_generation_*` like `generation_*`) ✓; every CREATE has a DROP ✓; FK columns indexed (leading PK column) ✓; conventions (CHECK, cascade, TEXT ids, ISO times) match 0006 ✓.
- **Verified on a scratch SQLite DB:** 0001–0012 + staged ups apply; insert + delete cascades both children; downs remove tables and index, `audio_generations` intact.
- **Deviations:** none. **Breaking changes:** none. **Drift:** none. **TBD:** none.
