---
id: T14
title: "List recent recordings with reuse, delete and live pending costs"
layer: "ui"
deps: ["T13"]
blocks: ["T16"]
acs: ["AC-13", "AC-15", "AC-16", "AC-18"]
files_hint: ["src/web/features/audio/RecentRecordings.tsx", "src/web/features/audio/RecentRecordings.test.tsx", "src/web/features/audio/ReplaceTextDialog.tsx", "src/web/features/audio/DeleteRecording.tsx", "src/web/features/audio/SpeechPage.tsx"]
owner: "pipeline agent (implement)"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T14 — List recent recordings with reuse, delete and live pending costs

## Place in the sequence

- **Blocked by:** T13 — Rebuild the Speech page on the new contract · **Blocks:** T16 — Register the audio components in the design canon and the architecture map · **Wave:** 6.
- **Lane:** shares files with T13 — serialized.

## Why (user story)

> **As the** Owner
> **I want** my recent recordings on the Speech page, where I can play, download, reuse and delete them
> **So that** nothing I made is lost, and I can generate again from a past recording
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers: component tests prove the ten latest with all fields, loading/empty/error, 10 s refresh only while a cost is pending, reuse filling the form, the replace confirm, the model-gone notice, delete confirm/busy/failure and removal.

## Inlined context

> **SCR-04 states:** default: ten latest: excerpt (reuse button), voice, model name, time, cost with status, small player, download, delete · loading · empty «No speech generated yet.» · error «Couldn't load your recordings — Try again» · pending refresh every 10 s until settled · prototype rows listed like any other · deleting · delete failed «Couldn't delete — try again» · gone → removed silently
>
> — `screens.md SCR-04, abridged`

> **SCR-05 / SCR-06:** Replace your text? «Keep mine» (focus) / «Replace» · Delete this recording? «Its audio file is deleted too. This can't be undone.» «Cancel» (focus) / «Delete» (destructive); busy «Deleting…»; error keeps the dialog open
>
> — `screens.md SCR-05, SCR-06, abridged`

> **Reuse:** Dialog, Button, Skeleton; `features/gallery/DeleteGeneration.tsx` + `DialogBusy.tsx` as the shape; CostLabel (T11)
>
> — `screens.md, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

`GET /api/audio/recordings?limit=10`, `DELETE /api/audio/recordings/{id}` (204 / 404 / 500), `GET …/{id}/file`.

— `contracts/openapi.yaml, listRecordings/deleteRecording/getRecordingFile, abridged`

## Acceptance criteria

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

- [ ] RecentRecordings (query key `['recordings','recent']`, refetchInterval 10 s while any pending)
- [ ] Reuse → form via the page's draft; ReplaceTextDialog when unsent text differs; model-gone notice
- [ ] DeleteRecording dialog
- [ ] Wire into the Recent tab; invalidate after generate/delete
- [ ] Tests

## Edge cases

| Case | Behaviour |
|---|---|
| delete returns 404 | item removed silently |
| delete returns 500 | dialog stays, «Couldn't delete this recording — try again» |
| no pending costs | no polling |

## Definition of Done

- [ ] component tests prove the ten latest with all fields, loading/empty/error, 10 s refresh only while a cost is pending, reuse filling the form, the replace confirm, the model-gone notice, delete confirm/busy/failure and removal
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
