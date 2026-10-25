---
id: T11
title: "Show speech prices, estimates and recording costs honestly"
layer: "ui"
deps: ["T2"]
blocks: ["T13"]
acs: ["AC-11", "AC-12", "AC-13"]
files_hint: ["src/web/lib/format.ts", "src/web/lib/format.test.ts", "src/web/features/audio/CostLabel.tsx", "src/web/features/audio/CostLabel.test.tsx", "src/web/features/audio/speechCost.ts", "src/web/features/audio/speechCost.test.ts"]
owner: "pipeline agent (implement)"
estimate: "S"
context_budget: "M"
status: "done"
step: "COMMIT"
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T11 — Show speech prices, estimates and recording costs honestly

## Place in the sequence

- **Blocked by:** T2 — Add the speech family spec map and the shared speech DTOs · **Blocks:** T13 — Rebuild the Speech page on the new contract · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** an estimate before I generate and an honest recorded cost afterwards
> **So that** I can control what I spend and compare models
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task delivers: unit + component tests prove every estimate wording, two significant digits, «< $0.0001», «Free», per-output and unknown wording, and the cost label for known/pending/unavailable with and without an estimate.

## Inlined context

> **SCR-02 estimate states:** «≈ $0.0012» · «≈ < $0.0001» · «Free» · «priced per second of audio» · «priced per token» · «price unknown» — never «$0»
>
> — `screens.md SCR-02, verbatim`

> **SCR-03 cost states:** cost known: «$0.041» (two significant digits; «< $0.0001» for tiny) · cost pending: «cost pending · ≈ $0.041» (estimate omitted when none) · cost unavailable: «cost unavailable · ≈ $0.041» muted
>
> — `screens.md SCR-03, abridged`

> **Reuse:** `src/web/lib/format.ts` (formatCost, formatCostBadge) — add `formatUsdSig(micros)` beside them; Badge-free muted text
>
> — `architecture-map.md §Frontend, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `SpeechPrice` and `Recording.costMicros/costStatus/estimateMicros` (shared schemas from T2).

## Acceptance criteria

### AC-11 — happy path

> **Given** the chosen model has a published price per character
> **When** the Owner types
> **Then** next to the generate action, the page shows an estimate labelled as an estimate («≈ $0.0012»), computed from the billed characters × the published price. Billed characters are the text's Unicode code points after removing spaces and line breaks at its start and end, which is the text as it is sent. Inline delivery tags are included. An emoji built from several code points counts as several, as the providers bill it. The counter, the refusal (AC-04), the estimate and the recorded count all use this one rule. Amounts show two significant digits («≈ $0.0012», «≈ $0.72»). A non-zero amount below $0.0001 shows as «< $0.0001», never as $0. The same rule applies to recorded costs. It updates as the text changes. A model priced at zero shows «Free».
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** the chosen model has no published price, or is priced by something other than characters (for example per second of audio, or per token)
> **When** the Owner types
> **Then** the page says how the model is priced («priced per second of audio», «priced per token»), or that its price is unknown, instead of a number — never «$0» and never «Free» for an unknown price. Unlike image models, speech models get no estimate from the Owner's past costs in this step, so such a recording has no estimate.
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — domain invariant

> **Given** a recording has just been saved
> **When** the Owner looks at its cost
> **Then** while Ukiyo is still waiting for the provider to report the actual charge, it reads «cost pending», with the estimate beside it when there is one. If the provider's answer already states the charge, the cost is known at once. Otherwise, once the provider reports the charge (within ten minutes), it changes to that amount without a reload. If the provider never reports it, it reads «cost unavailable», with the estimate still shown as an estimate. An unknown cost is never shown or counted as $0.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `formatUsdSig(micros)` in format.ts
- [ ] `speechCost.ts`: `estimateText(price, chars)`, `priceText(price)` (model list «$0.08 / 1K chars»)
- [ ] `CostLabel` component
- [ ] Tests

## Edge cases

| Case | Behaviour |
|---|---|
| estimate 0 for a free model | «Free» |
| estimate 30 micros | «≈ < $0.0001» |
| pending without estimate | «cost pending» |

## Definition of Done

- [ ] unit + component tests prove every estimate wording, two significant digits, «< $0.0001», «Free», per-output and unknown wording, and the cost label for known/pending/unavailable with and without an estimate
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
