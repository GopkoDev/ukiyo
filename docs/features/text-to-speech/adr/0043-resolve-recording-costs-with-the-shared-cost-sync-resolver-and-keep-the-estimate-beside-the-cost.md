---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 18"
---

# 0043 — Resolve recording costs with the shared cost-sync resolver and keep the estimate beside the cost

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** pipeline agent under the owner's run brief (dmytro.hopko)

## Context

A speech answer is raw bytes. It carries the `X-Generation-Id` header but no price. OpenRouter's `GET /generation?id=` reports `total_cost` some seconds later. Images already have a bounded, DB-driven resolver for exactly this shape (`generations/cost-sync.ts`, ADR-0013): 5 s backoff doubling to 60 s, 8 attempts, a 10-minute deadline and resume on boot. But it is wired to the generations repo and the image provider registry. The owner wants an up-front estimate from the catalog price and reconciliation later (spec AC-11…AC-13).

## Decision drivers

- Spec AC-13 and §6 «Cost lookups»: the same bounds as images, resumed after a restart, never `$0` for unknown.
- Reuse of a tested resolver rather than a copy.
- Spec §1 / CONTEXT: the estimate is kept, labelled, beside the cost (confirmed by the Owner 2026-10-25, spec §8 Q2).

## Considered options

1. **Generalise `createCostSync` to take `{ repo: { resolveCost, listPendingCosts }, lookupFor(provider) => ((costRef, signal) => Promise<CostLookup>) | undefined }` and build a second instance for recordings** over the audio repo and the speech registry. `undefined` keeps today's «no lookup → unavailable at once» branch. Recordings get `cost_status` (`pending` when a generation id came back, otherwise `unavailable`) plus a nullable `estimate_micros`.
2. **One shared resolver instance over both tables**, with a "kind" on each pending entry — one scheduler, but its repo interface fans out across two modules.
3. **Keep only the reconciled cost and compute the «≈» estimate on the fly for display** from the stored characters × the current catalog price — no column, but the label drifts when prices change, and per-second models can never show one.

## Decision outcome

**Chosen:** Option 1. The image wiring passes `lookupFor: (p) => providers.get(p)?.lookupCost`, so its behaviour is unchanged. `cost-sync.test.ts` changes only its constructor call; every assertion stays. Recordings reuse the exact schedule. The estimate is a separate column, and it is never shown without «≈».

## Consequences

**Positive**
- One tested schedule; `forget(id)` on delete works for recordings too (AC-16).

**Negative**
- Two resolver instances and two boot resumes; trivial cost.

**Neutral**
- Spec §8 Q2 was answered «yes» (Owner, 2026-10-25): `estimate_micros` stays.

## Links

- Spec: [[../spec.md]] AC-11, AC-12, AC-13, AC-16
- SAD: [[../sad.md]] §4
- Related ADR: ADR-0013, [[0039-put-speech-behind-its-own-provider-port-with-an-openrouter-adapter]], [[0044-rebuild-the-audio-table-in-a-new-migration-keeping-prototype-rows-as-known-cost]]
