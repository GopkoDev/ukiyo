---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 20"
---

# 0056 — Let one page serve two sections by a query parameter

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** dmytro.hopko (Owner/Architect), Claude (design pass, answers delegated by the Owner)

## Context

The Models page has two views, Image and Audio, kept in the address (`?tab=audio`, spec AC-09), and each navigation group gets its own «Models» entry that must be the one marked current. The section registry (ADR-0022) matches sections by pathname only, and ADR-0046's alias rule replaces the address when the matched section's path differs from the pathname.

## Decision drivers

- Exactly one navigation entry current; links and reloads open the same view.
- No second page component and no remount when switching views.
- Keep the registry one-entry-per-section.

## Considered options

1. **Two sections sharing the page component: `models` (path `/models`, unchanged) and `audio-models` (path `/models?tab=audio`, group audio, `accessibleName: "Audio models"`, `owns: route.name === "page" && trimSlash(route.pathname) === "/models" && new URLSearchParams(route.search).get("tab") === "audio"`); the alias rule compares `section.path` up to its `?` with the pathname.**
2. **Separate paths** (`/models` and `/audio/models`) with a shared page — the tabs become two addresses, and the «Image | Audio» switch is navigation between sections.
3. **One section, and the sidebar special-cases the Models entry by tab.**

## Decision outcome

**Chosen:** Option 1. It keeps the owner's requested address (`?tab=audio`), uses the existing `owns` hook (ADR-0048) for the match, and React keeps the same page instance when only the tab changes (same component at the same place). Option 2 departs from the requested address; option 3 puts routing logic in the sidebar.

## Consequences

**Positive**
- Sidebar, breadcrumb and document title follow the tab without special cases («Models» in both; only the audio entry gets an accessible name, «Audio models», like «Audio gallery» — the Image entry, its title and its tests are unchanged).

**Negative**
- A section's `path` may now carry a query; `matchPath` and the alias rule must use its path part.

**Neutral**
- An unknown `tab` value is the Image view (`models` section).

## Links

- Spec: [[../spec.md]] AC-09, AC-10
- SAD: [[../sad.md]] §4 item 4
- Related: ADR-0022, ADR-0046, ADR-0048
