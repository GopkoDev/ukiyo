---
id: T15
title: "Prove the audio NFRs and the image/audio separation"
layer: "tests"
deps: ["T9"]
blocks: []
acs: ["AC-14", "AC-19"]
files_hint: ["src/server/modules/audio/nfr.int.test.ts", "src/server/modules/audio/cross-context.int.test.ts"]
owner: "pipeline agent (implement)"
estimate: "S"
context_budget: "S"
status: "todo"
step: ""
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T15 — Prove the audio NFRs and the image/audio separation

## Place in the sequence

- **Blocked by:** T9 — Expose the audio contract, wire it in createApp and retire the prototype server code · **Blocks:** — · **Wave:** 5.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** an estimate before I generate and an honest recorded cost afterwards
> **So that** I can control what I spend and compare models
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task delivers: timing tests meet the §6 thresholds and cross-context tests prove recordings stay out of every image list and the key never appears in answers, rows or settings.

## Inlined context

> **Spec §6:** Speech catalog requests: ≤ 1 provider catalog request per 10 minutes while the page is used; the page shows the model list ≤ 300 ms p95 from a warm catalog · Recent recordings: the ten latest of 1 000 recordings ≤ 100 ms p95 server time · Saving after the audio arrives: file + record saved ≤ 500 ms p95 for a 10 MB audio file · Provider time limit: a request with no answer ends in a plain error after 180 s (same as images) · Cost lookups: per new recording ≤ 8 lookups, none later than 10 minutes after the answer; lookups resume after a restart
>
> — `spec.md §6, abridged`

> **Test plan load section:** 50 model-list requests over a warm catalog; 1 000 seeded recordings, 50 reads; 20 generations with a fake 10 MB answer; hanging provider with a short injected timeout and the 180 s default asserted
>
> — `test-plan.md §Load, abridged`

> **Placement:** `*nfr.int.test.ts` runs in the serial `nfr` project, last
>
> — `vitest.config.ts, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Exercises every audio operation; asserts 403 on each for a foreign origin.

## Acceptance criteria

### AC-14 — cross-context

> **Given** the Owner generated a recording
> **When** the generation finishes
> **Then** the OpenRouter credit balance shown on the Speech page refreshes. Recordings never appear in the image gallery or in the recent generations next to the Generate form, and they never change an image model's price estimate or cost history.
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — authorization

> **Given** Ukiyo is running
> **When** a page from another site in the Owner's browser asks Ukiyo to generate speech, list recordings or delete one
> **Then** Ukiyo refuses, as it does every other request from another site. The OpenRouter key never reaches the browser, the saved recording or the logs.
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `audio/nfr.int.test.ts` timing scenarios
- [ ] `audio/cross-context.int.test.ts`: generations list, recent generations, cost history unaffected by recordings; key absent from bodies/rows/settings; 403 per route

## Edge cases

| Case | Behaviour |
|---|---|
| cold catalog | first request fetches once; the next 49 hit the cache |

## Definition of Done

- [ ] timing tests meet the §6 thresholds and cross-context tests prove recordings stay out of every image list and the key never appears in answers, rows or settings
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
