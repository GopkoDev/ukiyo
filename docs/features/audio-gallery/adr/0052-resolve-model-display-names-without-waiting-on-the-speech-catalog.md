---
status: Accepted
owner: "dmytro.hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 19"
---

# 0052 — Resolve model display names without waiting on the speech catalog

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Owner (via the orchestrator), agent

## Context

New recordings store `model_name`; prototype rows have it NULL, and step 18 falls back per row to the live catalog (`service.namesById()`, which awaits `catalog.models()` and may fetch). The gallery must show one name per model id everywhere (spec AC-14) and keep its targets with the catalog unreachable or hanging (spec §6 Catalog independence).

## Decision drivers

- One display name per model: stored name of its newest recording that has one, else the catalog's, else the id (spec AC-14).
- No provider call on a gallery read's critical path (spec §6).
- Never rebuild or reshape `audio_generations` (step-18 handoff).

## Considered options

1. **Read-time resolution, no data change**: stored names first (one query per page: newest non-NULL name per model), then `catalog.peek()` — the last successful catalog read, kept past its TTL and never fetching — then the id. The service warms the catalog in the background at boot.
2. **The same, plus a backfill of prototype rows' `model_name` whenever the catalog loads** — names become permanent after the first read, but it rewrites shipped rows, against spec §6 «Migration safety» («without changing … any recording»).
3. **Keep awaiting the catalog per listing** (step 18) — breaks the hanging-catalog target and flips names to ids when it fails.

## Decision outcome

**Chosen:** Option 1. Gallery reads are pure SQL plus an in-memory lookup, and no stored recording changes.

## Consequences

**Positive**
- Stable headings and filter labels once the catalog has been read once in a process's life; no provider call on a read.

**Negative**
- Right after a start, before the background read finishes (or if it fails), a model known only from prototype rows shows its id (SAD §11).

**Neutral**
- Option 2 stays available later as a deliberate, owner-approved data change.

## Links

- Spec: [[../spec.md]] AC-14, §6
- SAD: [[../sad.md]] §4 pillar 4
- Related ADR: ADR-0044
