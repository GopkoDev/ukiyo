# API sync report — text-to-speech (2026-10-25)

Contract: [`openapi.yaml`](./openapi.yaml). Derived from [`data-model.md`](../data-model.md) (staged 0012 shape), sad.md §6 flows 1–7, spec §4/§5. It replaces the prototype routes (`/api/audio`, `/api/audio/:id/file`, `DELETE /api/audio/:id`): their only client is the SPA, shipped in the same change. `/api/audio/models` and `/api/audio/credits` keep their paths.

Deviations from the skill template, following repo precedent (every shipped contract): `security: []` + the request guard instead of BearerAuth; the shipped error envelope `{ error: { code, message, details? } }` with the closed uppercase `AppError` codes instead of `module.error_name`; `cursor`/`nextCursor` paging as in `/generations`.

## Field origins

| operation.field | origin | confidence |
|---|---|---|
| Recording.id, createdAt, model, text, characters, costMicros, url | data-model `audio_generations` (id, created_at, model, text, characters, cost_micros, file_path → route) | high |
| Recording.provider, modelName, voice (nullable), costStatus, estimateMicros, durationMs, mediaType enum | data-model new / changed columns (ADR-0044) | high |
| Recording.settings / StartSpeechRequest.settings | `settings` JSON; keys from the family spec map (ADR-0040) | high |
| StartSpeechRequest.text max 40 000 | prototype bound (largest family limit, Flash v2.5); the per-model limit is checked by the service | high |
| VoiceSettings.instructions maxLength 1000 | spec AC-07 | high |
| SpeechModel.* | OpenRouter catalog (id, name, supported_voices, pricing, context_length) + family spec map (maker, controls, maxChars, voiceMode, outputLabel) | medium (catalog drift) |
| CreditsResponse.remainingUsd | OpenRouter `/credits` total_credits − total_usage (prototype) | high |

## Drift checklist

- [x] **endpoint ↔ model:** every Recording field is a column or derived from one (url ← id); there are no fields without an origin.
- [x] **error-code ↔ repo:** VALIDATION_ERROR, FORBIDDEN, NOT_FOUND, PROVIDER_NOT_CONFIGURED, STORAGE_ERROR and PROVIDER_ERROR all exist in `src/server/lib/errors.ts` (code union).
- [x] **validation ↔ constraint:** voice 1–100 / null ↔ CHECK; mediaType enum ↔ CHECK; costStatus enum ↔ CHECK; text non-blank ↔ `length(trim(text)) > 0`.
- [x] **OpenAPI ↔ sequences:** flow 1 branches → 400 (unknown model / limit / empty), 502 (refused / failed / timeout / no audio), 500 (conversion or save fails), 201 (known / pending / unavailable). Flow 4 → models + credits 409. Flow 5 → list, file. Flow 6 → 404 / 500 / 204. The request guard → 403 on every path.

## Back-feed (coverage)

| AC | Operation / response |
|---|---|
| AC-01, AC-02 | client routing / keep-mounted (no contract) |
| AC-03 | createRecording 201, getRecordingFile |
| AC-04 | createRecording 400 (+ client guard) |
| AC-05 | createRecording 502 |
| AC-06 | getSpeechCredits / createRecording 409 |
| AC-07, AC-08, AC-09 | listSpeechModels (controls, voices, voiceMode, maxCharsSource); createRecording stores only accepted settings |
| AC-10, AC-20 | createRecording 201 mediaType audio/wav for PCM; 500 STORAGE_ERROR |
| AC-11, AC-12 | listSpeechModels price (client computes the estimate with the shared rule) |
| AC-13 | Recording.costStatus + estimateMicros; getRecording / listRecordings refresh |
| AC-14 | getSpeechCredits; recordings are absent from every image operation |
| AC-15, AC-18 | listRecordings limit 10; modelName fallback |
| AC-16 | deleteRecording |
| AC-17 | client (no contract) |
| AC-19 | 403 on every operation |

There are no sequence gaps and no orphan operations: `getRecording` serves the pending refresh (AC-13), and `cursor` serves the step-19 forward compatibility, which is allowed because the parameter is additive.
