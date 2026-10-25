---
id: T14
title: "Hand Reuse from the gallery to the Speech page"
layer: "ui"
deps: ["T10", "T13"]
blocks: ["T15"]
acs: ["AC-16", "AC-17"]
files_hint: ["src/web/features/audio/SpeechPage.tsx", "src/web/features/audio/useSpeechDraft.ts", "src/web/features/audio/gallery/reuse.ts", "src/web/features/audio/SpeechPage.test.tsx"]
owner: "agent (sdd:implement)"
estimate: "M"
context_budget: "S"
status: "todo"
step: ""
---

# T14 — Hand Reuse from the gallery to the Speech page

## Place in the sequence

- **Blocked by:** T10 — Add the audio gallery's API client, view parsing, query keys and cache patching, T13 — Build the recording dialog and page with notes, details and delete · **Blocks:** T15 — Prove cross-section coherence and the request budgets · **Wave:** 7.
- **Lane:** serialized with tasks sharing `src/web/features/audio/SpeechPage.tsx`.

## Why (user story)

> **As the** Owner
> **I want** to reuse a recording's text, model, voice and settings on the Speech page
> **So that** I can make a variation without retyping anything
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task delivers: hand Reuse from the gallery to the Speech page.

## Inlined context

> `/audio/speech?reuse=<id>`: the gallery navigates there (replace from a dialog or the recording page, so Back returns to the gallery as spec AC-16 asks; push from a card); the Speech page reads the flag on each arrival, loads the recording, waits for its model list, then applies through its existing reuse path (`ReplaceTextDialog`, retired-model notice), and drops the flag from the address.
>
> — `adr/0053, Option 1 (chosen), verbatim`

> SCR-08 states: loading «Loading the recording…» · replace? · retired model notice · models failed (reuse waits) · in flight «Wait for the current recording to finish, then reuse.» · gone «This recording no longer exists.»
>
> — `screens.md, SCR-08, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `getRecording` and the step-18 speech models.

## Acceptance criteria

### AC-16 — happy path

> **Given** a recording is shown as a card, in its dialog or on its page
> **When** the Owner chooses Reuse
> **Then** the Owner lands on the Speech page with its text, model, voice and settings in the form, and this recording as the latest result. Back from there returns to the gallery, not to a closed dialog. Reuse never generates anything by itself.
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — cross-context

> **Given** the Speech form holds unsent text that differs from the recording's, or the recording's model is no longer offered
> **When** the Owner chooses Reuse
> **Then** with unsent text, the Speech page asks before replacing it, and «Keep mine» leaves the form and the latest result as they were. With a retired model, the page says the model is no longer offered and keeps the current model. It still fills in the text, the voice and the settings that model accepts, as Reuse from the recent recordings does. «No longer offered» is said only when the Speech page's model list has loaded and lacks the model. Reuse is applied once that list is known; if it can't be loaded, the page says so with a retry, and the form is not changed. While a recording is being generated, Reuse is not applied: the page says to wait for the current request, and the form and the request stay as they are.
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `reuse.ts`: `reuseRecording(id, from: "card"|"dialog"|"page")` → navigate/replace
- [ ] SpeechPage: on arrival with `?reuse=` → fetch recording; wait for models; if generating → message, no change; else existing reuse path (asks on differing unsent text); result shown without autoplay; replace address without the flag
- [ ] `useSpeechDraft.reuse`: «no longer offered» only when `models` is loaded
- [ ] Component tests for every SCR-08 state + Back behaviour

## Edge cases

| Case | Behaviour |
|---|---|
| models never load | form unchanged, retry offered; reuse applies after retry succeeds |
| recording deleted | message, form unchanged |

## Definition of Done

- [ ] SpeechPage tests (old + new) pass
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
