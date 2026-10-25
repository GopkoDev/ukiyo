---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 18"
---

# 0042 — Save recordings through the file store with a single-file staging path

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** pipeline agent under the owner's run brief (dmytro.hopko)

## Context

The prototype writes `audio/<id>.mp3` with `fs.writeFile` and then inserts the row. If the insert fails it removes the file; deletion removes the row and then the file. A crash between the steps leaves an orphan file, or a row without its file. Images avoid this through `storage/file-store.ts`: stage, rename synchronously inside the DB transaction, trash/restore on delete, sweep on boot (ADR-0006, ADR-0014). The 19 prototype files already live at `audio/<id>.mp3`, and their paths are stored in `file_path`.

## Decision drivers

- Spec AC-10, AC-16, AC-20 and the CONTEXT invariant: never a recording without its file or a file without its recording, even after a crash.
- §6: 100 % of the prototype files kept at their recorded paths.
- Reuse over a second copy of the staging logic.

## Considered options

1. **Extend the file store with single-file audio operations** — `stageAudio(id, bytes, ext)` → `.staging/audio-<id>.<ext>`, `commitAudioSync(id)` → `audio/<id>.<ext>`, `discardAudio`, `trashAudioSync` (→ `.staging/audio-<id>.<ext>.deleted`) / `restoreAudioSync` / `purgeAudio`. The existing boot `sweep` is extended to `sweep(knownGenerationIds, knownRecordingIds)`: it restores both kinds of `.deleted` entries **before** it wipes staging, then removes `audio/` files whose id has no row. The flat layout stays.
2. **Move audio to per-recording directories (`audio/<id>/audio.<ext>`) and reuse the image directory methods as they are** — one code path, but the 19 prototype files have to be moved and their rows rewritten during the upgrade.
3. **Keep the prototype's direct writes and add a boot sweep** — less code, but a failed insert can still leave a partial state until the next boot, and deletion is not atomic.

## Decision outcome

**Chosen:** Option 1. It gives recordings the image guarantees without touching the prototype files or the image directory code paths.

## Consequences

**Positive**
- Atomic save and delete, crash-safe via the boot sweep; prototype paths stay valid.

**Negative**
- The file store grows a second, parallel set of methods (flat files next to directories).

**Neutral**
- One sweep, called once on boot after both repos exist (in `createApp`, after audio is wired), so an interrupted audio deletion is restored instead of wiped. Integration test: crash after `trashAudioSync` → restart → the recording plays.

## Links

- Spec: [[../spec.md]] AC-10, AC-16, AC-20
- SAD: [[../sad.md]] §4
- Related ADR: ADR-0006, ADR-0014, [[0044-rebuild-the-audio-table-in-a-new-migration-keeping-prototype-rows-as-known-cost]]
