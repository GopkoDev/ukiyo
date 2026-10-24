---
id: T7
title: "Write the recordings repo over the rebuilt table"
layer: "infra"
deps: ["T1", "T2"]
blocks: ["T8"]
acs: ["AC-03", "AC-13", "AC-15", "AC-16", "AC-18"]
files_hint: ["src/server/modules/audio/recordings-repo.ts", "src/server/modules/audio/recordings-repo.int.test.ts", "tests/helpers/recordings.ts"]
owner: "pipeline agent (implement)"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T7 — Write the recordings repo over the rebuilt table

## Place in the sequence

- **Blocked by:** T1 — Promote migration 0012 and keep the prototype insert valid · T2 — Add the speech family spec map and the shared speech DTOs · **Blocks:** T8 — Build the audio service: validate, speak, save atomically, track cost, delete · **Wave:** 2.
- **Lane:** shares files with T9 — serialized.

## Why (user story)

> **As the** Owner
> **I want** my recent recordings on the Speech page, where I can play, download, reuse and delete them
> **So that** nothing I made is lost, and I can generate again from a past recording
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers: repo integration tests prove insertAtomic with a commit callback (rollback on throw), list newest first with cursor/limit, get, deleteAtomic with a file step, listPendingCosts and resolveCost honouring the status CHECK; rows zod-parsed.

## Inlined context

> **Convention:** hand-written SQL in a per-module `repo.ts` with prepared statements; parse every row through zod before it leaves the repo. … Money: integer micro-USD (`cost_micros`) + status (`known | pending | unavailable`).
>
> — `CLAUDE.md §Conventions, abridged`

> **Atomic save/delete:** Service->>Repo: insert recording (cost known if stated, else pending with a generation id, else unavailable; estimate) and commit file in one transaction … delete the row, then `trashAudioSync` moves the file into staging as the last step
>
> — `sad.md §6 flows 1 + 3, abridged`

> **Precedent:** `generations/repo.ts` `insertAtomic(record, images, commit, inputs)`, `listPendingCosts()`, `resolveCost(id, micros)`; `tests/helpers/generations.ts` `seedGeneration`.
>
> — `architecture-map.md §Where things live, abridged`

> **Naming:** New file `recordings-repo.ts` while the prototype `repo.ts` still serves the prototype routes; T9 deletes the prototype and renames this to `repo.ts`.
>
> — `tasks breakdown, ordering`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Reads/writes every column of `audio_generations` as rebuilt by 0012 (id, provider, model, model_name, voice, text, settings, file_path, media_type, characters, cost_micros, cost_status, cost_ref, estimate_micros, created_at, duration_ms); uses `audio_generations_cost_pending`.

— `data-model.md §Entities, audio_generations, abridged`

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-03 — happy path

> **Given** OpenRouter is configured and the Owner has entered text within the chosen model's character limit, chosen a model and a voice
> **When** the Owner generates speech
> **Then** the page shows that it is working, then shows the new recording with a player that starts playing, a download action, the voice, the model, the time and its cost. The recording appears first in the recent recordings. Ukiyo has saved its text, model, voice, the settings it sent, the audio file, the number of billed characters, its cost, its price estimate (when there was one) and the provider's reference for the later cost lookup.
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — domain invariant

> **Given** a recording has just been saved
> **When** the Owner looks at its cost
> **Then** while Ukiyo is still waiting for the provider to report the actual charge, it reads «cost pending», with the estimate beside it when there is one. If the provider's answer already states the charge, the cost is known at once. Otherwise, once the provider reports the charge (within ten minutes), it changes to that amount without a reload. If the provider never reports it, it reads «cost unavailable», with the estimate still shown as an estimate. An unknown cost is never shown or counted as $0.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — happy path

> **Given** the Owner has made recordings
> **When** the Owner opens the Speech page's recent recordings
> **Then** the ten latest are listed, newest first, each with a player, its text excerpt, voice, model, time, cost (with its status) and a download action. Choosing one puts its text, model, voice and settings back into the form, so the Owner can generate again. If the form holds unsent text that differs from the recording's, the page asks before replacing it. A recording whose model is no longer offered still shows its model's name and plays. Choosing it says that the model is no longer offered and keeps the current model. It still fills in the text, plus the voice and the settings that the current model accepts.
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — domain invariant

> **Given** the Owner deletes a recording
> **When** the deletion completes
> **Then** the recording and its audio file are gone together, with no undo. It disappears from the recent recordings and its file can't be opened any more. Ukiyo stops waiting for its cost. If the deletion fails, the recording stays complete and playable, and the page says the deletion failed.
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — happy path

> **Given** the Owner's machine holds recordings made with the prototype
> **When** the Owner opens the Speech page after the update
> **Then** each prototype recording is still listed and plays, with its text, model, voice and settings. Its recorded amount shows as its cost and is final (Ukiyo does not look it up again), and a recording that had no amount shows «cost unavailable» — never $0.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] zod `Row` → `RecordingRecord` (settings JSON parsed with the shared VoiceSettings)
- [ ] insertAtomic(record, commit) in one transaction; list({cursor, limit}) newest first; get; deleteAtomic(id, trash) returns false when missing; listPendingCosts (provider, costRef, answeredAt = created_at + duration); resolveCost(id, micros|null)
- [ ] `tests/helpers/recordings.ts` `seedRecording(db, dataDir, overrides)`
- [ ] Integration tests

## Edge cases

| Case | Behaviour |
|---|---|
| commit callback throws | no row |
| resolveCost on a non-pending row | no change, returns false |
| cursor at the oldest | empty page, nextCursor null |
| prototype row (model_name NULL, duration NULL) | parses; answeredAt falls back to created_at |

## Definition of Done

- [ ] repo integration tests prove insertAtomic with a commit callback (rollback on throw), list newest first with cursor/limit, get, deleteAtomic with a file step, listPendingCosts and resolveCost honouring the status CHECK; rows zod-parsed
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
