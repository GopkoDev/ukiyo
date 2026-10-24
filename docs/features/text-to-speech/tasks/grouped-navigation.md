---
id: T10
title: "Group the navigation into Image and Audio and move Speech under /audio"
layer: "ui"
deps: []
blocks: ["T13"]
acs: ["AC-01", "AC-02"]
files_hint: ["src/web/sections.tsx", "src/web/sections.test.tsx", "src/web/components/app-sidebar.tsx", "src/web/App.tsx", "src/web/lib/router.test.tsx"]
owner: "pipeline agent (implement)"
estimate: "S"
context_budget: "S"
status: "todo"
step: ""
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T10 — Group the navigation into Image and Audio and move Speech under /audio

## Place in the sequence

- **Blocked by:** — · **Blocks:** T13 — Rebuild the Speech page on the new contract · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** the navigation split into an Image group and an Audio group
> **So that** I can find image and speech tools apart, and new audio pages have a place to go
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: component tests prove two groups in order with entries, the current entry marked, the /speech alias replaced by /audio/speech, image addresses unchanged and Speech kept mounted.

## Inlined context

> **ADR-0046 decision:** Add `group: "image" | "audio"` and optional `aliases: string[]` to `Section` — the sidebar renders one `SidebarGroup` per group in a fixed `SECTION_GROUPS` order, and `App` replaces an alias address with the section's path (no history entry). Speech moves to `/audio/speech`, with alias `/speech`.
>
> — `adr/0046, Option 1, verbatim`

> **ADR-0045:** `keepMounted: true` for the Speech section, so the mutation state survives navigation inside the app
>
> — `adr/0045, Option 1, abridged`

> **SCR-01:** default: two `SidebarGroup`s labelled «Image» and «Audio», in that order, entries in registry order · current: marked in its group (`isActive`, `aria-current`) · collapsed: icon rail, group labels hidden, tooltips · alias: the former Speech address replaces itself with the Audio address
>
> — `screens.md SCR-01, abridged`

> **Reuse:** Sidebar, SidebarGroup, SidebarGroupLabel, AppSidebar, Tooltip; router `replace`
>
> — `design-system.md inventory, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 — happy path

> **Given** Ukiyo is open
> **When** the Owner looks at the navigation bar
> **Then** it shows an «Image» group first, with Generate, Gallery and Models in today's order, and an «Audio» group second, with Speech. Each entry opens its page. The current page is marked in its group. Every image page address works as before, and the Speech page's former address still opens the Speech page.
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — cross-context

> **Given** the Owner has an unsent prompt on the Generate page, or text and settings on the Speech page
> **When** the Owner moves to another section and comes back
> **Then** the prompt, or the text and settings, are still there (app-shell keeps the Generate page as it is). A recording that is still being generated keeps showing as in progress, with the generate action unavailable. One that finished while the Owner was away shows as the latest result and first in the recent recordings. One that failed shows its error.
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `sections.tsx`: `group` + `aliases` on Section, `SECTION_GROUPS = [{id:'image',label:'Image'},{id:'audio',label:'Audio'}]`; Speech `{path:'/audio/speech', aliases:['/speech'], group:'audio', keepMounted:true}`; `sectionFor` matches aliases
- [ ] `app-sidebar.tsx`: one SidebarGroup per group with its label, nav aria-label per group
- [ ] `App.tsx`: on an alias address `replace(section.path)`
- [ ] Tests in `sections.test.tsx` / app-sidebar test

## Edge cases

| Case | Behaviour |
|---|---|
| `/speech/` trailing slash | alias still matches |
| unknown address | Page not found, as before |
| collapsed rail | group labels hidden, tooltips |

## Definition of Done

- [ ] component tests prove two groups in order with entries, the current entry marked, the /speech alias replaced by /audio/speech, image addresses unchanged and Speech kept mounted
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
