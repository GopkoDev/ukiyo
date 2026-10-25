# T2 — Kind-aware preference repo and routes (speech checked against the speech catalog)

- **Layer:** backend
- **Depends on:** T1
- **ACs:** AC-02, AC-05, AC-06, AC-07, AC-14
- **Files:** `src/shared/models.ts`, `src/server/modules/models/`, `src/server/app.ts`

## Definition of Done

GET/PATCH accept kind (image default, image tests unchanged); speech flag-on checked against speech catalog; off-writes skip it; kept apart; guard refusal; nfr p95 ≤ 50 ms; gate green
