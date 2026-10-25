---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 20"
---

# 0055 — Read provider balances through the image adapters, one read per provider

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** dmytro.hopko (Owner/Architect), Claude (design pass, answers delegated by the Owner)

## Context

The navigation bar shows each configured provider's remaining credit on every page (spec AC-11…AC-15). Today only the speech adapter reads OpenRouter's credits (`GET /api/audio/credits`, step 18), used by the Speech page alone. Vercel AI Gateway publishes a credit read too (`GET /v1/credits` → `balance`, `total_used`, USD strings). CLAUDE.md: provider specifics live in adapters, never branched on in a feature module. The orchestrator asked for one source with no duplicate fetching; spec §6: a hung provider never delays the other's figure.

## Decision drivers

- One balance per provider, not per modality (one OpenRouter account backs images and speech).
- A slow or failing provider must not delay the other's figure (spec §6) — the design critic showed an aggregate read would hold OpenRouter back for up to 10 s whenever Vercel hangs.
- One cache entry per figure, shared by the sidebar and the Speech page.

## Considered options

1. **`ImageProvider.balance?()` on the OpenRouter and Vercel image adapters; `GET /api/providers/{id}/balance` per provider (10 s deadline; failure → `remainingUsd: null`); one browser query per provider (`["provider-balances", id]`); remove the speech adapter's `credits()` and `/api/audio/credits`.**
2. **One aggregate `GET /api/providers/balances`** reading all providers in parallel — one request, but the slowest provider gates every figure.
3. **Keep `/api/audio/credits` for the Speech page and add a separate balance read for the sidebar.**

## Decision outcome

**Chosen:** Option 1. Each figure arrives on its own; a failure is data (`null` → «—»), not an error; the route mirrors the existing per-provider models/price routes (unknown → not found, no key → not configured). Option 2 violates the independence driver; option 3 keeps two reads of the same OpenRouter figure, which can disagree on screen.

## Consequences

**Positive**
- Adding a provider = implementing `balance()`. The Speech page and sidebar share the OpenRouter cache entry.

**Negative**
- Breaking for the internal client: `/api/audio/credits` and `api.speechCredits` go away (no external consumers; tests updated). The Speech page's «not configured» now comes from the providers list instead of the credits error.
- Two requests per trigger when both providers are configured.

**Neutral**
- No server cache: each trigger reads the providers live (triggers are rare — a finished generation, a recording, every 5 min, focus); `refreshBalances` coalesces triggers that arrive during a read into one follow-up.

## Links

- Spec: [[../spec.md]] AC-11…AC-15, §6
- SAD: [[../sad.md]] §4 items 2–3, §6.1
- Related: [ADR-0039](../../text-to-speech/adr/0039-put-speech-behind-its-own-provider-port-with-an-openrouter-adapter.md) (speech port)
