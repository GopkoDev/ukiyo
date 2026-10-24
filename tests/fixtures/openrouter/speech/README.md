Recorded OpenRouter speech answers (text-to-speech, step 18):

- `models.json` — the live public `GET /api/v1/models?output_modalities=speech` answer read on 2026-10-25 (36 models).
- `generation-found.json` / `generation-not-found.json` — `GET /api/v1/generation?id=` shapes per the OpenRouter API reference (`total_cost`, `api_type: tts`).
- `credits.json`, `error-402.json` — `GET /api/v1/credits` and an error envelope.

Speech answers themselves are raw audio bytes; tests build them inline.
