---
id: T1
title: "Promote the voice-presets migration and test it"
layer: "migration"
deps: []
blocks: ["T3"]
acs: ["AC-08"]
files_hint: ["docs/features/voice-presets/migrations/", "migrations/", "src/server/db/migrate.int.test.ts", "src/server/modules/audio/presets-migration.int.test.ts"]
owner: "dmytro.hopko"
estimate: "S"
context_budget: "M"
status: "todo"
step: ""
---

# T1 — Promote the voice-presets migration and test it

## Place in the sequence

- **Blocked by:** nothing · **Blocks:** T3.
- **Lane:** serialized (migration).

## Why (user story)

> ### US-04: Know which recordings a preset made
> 
> **As the** Owner
> **I want** every recording made with an applied, unchanged preset to be linked to it
> **So that** I can tell later which speaker made which recording
>
> — `spec.md §4, US-04, verbatim`

## Inlined context

> ADR-0057: links in `voice_preset_recordings` (PK audio_generation_id → audio_generations ON DELETE CASCADE, preset_id → voice_presets ON DELETE CASCADE), index (preset_id, audio_generation_id); additive only, `audio_generations` untouched.
>
> — `sad.md §4/§6 + adr/, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read [spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/). Do not guess.

## Data delta

`voice_presets` + `voice_preset_recordings` + `voice_preset_recordings_by_preset` (staged `migrations/01_create_voice_presets.{up,down}.sql`). — `data-model.md, abridged`

## API contract

Internal — no API surface. — `contracts/openapi.yaml, abridged`

## Acceptance criteria

### AC-08 (US-03) — domain invariant

**Given** a preset with recordings is deleted
**When** the Owner looks at those recordings anywhere (audio gallery, recent recordings, a recording's dialog or page)
**Then** each recording still plays and still shows its own text, model, voice, settings and cost; nothing about it changed except that no preset is named
— `spec.md §5, AC-08, verbatim`

## Definition of Done

0016 up/down promoted unchanged from staging; migrate.int.test.ts lists 0016; test: over 0015 with recordings + tags + comments, 0016 applies with rows unchanged and unlinked, the link cascades both ways, rollback drops only the new tables; gate green
