---
id: T12
title: "Build the audio «By model» overview"
layer: "ui"
deps: ["T11"]
blocks: ["T15"]
acs: ["AC-14", "AC-21"]
files_hint: ["src/web/features/audio/gallery/AudioByModel.tsx", "src/web/features/audio/gallery/AudioByModel.test.tsx"]
owner: "agent (sdd:implement)"
estimate: "S"
context_budget: "S"
status: "done"
step: "COMMIT"
---

# T12 — Build the audio «By model» overview

## Place in the sequence

- **Blocked by:** T11 — Build the Audio → Gallery section: grid, recording card, model choice and states · **Blocks:** T15 — Prove cross-section coherence and the request budgets · **Wave:** 6.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to see only one speech model's recordings, or an overview grouped by model
> **So that** I can compare what each model sounds like and costs
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers: build the audio «By model» overview.

## Inlined context

> SCR-03: one section per model: h3 display name, «N recordings», link «Show all N», a row of up to four RecordingCard; loading · empty · error «Couldn't load the models.» + Try again · stale.
>
> — `screens.md, SCR-03, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `listRecordingModels(4)` via T10.

## Acceptance criteria

### AC-14 — happy path

> **Given** recordings were made with several speech models
> **When** the Owner chooses «By model»
> **Then** the page shows one section per model, ordered by each model's newest stored recording. Each section has the model's name, its count, its four latest cards, and «Show all N», which opens that model's grid. A card opened from a section or from a model's grid steps through all of that model's recordings, newest first (loading more at the end, not only the four shown); the view behind the dialog does not change. Closing returns to the view it was opened from: a model's grid brings the last shown card into view, «By model» returns to the section unchanged. Deleting moves to the neighbour in that model's order; when it was the model's last recording, the dialog closes onto the view, where the model's grid shows «No recordings with <model>» and the «By model» section is gone. A model no longer offered still has its section under the name it was recorded with. Recordings are grouped and matched by their exact model id. A model has one display name, the same in the model choice, the headings, the cards and the dialog: the name stored with its newest recording that has one, else the name the speech catalog gives it, else its model id. The gallery stays usable when the speech catalog can't be reached.
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — domain invariant

> **Given** the Owner browses any view of the audio gallery while recordings are added and deleted
> **When** pages load, or a recording is made or deleted
> **Then** each recording appears once in a view — never twice and never skipped at a page boundary. A model's count equals its recordings, and «Show all N» opens exactly N. A new recording moves its model's section to the top of «By model». Deleting a model's last recording removes the model from the model choice and from «By model»; in that model's own view the page then shows «No recordings with <model>» (AC-15).
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Mirror `features/gallery/ByModel.tsx` with RecordingCard and audio views (`grid: models`, `order: model`)
- [ ] Scroll kept on return from a dialog
- [ ] Component tests incl. new recording moves a group first, last deletion drops a group

## Edge cases

| Case | Behaviour |
|---|---|
| retired model | section under its recorded name |

## Definition of Done

- [ ] component tests pass
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
