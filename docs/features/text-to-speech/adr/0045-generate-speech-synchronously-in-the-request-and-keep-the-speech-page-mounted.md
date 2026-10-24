---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 18"
---

# 0045 — Generate speech synchronously in the request and keep the Speech page mounted

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** pipeline agent under the owner's run brief (dmytro.hopko)

## Context

Images run as a single-slot server job polled by the UI (ADR-0005), because image generation can take minutes and the Generate page must survive navigation. Speech usually answers in a few seconds (the prototype made 19 recordings synchronously). Spec AC-02/AC-17 need an in-flight request and its outcome to survive moving between sections, and need one Owner action to send at most one paid request; a second tab and a reload are explicitly not guarded.

## Decision drivers

- Spec AC-02, AC-17; §6 time limit 180 s.
- Simplicity: no second job slot, no polling for audio.

## Considered options

1. **A synchronous request (the server answers with the saved recording) plus `keepMounted: true` for the Speech section**, so the mutation state survives navigation inside the app. The server finishes and saves even if the client goes away.
2. **A server job slot polled like images** — survives reloads and blocks a second tab, but adds a job store, polling and a status endpoint for a seconds-long call.
3. **A streamed response (server-sent progress, then the recording)** — live progress, but the providers give no progress to stream, and it adds a streaming client for no visible gain.

## Decision outcome

**Chosen:** Option 1. It meets AC-02/AC-17 as written, with the least machinery; ADR-0023's keep-mounted mechanism already exists.

## Consequences

**Positive**
- No new job state; the prototype's request shape mostly carries over.

**Negative**
- A reload during a request loses the in-page progress (the recording still lands in the recent list); a second tab can send in parallel (accepted debt).

**Neutral**
- If long texts make speech slow, moving to a job slot later changes only the start route and the page's mutation.

## Links

- Spec: [[../spec.md]] AC-02, AC-17
- SAD: [[../sad.md]] §4
- Related ADR: ADR-0005, ADR-0023
