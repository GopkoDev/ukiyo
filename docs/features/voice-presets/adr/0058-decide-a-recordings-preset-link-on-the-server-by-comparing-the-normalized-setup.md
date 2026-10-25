---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 21"
---

# 0058 — Decide a recording's preset link on the server by comparing the normalized setup

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** dmytro.hopko (Owner/Architect), Claude (design pass, answers delegated by the Owner)

## Context

A link must mean «made exactly with this preset» (spec AC-05, the CONTEXT invariant). The Speech page knows whether the applied preset is unchanged, but a page can be wrong (a stale preset list, a rename or update elsewhere) or forged (§6.1 abuse case). A speech request is paid, so a link problem must never cost the recording (AC-18). Settings are normalized per model (`settingsFor`, ADR-0040): defaults filled, values clamped, instructions trimmed, unaccepted keys dropped.

## Decision drivers

- Truthful links; one definition of «equal» for the page («modified») and the server.
- Never refuse or lose a paid recording because of a preset.
- A preset deleted while the provider answers must not leave a dangling link.

## Considered options

1. **The request carries an optional `presetId`; the server compares the preset with what it is about to send using a shared pure `presetMatches(preset, setup, model)` (model, voice with `null` = provider default, `settingsFor(controls, sent)` deep-equal to the stored settings); a match becomes a link inserted inside the save transaction only if the preset still exists; anything else saves unlinked.**
2. **A preset revision: the page sends `presetId` + the preset's `updatedAt` it applied; the server links when the revision is still current.**
3. **A stored fingerprint: the preset keeps a hash of its normalized setup; the server hashes the sent setup and compares.**

## Decision outcome

**Chosen:** Option 1. The comparison happens at receipt (AC-18: the setup «at the moment Ukiyo received the request») on stored, already-normalized settings, so a preset holding a setting the model no longer accepts counts as different (AC-10). Option 2 proves only that the page saw the latest preset, not that it sent the preset's values (an edited control after apply would still link). Option 3 compares the same thing as Option 1 but adds a stored derived column to keep in sync and hides why two setups differ; the direct comparison is cheap at this size.

## Consequences

**Positive**
- The same function drives «modified» in the browser and the link on the server — they can't disagree on equal inputs.
- No extra provider call; one primary-key read before the provider call, one guarded insert in the existing transaction.

**Negative**
- A page that thinks it is unchanged but isn't gets an unlinked recording silently; the recording's detail (no preset named) shows it.

**Neutral**
- `presetId` is optional; old clients and every other caller are unaffected.

## Links

- Spec: [[../spec.md]] AC-04, AC-05, AC-10, AC-18; §6.1
- SAD: [[../sad.md]] §4 item 2, §6.1
- Related: ADR-0040, ADR-0042
