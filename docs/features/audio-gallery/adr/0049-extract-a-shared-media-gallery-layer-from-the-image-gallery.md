---
status: Accepted
owner: "dmytro.hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 19"
---

# 0049 — Extract a shared media-gallery layer from the image gallery

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Owner (via the orchestrator), agent

## Context

The owner asked to mirror the image gallery and to extract shared pieces rather than duplicate them, without breaking image features. The image gallery's dialog (`GenerationDialog.tsx`, ~330 lines) carries a tested stepping engine (neighbours, next-page loading, refresh anchoring, busy blocking, delete-then-move, close-to-place); `Notes.tsx` is coupled to `api.setComment(g.id…)` and the image caches; `DialogBusy.tsx`, `neighbours.ts`, `gridPlace.ts` and the grid's sentinel logic are already media-neutral apart from names.

## Decision drivers

- No image regression; image tests keep their expectations (spec AC-20, §6).
- The audio gallery must match the image behaviour in detail (spec AC-05, AC-09, AC-11).
- Step 21 will reuse the audio card and dialog.

## Considered options

1. **A shared `src/web/features/media-gallery/` layer**: `useDialogStepping` (engine) + `DialogFrame` (header, steps, notices, contexts), `NotesCard` (parameterised by curation calls and patch/gone callbacks), the busy/escape/delete contexts, `neighbours`, `gridPlace` (card attribute as a parameter), `usePagingSentinel`; the image components become thin wrappers over it. Media-specific parts (cards, details, view parsing, query keys, cache patching) stay per medium.
2. **Copy the image components into the audio feature and adapt them** — fastest, no image risk now, but two engines to keep in step and the owner explicitly asked not to.
3. **One generic gallery parameterised by medium end to end** (grid, views, cards, details) — maximal sharing, but the image views (by prompt, lineage, use as input) and the recording specifics make the abstraction leak, and the image surface changes most.

## Decision outcome

**Chosen:** Option 1. It shares the parts with real logic and leaves the presentation per medium; the extraction is done first, against the unchanged image tests, before any audio UI uses it.

## Consequences

**Positive**
- One stepping engine, one notes card, one busy rule for both media and for step 21.

**Negative**
- The image dialog and notes are refactored, a regression risk mitigated only by the existing tests (SAD §11).

**Neutral**
- Moving `DialogBusy` and friends changes image import paths; image files may re-export to keep imports stable.

## Links

- Spec: [[../spec.md]] AC-05, AC-07, AC-09, AC-11, AC-20
- SAD: [[../sad.md]] §4 pillar 2, §8 Dialog stepping
- Related ADR: ADR-0033, ADR-0034
