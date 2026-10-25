---
id: T6
title: "Generalise cost sync over an injected repo and lookup"
layer: "app"
deps: []
blocks: ["T8"]
acs: ["AC-13"]
files_hint: ["src/server/modules/generations/cost-sync.ts", "src/server/modules/generations/cost-sync.test.ts", "src/server/app.ts"]
owner: "pipeline agent (implement)"
estimate: "S"
context_budget: "S"
status: "done"
step: "COMMIT"
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T6 — Generalise cost sync over an injected repo and lookup

## Place in the sequence

- **Blocked by:** — · **Blocks:** T8 — Build the audio service: validate, speak, save atomically, track cost, delete · **Wave:** 1.
- **Lane:** shares files with T9 — serialized.

## Why (user story)

> **As the** Owner
> **I want** an estimate before I generate and an honest recorded cost afterwards
> **So that** I can control what I spend and compare models
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task delivers: createCostSync takes {repo, lookupFor}; image wiring passes lookupFor from the provider registry; every existing cost-sync and image cost test passes with only constructor calls edited.

## Inlined context

> **ADR-0043 decision:** Generalise `createCostSync` to take `{ repo: { resolveCost, listPendingCosts }, lookupFor(provider) => ((costRef, signal) => Promise<CostLookup>) | undefined }` … `undefined` keeps today's «no lookup → unavailable at once» branch. The image wiring passes `lookupFor: (p) => providers.get(p)?.lookupCost`, so its behaviour is unchanged. `cost-sync.test.ts` changes only its constructor call; every assertion stays.
>
> — `adr/0043, Option 1 + Decision outcome, abridged`

> **Schedule (unchanged):** 5 s, doubling, capped at 60 s, 8 attempts, 10-minute deadline; resume on boot; forget(id) on delete.
>
> — `src/server/modules/generations/cost-sync.ts, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-13 — domain invariant

> **Given** a recording has just been saved
> **When** the Owner looks at its cost
> **Then** while Ukiyo is still waiting for the provider to report the actual charge, it reads «cost pending», with the estimate beside it when there is one. If the provider's answer already states the charge, the cost is known at once. Otherwise, once the provider reports the charge (within ten minutes), it changes to that amount without a reload. If the provider never reports it, it reads «cost unavailable», with the estimate still shown as an estimate. An unknown cost is never shown or counted as $0.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Replace `providers: ProviderRegistry` with `lookupFor` in `CostSyncDeps`; keep `PendingCost` shape
- [ ] Update `src/server/app.ts` image wiring and `cost-sync.test.ts` constructor calls
- [ ] Add one test: a second instance over a fake repo resolves independently

## Edge cases

| Case | Behaviour |
|---|---|
| provider with no lookup | settles unavailable at once (unchanged) |
| lookup throws | retried within the limits (unchanged) |

## Definition of Done

- [ ] createCostSync takes {repo, lookupFor}; image wiring passes lookupFor from the provider registry; every existing cost-sync and image cost test passes with only constructor calls edited
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
