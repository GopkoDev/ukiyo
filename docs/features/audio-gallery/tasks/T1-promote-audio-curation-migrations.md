---
id: T1
title: "Promote the audio curation migrations and test them on prototype-shaped data"
layer: "migration"
deps: []
blocks: ["T2"]
acs: ["AC-10", "AC-11"]
files_hint: ["docs/features/audio-gallery/migrations/01_create_audio_curation.up.sql", "docs/features/audio-gallery/migrations/02_index_audio_generations_by_model.up.sql", "migrations/", "src/server/modules/audio/migration.int.test.ts"]
owner: "agent (sdd:implement)"
estimate: "S"
context_budget: "M"
status: "todo"
step: ""
---

# T1 — Promote the audio curation migrations and test them on prototype-shaped data

## Place in the sequence

- **Blocked by:** — · **Blocks:** T2 — Add model filter, model groups, stored names and tag/comment statements to the recordings repo · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to add tags and a comment to a recording
> **So that** I can remember why I made it and group it with others
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As the** Owner
> **I want** to delete a recording from the gallery or its dialog
> **So that** recordings I don't want are gone from the machine
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task delivers: promote the audio curation migrations and test them on prototype-shaped data.

## Inlined context

> Recordings' tags and comments are stored apart from the image ones. The two tag vocabularies stay separate. They follow the same rules: a tag is 1–32 characters, normalized, at most 10 per item, and a comment is up to 2 000 characters.
>
> — `spec.md §1, Decision (owner, 2026-10-25), abridged`

> Two new child tables `audio_generation_tags`, `audio_generation_comments` referencing `audio_generations(id) ON DELETE CASCADE`, constraints copied from 0006.
>
> — `adr/0047, Decision outcome, abridged`

> **Hard rule:** never edit migrations 0011/0012 and never rebuild `audio_generations`; child tables cascade from it. Migration safety: the new storage applies on top of the Owner's current recordings database without changing or losing any recording.
>
> — `sad.md §2 + spec.md §6, Conventions / Migration safety, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

| Table / index | Change |
|---|---|
| `audio_generation_comments(audio_generation_id PK → audio_generations ON DELETE CASCADE, body CHECK trim>0 AND ≤2000, updated_at)` | added |
| `audio_generation_tags(audio_generation_id → audio_generations ON DELETE CASCADE, tag CHECK 1–32 lower(trim), position ≥1, PK(id, tag))` | added |
| `audio_generations_by_model (model, id)` | added index |

Staged pairs: `docs/features/audio-gallery/migrations/01_create_audio_curation.{up,down}.sql` → promote as `migrations/0013_create_audio_curation.*`; `02_index_audio_generations_by_model.{up,down}.sql` → `migrations/0014_index_audio_generations_by_model.*`.

— `data-model.md §Entities + §Migrations, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-10 — cross-context

> **Given** the Owner tags a recording
> **When** the Owner later looks at image generations
> **Then** the recording's tags never appear on any image generation, and image tags never appear on recordings. The same word may be used in both, and each keeps its own.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy path

> **Given** a recording is shown in its dialog or on its page (as for image generations, a card has no Delete)
> **When** the Owner chooses Delete and confirms
> **Then** the recording, its audio file, its tags and its comment are gone together, with no undo. In the dialog, the neighbour is chosen from the order as it was before the deletion: the next older recording shows, loading the next page when the deleted one was the last loaded, or the newer one when there is no older, with «Recording deleted.» When there is none, or that next page can't be read, the dialog closes onto the grid with the notice. On the page, the Owner lands on the gallery with the notice. The card leaves the grid, any model view and the overview counts, and the Speech page's recent recordings and latest result drop it too, with no reload. Ukiyo stops waiting for its cost.
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Copy the staged pairs into `migrations/0013_create_audio_curation.{up,down}.sql` and `migrations/0014_index_audio_generations_by_model.{up,down}.sql` (content unchanged)
- [ ] Extend `src/server/modules/audio/migration.int.test.ts`: DB at 0012 with prototype-shaped rows → apply 0013+0014 → rows byte-identical; insert tags+comment, delete the recording → children gone; roll back 0014 then 0013 → tables + index gone, rows intact
- [ ] Run the full gate

## Edge cases

| Case | Behaviour |
|---|---|
| a tag row for a missing recording | refused by the foreign key |
| delete a recording with tags and a comment | children removed by cascade |
| rollback | drops index first, then tables; `audio_generations` untouched |

## Definition of Done

- [ ] migration test passes: apply, cascade, rollback
- [ ] existing step-18 migration tests still pass
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
