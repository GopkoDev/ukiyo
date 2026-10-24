---
id: T1
title: "Promote migration 0012 and keep the prototype insert valid"
layer: "migration"
deps: []
blocks: ["T7"]
acs: ["AC-18"]
files_hint: ["migrations/", "docs/features/text-to-speech/migrations/01_rebuild_audio_generations.up.sql", "docs/features/text-to-speech/migrations/01_rebuild_audio_generations.down.sql", "src/server/modules/audio/repo.ts", "src/server/modules/audio/migration.int.test.ts"]
owner: "pipeline agent (implement)"
estimate: "S"
context_budget: "S"
status: "done"
step: "COMMIT"
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T1 — Promote migration 0012 and keep the prototype insert valid

## Place in the sequence

- **Blocked by:** — · **Blocks:** T7 — Write the recordings repo over the rebuilt table · **Wave:** 1.
- **Lane:** shares files with T9 — serialized.

## Why (user story)

> **As the** Owner
> **I want** the recordings I made with the prototype to stay, with their audio, settings and cost
> **So that** the rebuild loses nothing I already paid for
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task delivers: 0012 applies and reverts on a prototype-shaped DB keeping every row (amount → known, none → unavailable) and the full gate is green.

## Inlined context

> **ADR-0044 decision:** Migration `0012_rebuild_audio_generations` — create a new table with `provider`, `model_name`, nullable `voice`, `cost_status` (+ the 0002-style CHECK), `estimate_micros` and `duration_ms`, copy the rows across (`provider = 'openrouter'`, `cost_status = CASE WHEN cost_micros IS NULL THEN 'unavailable' ELSE 'known' END`), drop the old table and rename. `down` rebuilds the 0011 shape.
>
> — `adr/0044, Decision outcome + Option 1, abridged`

> **Hard rule (owner):** 0011 is treated as deployed: keep the existing `migrations/0011_*` files byte-for-byte unchanged; every schema change is a NEW migration 0012+ … must preserve/migrate the existing rows. Never run migrations, the server or scripts against `./data` directly.
>
> — `sad.md §2, Technical, abridged`

> **Audit:** promote as `migrations/0012_rebuild_audio_generations.{up,down}.sql` (next sequential). Verified on a copy: up → 19 rows all known, Σ cost_micros preserved; down → same.
>
> — `_audit/data-model-2026-10-25.md, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| `cost_status` | TEXT | NOT NULL, CHECK in (known, pending, unavailable), tied to cost_micros | added |
| `provider` | TEXT | NOT NULL 1–32 | added |
| `model_name` | TEXT | NULL, 1–200 | added |
| `voice` | TEXT | NULL, 1–100 | altered (was NOT NULL) |
| `estimate_micros` | INTEGER | NULL, ≥ 0 | added |
| `duration_ms` | INTEGER | NULL, ≥ 0 | added |
| `media_type` | TEXT | CHECK in (audio/mpeg, audio/wav) | altered |
| index `audio_generations_cost_pending` | partial on id WHERE pending | — | added |

Staged pair: `docs/features/text-to-speech/migrations/01_rebuild_audio_generations.up.sql` / `.down.sql` → promote to `migrations/0012_rebuild_audio_generations.*`.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-18 — happy path

> **Given** the Owner's machine holds recordings made with the prototype
> **When** the Owner opens the Speech page after the update
> **Then** each prototype recording is still listed and plays, with its text, model, voice and settings. Its recorded amount shows as its cost and is final (Ukiyo does not look it up again), and a recording that had no amount shows «cost unavailable» — never $0.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Copy the staged pair to `migrations/0012_rebuild_audio_generations.up.sql` / `.down.sql` (content unchanged)
- [ ] Prototype `src/server/modules/audio/repo.ts` insert: also write `provider = 'openrouter'` and `cost_status` (`known` when costMicros is not null, else `unavailable`) so the prototype keeps working until T9 replaces it
- [ ] Add `src/server/modules/audio/migration.int.test.ts`: migrate a temp DB to 0011 (migrations dir subset), insert prototype-shaped rows (one with cost_micros NULL), apply 0012 → assert statuses/amounts/voices/paths; migrateDown → assert 0011 columns and the same rows

## Edge cases

| Case | Behaviour |
|---|---|
| row with cost_micros NULL | becomes `unavailable`, amount stays NULL |
| row with an amount | becomes `known`, amount unchanged, cost_ref kept |
| down after a provider-default recording exists | voice becomes `'default'` |

## Definition of Done

- [ ] 0012 applies and reverts on a prototype-shaped DB keeping every row (amount → known, none → unavailable) and the full gate is green
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
