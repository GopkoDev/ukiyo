---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 21"
---

# 0059 — Let the grid that opened a recording dialog own it by its history state

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** dmytro.hopko (Owner/Architect), Claude (design pass, answers delegated by the Owner)

## Context

A preset's page shows its recordings with the audio gallery's cards; opening one must show the recording dialog over this grid, step only through the preset's recordings and return to the preset page on Back (spec AC-13). Today the `recording` route belongs to the audio gallery alone: `DIALOG_OF.recording = "audio-gallery"` decides a dialog visit (ADR-0048) and the audio gallery section `owns` every recording route.

## Decision drivers

- Reuse the dialog engine, deletion stepping and caches unchanged (ADR-0049).
- One address per recording — a direct visit still opens the recording page.
- The section behind the dialog renders its own grid and stays the current navigation entry.

## Considered options

1. **The dialog's history state names its gallery (`"audio-gallery"` or `"voices"`); `DIALOG_OF` lists both for `recording`; the Voices section `owns` a recording route whose state names `voices`, the audio gallery every other one; `RecordingDialog` reads its gallery id and views from the state.**
2. **A second item address under Voices (`/audio/voices/<id>/recordings/<rid>`) with its own detail route.**
3. **Open preset recordings in the audio gallery's dialog over the audio gallery, filtered by a view.**

## Decision outcome

**Chosen:** Option 1. It is the ADR-0048 mechanism generalized by one level: the state already carries the grid and order views, it now also carries whose grid it is. Option 2 gives one recording two addresses and a second route kind. Option 3 switches the Owner to another section and loses the preset page behind the dialog.

## Consequences

**Positive**
- ← →, close-to-place, deletion stepping and the «gone» state come from the existing engine.

**Negative**
- `isDialogVisit` and the audio gallery's `owns` look at the state's gallery id; a test pins both owners.

**Neutral**
- A reload of a dialog visit is a direct visit (ADR-0033) and shows the recording page under the audio gallery, as today.

## Links

- Spec: [[../spec.md]] AC-13, AC-16
- SAD: [[../sad.md]] §4 item 6, §6.3
- Related: ADR-0033, ADR-0048, ADR-0049
