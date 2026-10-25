---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 21"
---

# 0060 — Redirect only declared section aliases so sections can own sub-paths

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** dmytro.hopko (Owner/Architect), Claude (design pass, answers delegated by the Owner)

## Context

Each preset has its own address `/audio/voices/<id>` that a reload or a copied link opens (spec AC-13), shown in the Voices section (current entry, AC-11). A section can claim extra addresses through `owns` (ADR-0048), but `App` treats any page address whose pathname differs from the matched section's path as a former address and replaces it with the section's path (ADR-0046) — it would bounce `/audio/voices/<id>` to `/audio/voices`.

## Decision drivers

- Keep the `/speech` → `/audio/speech` redirect.
- Let `owns` claim sub-paths without special cases.

## Considered options

1. **Redirect only when the pathname, one trailing slash trimmed, is one of the matched section's declared `aliases`.**
2. **A new route kind `voice` parsed by the router, like `detail` / `recording`.**
3. **Keep the preset id in the query (`/audio/voices?preset=<id>`).**

## Decision outcome

**Chosen:** Option 1. The alias rule then says exactly what ADR-0046 meant (former addresses), and the Voices section owns `/audio/voices/<id>` with a one-line `owns`. Option 2 drags a page into the detail-route machinery (page vs dialog) it doesn't need. Option 3 departs from the owner's requested address `/audio/voices/<id>`.

## Consequences

**Positive**
- Any future section can own sub-paths.

**Negative**
- The rule must trim the trailing slash itself, or `/speech/` (redirected today through `matchPath`'s trim) would stop redirecting; a `/speech/` test is added next to the existing `/speech` one.

**Neutral**
- `/models?tab=audio` (ADR-0056) is unaffected: its path part equals the pathname.

## Links

- Spec: [[../spec.md]] AC-11, AC-13
- SAD: [[../sad.md]] §4 item 7
- Related: ADR-0022, ADR-0046, ADR-0048, ADR-0056
