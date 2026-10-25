---
status: Accepted
owner: "dmytro.hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 19"
---

# 0048 — Add a recording detail route and let sections own their detail renderers

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Owner (via the orchestrator), agent

## Context

The router knows one detail kind: `/generations/:id` (`src/web/lib/router.tsx`), and `App.tsx` hard-wires `GenerationDetail` / `GenerationDialog` for it; a dialog visit is recognised by `state.dialog === "gallery"` (ADR-0033). A recording needs its own address that opens as a dialog over the audio grid or as a full page on a direct visit (spec AC-05, AC-06), and the two kinds must never resolve to each other (AC-06).

## Decision drivers

- Image deep links, Back/Forward and the dialog must behave exactly as before (spec AC-20).
- Audio addresses live under `/audio/` (ADR-0046).
- A new section should plug in without touching App again (ADR-0022).

## Considered options

1. **A second route kind `{ name: "recording", id }` for `/audio/recordings/:id`, and a `detail` slot on `Section`** (`route` kind, crumb `label`, `Page`, `Dialog`) that App renders for the section that already claims the route through the existing `owns`; the dialog state names its gallery (`"gallery"` | `"audio-gallery"`).
2. **A query parameter on the gallery page (`/audio/gallery?recording=<id>`)** — no router change, but a reload shows the grid behind instead of a page, unlike images, and the view parameters mix with the id.
3. **Generalise `detail` to `{ kind, id }` for both** — one shape, but every image test and caller that checks `route.name === "detail"` changes.

## Decision outcome

**Chosen:** Option 1. Image routes keep their exact shape (`name: "detail"`), so image tests keep their expectations, while App stops hard-coding one detail kind.

## Consequences

**Positive**
- Step 21 (Voices) can reuse the recording route as-is.
- The breadcrumb says «Recording» under «Gallery» of the Audio group.

**Negative**
- Two detail route kinds instead of one generic shape.
- Call sites to generalise: `App.tsx` (crumb «Generation», the `hidden` rule for detail routes, the detail/dialog rendering), `router.tsx` (`dialogState` typed on the image `GalleryView`, `isDialogVisit` checking `name === "detail"` and `dialog === "gallery"`), and Gallery's `owns`.

**Neutral**
- `/audio/recordings/:id` mirrors the server's resource path, which is fine because the SPA only falls back to `index.html` for non-`/api` paths.

## Links

- Spec: [[../spec.md]] AC-05, AC-06, AC-20
- SAD: [[../sad.md]] §5
- Related ADR: ADR-0022, ADR-0033, ADR-0046
