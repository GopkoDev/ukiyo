---
status: Accepted
owner: "dmytro.hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 19"
---

# 0051 — Carry tags and the comment on the one recording DTO and add model views to the audio API

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Owner (via the orchestrator), agent

## Context

Images use a summary DTO for cards (`tags`, `hasComment`) and a full DTO for the detail. Recordings have one DTO (`Recording`) used by the Speech page's recent list, the latest result and now the gallery. The gallery also needs a one-model page and model groups with counts and the latest four (spec AC-13, AC-14, AC-21).

## Decision drivers

- Requests while browsing: a curation change costs 0 list reads; a step ≤ 1 read (spec §6).
- A recording row is small; a comment is ≤ 2 000 chars.
- The Speech page (step 18) must keep working unchanged.

## Considered options

1. **Extend the one `Recording` DTO with `tags` and `comment`** (additive), add `model` to the list query, add a model-groups read (`/audio/recordings/models?latest=N`, before `/:id`), and curation routes mirroring images (comment put, tag add, tag remove).
2. **A separate summary DTO for cards** like images — less payload per page, but two shapes to patch in every cache and the Speech page's lists would need a decision on which to use.
3. **Curation as separate reads** (`/recordings/:id/tags`) — more requests per card, against §6.

## Decision outcome

**Chosen:** Option 1. One shape everywhere keeps cache patching simple (one patch function over every `["recordings"]` entry) and is a non-breaking addition for the Speech page.

## Consequences

**Positive**
- The card, dialog, page and Speech lists all render from one object.

**Negative**
- Up to 24 comments per page travel with the list (≤ 2 000 characters each, under 200 kB in UTF-8 in the worst case), which the 300 ms local target absorbs.

**Neutral**
- Model groups are per model id only (one speech provider today); the provider stays a field for when a second one arrives.

## Links

- Spec: [[../spec.md]] AC-01, AC-07, AC-13, AC-14, AC-21, §6
- SAD: [[../sad.md]] §4 pillar 1, §5
- Related ADR: ADR-0036 (gallery-by-model)
