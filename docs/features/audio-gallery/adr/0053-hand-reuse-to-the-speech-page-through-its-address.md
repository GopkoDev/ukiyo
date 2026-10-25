---
status: Accepted
owner: "dmytro.hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 19"
---

# 0053 — Hand Reuse to the Speech page through its address

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Owner (via the orchestrator), agent

## Context

Reuse starts in the gallery but its effect lives in the Speech page's local draft (`useSpeechDraft`), which mounts only after its first visit (ADR-0045). It must wait for the model list, never interrupt a request in flight, ask before replacing unsent text, and leave Back pointing at the grid (spec AC-16, AC-17). Images solved the same shape with `/?rerun=<id>` applied on arrival (ADR-0019, ADR-0023).

## Decision drivers

- Spec AC-16, AC-17; the image precedent.
- The Speech page owns the draft, the in-flight flag and the replace question.

## Considered options

1. **`/audio/speech?reuse=<id>`**: the gallery navigates there (replace from a dialog or the recording page, so Back returns to the gallery as spec AC-16 asks; push from a card); the Speech page reads the flag on each arrival, loads the recording, waits for its model list, then applies through its existing reuse path (`ReplaceTextDialog`, retired-model notice), and drops the flag from the address.
2. **A module-level store the gallery writes and the Speech page reads** — no address trace, but a reload loses it and it differs from the image pattern.
3. **Lift the Speech draft into a global store** — the gallery could apply directly, but it moves step-18 state and duplicates the in-flight rule.

## Decision outcome

**Chosen:** Option 1. Same mechanism as re-run for images; Speech keeps sole ownership of its draft.

## Consequences

**Positive**
- A Reuse address can be opened from anywhere, including step 21's Voices list.

**Negative**
- The Speech page reads one recording per Reuse (≤ 1 request, usually cached).

**Neutral**
- A reuse of a deleted recording says it no longer exists and changes nothing.

## Links

- Spec: [[../spec.md]] AC-16, AC-17
- SAD: [[../sad.md]] §4 pillar 3
- Related ADR: ADR-0019, ADR-0023, ADR-0045
