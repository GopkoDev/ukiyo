---
id: T5
title: "Give the file store single-file audio staging, trash and one combined boot sweep"
layer: "infra"
deps: []
blocks: ["T8"]
acs: ["AC-10", "AC-16", "AC-20"]
files_hint: ["src/server/modules/storage/file-store.ts", "src/server/modules/storage/file-store.int.test.ts", "src/server/modules/generations/service.ts"]
owner: "pipeline agent (implement)"
estimate: "M"
context_budget: "M"
status: "done"
step: "COMMIT"
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T5 — Give the file store single-file audio staging, trash and one combined boot sweep

## Place in the sequence

- **Blocked by:** — · **Blocks:** T8 — Build the audio service: validate, speak, save atomically, track cost, delete · **Wave:** 1.
- **Lane:** shares files with T9 — serialized.

## Why (user story)

> **As the** Owner
> **I want** my recent recordings on the Speech page, where I can play, download, reuse and delete them
> **So that** nothing I made is lost, and I can generate again from a past recording
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers: file-store tests prove stage→commit, discard, trash→restore, trash→purge for audio and that one sweep restores interrupted image and audio deletions before wiping staging and drops orphan audio files; image tests unchanged and green.

## Inlined context

> **ADR-0042 decision:** Extend the file store with single-file audio operations — `stageAudio(id, bytes, ext)` → `.staging/audio-<id>.<ext>`, `commitAudioSync(id)` → `audio/<id>.<ext>`, `discardAudio`, `trashAudioSync` (→ `.staging/audio-<id>.<ext>.deleted`) / `restoreAudioSync` / `purgeAudio`. The existing boot `sweep` is extended to `sweep(knownGenerationIds, knownRecordingIds)`: it restores both kinds of `.deleted` entries **before** it wipes staging, then removes `audio/` files whose id has no row. The flat layout stays.
>
> — `adr/0042, Option 1, verbatim`

> **Consequence:** One sweep, called once on boot after both repos exist (in `createApp`, after audio is wired), so an interrupted audio deletion is restored instead of wiped.
>
> — `adr/0042, Consequences, verbatim`

> **Existing code:** `sweep(knownIds)` restores `<id>.deleted` image dirs, then `rmSync(.staging)`, then drops unknown `generations/<id>` dirs (file-store.ts:93-115); called from `generations/service.ts` `sweepOnBoot()`.
>
> — `src/server/modules/storage/file-store.ts, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-10 — domain invariant

> **Given** a model that returns audio in a raw form a browser can't play directly
> **When** its recording is saved
> **Then** the saved file plays in the page's player and downloads as a common audio file. Raw audio is wrapped, without loss, as a WAV file; audio that arrives as MP3 is kept as it came. The Owner never chooses an output format, and the recording names its file type. A recording is saved only together with its audio file — never a recording without audio, never an audio file without its recording — even if Ukiyo stops in the middle of saving.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — domain invariant

> **Given** the Owner deletes a recording
> **When** the deletion completes
> **Then** the recording and its audio file are gone together, with no undo. It disappears from the recent recordings and its file can't be opened any more. Ukiyo stops waiting for its cost. If the deletion fails, the recording stays complete and playable, and the page says the deletion failed.
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — error

> **Given** the provider answered with audio, but Ukiyo can't save it (for example the disk is full, or raw audio can't be converted)
> **When** the Owner generates
> **Then** the page says that the audio arrived but couldn't be saved, and that the provider may still charge for it. Nothing partial is left behind: no recording without its file and no stray file. The text and settings stay as the Owner set them.
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add the audio methods with `resolveRecorded`-style path guards; ext from media type (`mp3`, `wav`)
- [ ] Change `sweep(knownIds)` → `sweep(knownGenerationIds, knownRecordingIds?)` (second arg optional so `generations/service.ts sweepOnBoot` compiles unchanged until T9 passes both); when the second arg is absent, audio files are left alone
- [ ] Tests in `file-store.int.test.ts` for each new method and the combined sweep

## Edge cases

| Case | Behaviour |
|---|---|
| crash after trashAudioSync | boot sweep moves it back to `audio/<id>.<ext>` |
| staged audio of an unknown id at boot | removed with staging |
| `audio/<id>.mp3` without a row | removed when recording ids are given |
| prototype file path `audio/<id>.mp3` | stays valid (flat layout) |

## Definition of Done

- [ ] file-store tests prove stage→commit, discard, trash→restore, trash→purge for audio and that one sweep restores interrupted image and audio deletions before wiping staging and drops orphan audio files; image tests unchanged and green
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
