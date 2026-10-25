---
status: Accepted
owner: "dmytro.hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 19"
---

# 0047 — Store recording tags and comments in their own cascading tables

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Owner (via the orchestrator), agent

## Context

Recordings need tags and one comment each (spec US-03). Images keep theirs in `generation_tags` / `generation_comments`, which reference `generations(id)` with `ON DELETE CASCADE` (migration 0006). The step-18 handoff forbids editing migrations 0011/0012 or rebuilding `audio_generations`.

## Decision drivers

- Owner decision 2026-10-25: tag vocabularies of image and audio stay separate in storage (spec §1).
- Deletion is all-or-nothing and takes tags and comment along (CONTEXT: Deletion, spec AC-11).
- Same rules as images: tag 1–32 chars, lower-trimmed, ≤ 10, insertion order; comment ≤ 2 000 chars (spec AC-07/AC-08).
- New migration must apply on the Owner's DB with 0011 + 0012 rows (spec §6 Migration safety).

## Considered options

1. **Two new child tables `audio_generation_tags`, `audio_generation_comments`** referencing `audio_generations(id) ON DELETE CASCADE`, constraints copied from 0006.
2. **One polymorphic `tags` / `comments` table for both media** with a `kind` column — needs moving image rows and loses the foreign key (one column can't reference two tables).
3. **JSON columns on `audio_generations`** — requires an ALTER on the table and gives up the per-tag uniqueness and position constraints the image side enforces.

## Decision outcome

**Chosen:** Option 1. It is additive (no existing table touched), keeps the foreign key so deletion cascades inside the existing delete transaction, and enforces the same rules in the database as images do.

## Consequences

**Positive**
- Migration 0013 only creates tables; rollback drops them.
- Recording deletion needs no extra statements; the file move stays the transaction's last step (ADR-0042).

**Negative**
- The tag/comment SQL is mirrored in the audio repo rather than shared with the generations repo (SAD §11).

**Neutral**
- A future cross-media tag view would need a UNION over both tag tables.

## Links

- Spec: [[../spec.md]] AC-07, AC-08, AC-10, AC-11
- SAD: [[../sad.md]] §4 pillar 1
- Related ADR: ADR-0015, ADR-0016 (curate-gallery), ADR-0044 (text-to-speech)
