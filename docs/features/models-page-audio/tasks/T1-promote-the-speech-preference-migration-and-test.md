# T1 — Promote the speech-preference migration and test it

- **Layer:** migration
- **Depends on:** —
- **ACs:** AC-05, AC-06
- **Files:** `docs/features/models-page-audio/migrations/`, `migrations/`, `src/server/modules/models/migration.int.test.ts`

## Definition of Done

0015 up/down promoted unchanged from staging; migration test (apply over 0014 with image prefs: rows unchanged; rollback drops only the new table); gate green
