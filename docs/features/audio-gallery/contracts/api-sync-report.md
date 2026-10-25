# API sync report — audio-gallery — 2026-10-25

Contract: [openapi.yaml](./openapi.yaml) — a delta over [text-to-speech/contracts/openapi.yaml](../../text-to-speech/contracts/openapi.yaml). Lint: `npx @redocly/cli@1 lint` → 0 errors (1 warning: no `info.license`, as in earlier contracts).
Conventions followed from the repo (not the template): no `BearerAuth` (local single owner, request guard ADR-0007), envelope `{ error: { code, message, details? } }` with the closed `AppError` codes (`src/server/lib/errors.ts`), cursor `?cursor=&limit=` → `{ items, nextCursor }` like every list in Ukiyo.

## Field origins

| Path | Origin | Confidence |
|---|---|---|
| listRecordings.model | `audio_generations.model` (1–100 chars, 0012) + index `audio_generations_by_model` (data-model 02) | high |
| listRecordingModels.models[].{model,count,latestId} | `GROUP BY model` → `count(*)`, `max(id)` over `audio_generations` (data-model §Indexes) | high |
| listRecordingModels.models[].modelName / Recording.modelName | `audio_generations.model_name` newest non-NULL per model, else catalog `peek`, else id (ADR-0052) | high |
| listRecordingModels.models[].provider | `audio_generations.provider` | high |
| Recording.tags | `audio_generation_tags.tag` ordered by `position` (data-model 01) | high |
| Recording.comment.{body,updatedAt} | `audio_generation_comments.body/updated_at` (data-model 01) | high |
| setRecordingComment.body | shared rule `checkComment` (`src/shared/curation.ts`), CHECK ≤ 2000 | high |
| addRecordingTag.tag | shared rule `normalizeTag`, CHECK 1–32 lower-trimmed; ≤ 10 in the repo transaction | high |
| every other Recording field | unchanged step-18 schema | high |

## Drift checklist

- [x] **Endpoint ↔ model** — every new field traces to a 0013/0014 column or an existing 0012 column; no orphan field.
- [x] **Error code ↔ repo** — VALIDATION_ERROR, FORBIDDEN, NOT_FOUND, STORAGE_ERROR all exist in `AppError`'s code union.
- [x] **Validation ↔ constraint** — tag 1–32 / ≤ 10, comment ≤ 2 000, model ≤ 100, id pattern mirror the DDL and the existing route guards.
- [x] **OpenAPI ↔ sequences** — flow 2 (read: found / not found), flow 3 (tag: invalid / gone / limit / added; comment: too long / empty / text), flow 4 (delete: failed 500 / unknown 404 / done 204), flow 5 (groups; model page empty for unknown model) all have responses.

## Coverage back-feed

- Every spec §5 AC with a server side maps to an operation: AC-01/03 → listRecordings; AC-04 → getRecording (pending poll); AC-05/06 → getRecording; AC-07/08/10 → comment + tag operations; AC-11/12/18 → deleteRecording; AC-13/15/21 → listRecordings?model; AC-14/21 → listRecordingModels; AC-19 → 403 on every operation. AC-02, AC-09, AC-16, AC-17, AC-20 are client-only (no operation; AC-16/17 reuse getRecording + the step-18 models read).
- Every operation maps to a user story: US-01 list, US-02 get, US-03 comment/tags, US-04 delete, US-05 list?model + groups.
- No sequence gaps found. No open questions raised.
