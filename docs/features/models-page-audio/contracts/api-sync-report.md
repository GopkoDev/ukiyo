# API sync report — models-page-audio

| Check | Result |
|---|---|
| data-model ↔ contract | `speech_model_preferences` columns ↔ `ModelPreference` (provider limited to openrouter for kind speech) ✅ |
| sad §6.1 ↔ `/providers/{id}/balance` | null on failure/timeout (200); unknown 404; not configured 409 ✅ |
| sad §6.2 ↔ PATCH | flag-on checks (409/502/404) only; off writes skip catalog ✅ |
| spec AC-14 | guard on every route (403) ✅ |
| removed | `GET /audio/credits` — internal client only (`api.speechCredits`), replaced by `/providers/{id}/balance` |
| drift | none |
