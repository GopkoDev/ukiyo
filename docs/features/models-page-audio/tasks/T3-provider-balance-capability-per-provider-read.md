# T3 — Provider balance capability and per-provider balance read; remove speech credits

- **Layer:** backend
- **Depends on:** —
- **ACs:** AC-11, AC-12, AC-14, AC-15
- **Files:** `src/server/modules/providers/`, `src/shared/providers.ts`, `src/server/modules/audio/`

## Definition of Done

OpenRouter + Vercel adapters balance(); GET /providers/{id}/balance with a 10 s deadline, null on failure, 404 unknown, 409 not configured; /audio/credits + credits() removed; no key in answer; gate green
