---
id: T9
title: "Coordinate playback app-wide so one recording plays at a time"
layer: "ui"
deps: ["T8"]
blocks: ["T11"]
acs: ["AC-02"]
files_hint: ["src/web/lib/playback.ts", "src/web/lib/playback.test.ts", "src/web/App.tsx", "src/web/features/audio/SpeechPage.tsx", "src/web/features/audio/SpeechResult.tsx"]
owner: "agent (sdd:implement)"
estimate: "S"
context_budget: "S"
status: "done"
step: "COMMIT"
---

# T9 — Coordinate playback app-wide so one recording plays at a time

## Place in the sequence

- **Blocked by:** T8 — Add the recording detail route and let sections own their detail renderers · **Blocks:** T11 — Build the Audio → Gallery section: grid, recording card, model choice and states · **Wave:** 2.
- **Lane:** serialized with tasks sharing `src/web/App.tsx`, `src/web/features/audio/SpeechPage.tsx`.

## Why (user story)

> **As the** Owner
> **I want** a gallery of all my recordings, newest first, where I can play each one in place
> **So that** I can find and listen to anything I made, not only the latest ten
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: coordinate playback app-wide so one recording plays at a time.

## Inlined context

> One document-level coordinator: a capture-phase `play` listener pauses every other `audio` element; a route-change hook pauses everything playing; Speech autoplays only while it is the current section. Lives in `src/web/lib/playback.ts`, installed once by the app frame (not in a gallery layer: the Speech page uses it too).
>
> — `adr/0050, Option 1 (chosen), verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-02 — domain invariant

> **Given** one card's player is playing
> **When** the Owner starts another card's player (in the grid, the dialog or the Speech page)
> **Then** the first one pauses where it was (playing it again resumes there), so at most one recording plays at a time in the Ukiyo tab. Opening a recording's dialog pauses a playing card; closing the dialog stops the dialog's player. Moving to another section pauses what was playing on the section left behind. A recording that finishes generating while the Owner is outside the Speech page does not start playing by itself. A player loads its audio only when the Owner starts it, not when the card appears, and a card's cost refreshing never restarts or interrupts its player.
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `installPlayback(doc)` returns uninstall; capture `play` → pause others; `pauseAll()`
- [ ] App installs it once and calls `pauseAll()` on every route change
- [ ] SpeechPage passes `autoPlay` only when its section is current (route check)
- [ ] Unit test with simulated media elements; component test for Speech autoplay while hidden

## Edge cases

| Case | Behaviour |
|---|---|
| two players started quickly | the later one keeps playing |
| dialog closes | its player unmounts (stops) |

## Definition of Done

- [ ] playback unit tests + Speech component tests pass
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
