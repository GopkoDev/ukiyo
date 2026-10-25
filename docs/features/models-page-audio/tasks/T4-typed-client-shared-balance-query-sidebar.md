# T4 — Typed client + shared balance query; sidebar balances; refresh triggers

- **Layer:** web
- **Depends on:** T3
- **ACs:** AC-11, AC-12, AC-13
- **Files:** `src/web/lib/api.ts`, `src/web/features/balances/`, `src/web/components/app-sidebar.tsx`, `src/web/features/generate/GeneratePanel.tsx`, `src/web/features/audio/SpeechPage.tsx`

## Definition of Done

api.providerBalances; useProviderBalances; ProviderBalances in sidebar; invalidated on job end and speech settle; Speech page credits line from shared query; component tests count requests; gate green
