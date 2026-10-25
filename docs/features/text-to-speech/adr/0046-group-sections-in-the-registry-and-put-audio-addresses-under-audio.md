---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 18"
---

# 0046 — Group sections in the registry and put audio addresses under /audio

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** pipeline agent under the owner's run brief (dmytro.hopko)

## Context

The sidebar renders one flat «Sections» group from the `SECTIONS` registry (ADR-0022). The owner wants an «Image» group (Generate, Gallery, Models) followed by an «Audio» group (Speech now; the audio gallery and Voices in steps 19 and 21). Audio pages go under `/audio/...`, image addresses keep working, and the prototype's `/speech` address must still open the Speech page.

## Decision drivers

- Spec AC-01; steps 19–21 add audio sections without a redesign.
- ADR-0022: one registry drives the sidebar, page, breadcrumb, title and not-found.

## Considered options

1. **Add `group: "image" | "audio"` and optional `aliases: string[]` to `Section`** — the sidebar renders one `SidebarGroup` per group in a fixed `SECTION_GROUPS` order, and `App` replaces an alias address with the section's path (no history entry). Speech moves to `/audio/speech`, with alias `/speech`.
2. **Two registries (image, audio)** — explicit, but splits `sectionFor`, the breadcrumb and not-found handling.
3. **Group only in the sidebar (a per-section `group` label), keeping `/speech` as the address** — the least change, but audio pages from steps 19–21 would scatter across top-level addresses with no shared prefix.

## Decision outcome

**Chosen:** Option 1. It is the smallest change that keeps one registry. Steps 19–21 add `{ group: "audio", path: "/audio/gallery" }` and similar entries.

## Consequences

**Positive**
- Image addresses and their tests are unchanged; the old `/speech` keeps working and the address bar shows `/audio/speech`.

**Negative**
- The breadcrumb shows only the section label (the group is visible in the sidebar), as today.

**Neutral**
- A future third group (e.g. Video) is one more `SECTION_GROUPS` entry.

## Links

- Spec: [[../spec.md]] AC-01
- SAD: [[../sad.md]] §4
- Related ADR: ADR-0022, ADR-0023
