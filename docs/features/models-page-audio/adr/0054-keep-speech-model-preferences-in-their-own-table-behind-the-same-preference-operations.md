---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 20"
---

# 0054 — Keep speech-model preferences in their own table behind the same preference operations

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** dmytro.hopko (Owner/Architect), Claude (design pass, answers delegated by the Owner)

## Context

Speech models get ★ and «hide from the picker» like image models (spec AC-02…AC-07). The existing `model_preferences` table (ADR-0026) is keyed by provider + model id, and its writes that turn a flag on are checked against the *image* catalog. OpenRouter ids share one namespace across modalities, so a model offered both as an image and a speech model (or a future one) would share a row: starring it for speech would star it in the image picker. Spec AC-05 requires the two sides kept apart, as recording tags are kept apart from image tags (ADR-0047).

## Decision drivers

- AC-05: no preference crosses between image and speech.
- Data safety: the Owner's dev server applies migrations to the live DB on sight — the change must be additive.
- One way to change a preference (ADR-0029 / ADR-0030) — the web mutation and the route stay one code path.

## Considered options

1. **A new `speech_model_preferences` table (same columns and checks, provider limited to `openrouter`); the models repo is parametrized by kind; the existing read/write take an optional `kind` (`image` default).**
2. **Add a `kind` column to `model_preferences` and widen its primary key** — needs a table rebuild (copy, drop, rename) on the live DB.
3. **Reuse `model_preferences` unchanged** — one row per id across modalities; accept the crossing.

## Decision outcome

**Chosen:** Option 1. Purely additive (the live DB only gains an empty table), keeps AC-05 structurally true, and the image contract is untouched because `kind` defaults to `image`. Option 2 rewrites the Owner's existing rows during a live migration for no extra benefit; option 3 violates AC-05.

## Consequences

**Positive**
- Image preferences, their rows and their tests are unchanged; rollback drops only the new table.

**Negative**
- Two near-identical tables; the repo selects the table by kind (two prepared statement sets).

**Neutral**
- A speech write turning a flag on is checked against the speech catalog (`models()`, cached 10 min); «off» writes skip it (ADR-0029 holds for both kinds).

## Links

- Spec: [[../spec.md]] AC-02…AC-07
- SAD: [[../sad.md]] §4 item 1
- Related: [ADR-0026](../../model-picker-preferences/adr/0026-keep-model-preferences-as-one-row-per-provider-and-model-in-a-models-module.md), [ADR-0029](../../models-page/adr/0029-turn-preference-flags-off-without-checking-the-provider-catalog.md), [ADR-0047](../../audio-gallery/adr/0047-store-recording-tags-and-comments-in-their-own-cascading-tables.md)
