---
status: Living
tool: code               # figma | pencil | code — the single committed source of the design-tool choice (never sdd.local.md: that file is per-developer + gitignored)
figma_file: ""           # tool: figma → the Figma file URL/key the canon lives in; else ""
pen_file: ""             # tool: pencil → the .pen library path (e.g. docs/design/library.pen); else ""
updated_at: "2026-10-25"
---

# Design system — Ukiyo

> The project's **design canon**, produced once per repo by `design-system` and read by
> `ux-flows` / `screens` / `implement` / `review`. Committed — the tool choice and the inventory
> are team-wide, not per-developer. `architecture-map.md` §Frontend / UI foundation stays the
> inventory of the **code**; this file is the **design-side** canon (tool, posture, tokens,
> component inventory, cross-screen conventions). Refresh via `/sdd:design-system` when the
> foundation changes.

## Platform posture

- **Posture:** desktop-first — a local tool used in a desktop browser on the owner's machine; it stays usable down to tablet width, phone layout is not a goal.
- **Breakpoints / device classes:** Tailwind defaults; layouts are designed at `lg` (≥1024px) and degrade to a single column below `md` (768px).

## Design tool

- **Tool:** code — solo maintainer, no design-tool MCP in use; `screens.md` carries inline markdown wireframes.
- **Library location:** the in-repo components are the library — `src/web/components/ui/`.

## Token source

- **Colors:** shadcn/ui theme CSS variables (light + dark, neutral base) incl. the `--sidebar-*` set — `src/web/index.css:6`
- **Theme:** light / dark / system (default system) via `ThemeProvider` (`src/web/components/theme-provider.tsx`): the `.dark` class on `<html>`, choice kept in `localStorage` (`gen-img:theme`, wrapped in try/catch); an inline script in `index.html` applies it before first paint
- **Spacing / sizing:** Tailwind v4 default scale + `--radius` — `src/web/index.css:7`
- **Typography:** Tailwind v4 defaults (system font stack) — `src/web/index.css:1`

## Component inventory

| Component | Source (`file:line` / node / URL) | States it supports | Notes |
|---|---|---|---|
| Badge | `src/web/components/ui/badge.tsx:39` | default / secondary / destructive / outline | status chips (cost status, server health) |
| Button | `src/web/components/ui/button.tsx:61` | default / hover / disabled; variants default · secondary · outline · ghost · destructive · link | loading = disabled + spinner icon |
| Card | `src/web/components/ui/card.tsx:55` | default | gallery tiles, panels |
| Dialog | `src/web/components/ui/dialog.tsx:124` | open / closed | overlays |
| Input | `src/web/components/ui/input.tsx:20` | default / focus / disabled / invalid (`aria-invalid`) | |
| Select | `src/web/components/ui/select.tsx:150` | closed / open / disabled / invalid | short fixed option lists |
| Popover | `src/web/components/ui/popover.tsx` | closed / open | the model picker's list (`PopoverTrigger` + `PopoverContent`) |
| ModelPicker | `src/web/features/generate/ModelPicker.tsx` | closed / loading list / grouped (Favorites · All models) / plain / price «…» · `$X / image` · range · «priced per token» · «price unknown» (· «couldn't load») / ★ pressed · saving failed · preferences unreadable (★ disabled) / hidden-but-selected | rows = «choose» button (name, id, short price) + sibling ★ toggle; ↑/↓ between rows, Esc closes |
| Table | `src/web/components/ui/table.tsx` | default / row hover | the Models page's comparison tables (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`) |
| Switch | `src/web/components/ui/switch.tsx` | on / off / disabled / focus | an on/off setting that acts at once («Show in picker») |
| ModelsPage | `src/web/features/models/ModelsPage.tsx` | loading / default / price «…» and price states / hidden row / save failed (per row) / list error + Try again / not configured / none configured / preferences unreadable (toggles disabled) / no longer offered + Forget (failed) | SCR-08, the `/models` section: a Card + Table per provider |
| Textarea | `src/web/components/ui/textarea.tsx:17` | default / focus / disabled / invalid (`aria-invalid`) | prompt entry |
| Sidebar (block `sidebar-08`, inset variant) | `src/web/components/ui/sidebar.tsx` | expanded / collapsed (icon rail, `Ctrl/⌘+B` or the trigger) / mobile sheet (below `md`) | the app frame's primitives: `SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarTrigger`, `SidebarMenu*` |
| AppSidebar | `src/web/components/app-sidebar.tsx` | default / current entry (`isActive` + `aria-current`) / section indicator (generation running, failed) / collapsed (tooltips) | brand + one labelled group per section group («Image», then «Audio», ADR-0046) inside one «Sections» nav + footer (provider balances, theme toggle, server status); no demo user/teams/projects |
| ModeToggle | `src/web/components/mode-toggle.tsx` | light / dark / system (DropdownMenu) | in the sidebar footer |
| DropdownMenu | `src/web/components/ui/dropdown-menu.tsx` | closed / open | menus (theme toggle) |
| Sheet | `src/web/components/ui/sheet.tsx` | open / closed | the sidebar on narrow windows |
| Tooltip | `src/web/components/ui/tooltip.tsx` | hidden / shown | collapsed-sidebar labels; app wrapped in `TooltipProvider` |
| Separator · Skeleton · Breadcrumb | `src/web/components/ui/{separator,skeleton,breadcrumb}.tsx` | default | inset header (trigger · separator · breadcrumb); skeletons used by the sidebar only |
| NotFound | `src/web/components/NotFound.tsx:5` | default | unknown in-app address |
| Tabs | `src/web/components/ui/tabs.tsx` | active / inactive | the Speech side panel «Settings» \| «Recent» |
| Slider | `src/web/components/ui/slider.tsx` | default / dragging / disabled | `thumbProps` gives the thumb (`role="slider"`) its accessible name and value text |
| Label | `src/web/components/ui/label.tsx` | default | names a field; a labelled trigger button is named by its label («Model», «Voice») |
| ProviderBalances | `src/web/features/balances/ProviderBalances.tsx` | loading «…» / figure «$12.34» / unavailable «—» (tooltip «Balance unavailable») / hidden (no provider configured, collapsed rail) | each configured provider's remaining credit in the sidebar footer (step 20) |
| AudioModels | `src/web/features/models/AudioModels.tsx` | loading / not configured / list error + Try again / empty / prefs unreadable (toggles disabled) / save failed / No longer offered + Forget | the Models page's Audio view: speech-model table with ★ and «Show in picker» (step 20) |
| ModelSelect | `src/web/features/audio/ModelSelect.tsx` | loading (disabled) / closed / open: «Favorites» first, then grouped by maker (ElevenLabs first); hidden models left out except the selected one, marked «Hidden» (step 20) / selected | speech models as a popover list (like ModelPicker, not a Radix Select): price («$0.08 / 1K chars», «Free», «priced per …», «price unknown») + limit («5 000 chars · limit not published») |
| VoiceSelect | `src/web/features/audio/VoiceSelect.tsx` | loading / list / filter (> 20 voices) / provider default + typed name (model lists none) | voice dot colour is stable per voice |
| VoiceControls | `src/web/features/audio/VoiceControls.tsx` | slider / steps (labelled) / switch / text (≤ 1 000) / none («No adjustable settings for this model») / Reset values | renders the model's control descriptors from `src/shared/speech-models.ts` |
| CostLabel | `src/web/features/audio/CostLabel.tsx` | known / pending («cost pending · ≈ $x») / unavailable (muted, «≈ $x») | never «$0» for an unknown cost; two significant digits, «< $0.0001» |
| RecentRecordings | `src/web/features/audio/RecentRecordings.tsx` | loading / empty / error + Try again / list / pending refresh (10 s) / reuse / Replace your text? (`ReplaceTextDialog`) / delete (`DeleteRecording`: confirm · Deleting… · failed) | the step-19 audio gallery card grows from this row |
| SpeechPage | `src/web/features/audio/SpeechPage.tsx` | SCR-02 / SCR-03 states in `docs/features/text-to-speech/screens.md`; Reuse arrival (`?reuse=`) per `docs/features/audio-gallery/screens.md` SCR-08 | the `/audio/speech` section; side panel as a Sheet below `lg` |
| Tile · CardBadges | `src/web/features/gallery/Tile.tsx`, `CardBadges.tsx` | default / image unavailable / pending cost (watcher) / tags + comment marker | the image gallery card |
| GalleryViews · ByModel · ByPrompt | `src/web/features/gallery/` | view switch / model choice (counts, error + Try again) / sections with «Show all N» | image gallery views |
| GenerationDialog · GenerationDetail · Notes | `src/web/features/gallery/` | dialog over the grid / full page / Notes = `NotesCard` with image calls | image detail; built on the media-gallery layer |
| MediaDialog | `src/web/features/media-gallery/MediaDialog.tsx` | open / stepping (Newer, Older, ← →) / busy («Save or cancel your changes first») / loading next / next failed / «<Noun> deleted.» / not in order | the shared dialog engine (audio-gallery ADR-0049); arrows inside text fields and media players never step |
| NotesCard | `src/web/features/media-gallery/NotesCard.tsx` | no comment / editing (n / 2000) / saving / validation / tags + add | one comment + tags for any medium |
| usePagingSentinel · gridPlace · notice · scrollMemory | `src/web/features/media-gallery/` | — | shared grid paging, close-to-place, one-off notices, per-view scroll |
| RecordingCard | `src/web/features/audio/gallery/RecordingCard.tsx` | default / playing / audio unavailable / cost pending (watcher) / tags «+N» + comment marker / Reuse | the audio gallery card (step 21 reuses it) |
| RecordingDialog · RecordingPage (RecordingDetail) | `src/web/features/audio/gallery/` | SCR-04 / SCR-05 states in `docs/features/audio-gallery/screens.md` | a recording's dialog and page |
| AudioGallery · AudioGalleryViews · AudioByModel | `src/web/features/audio/gallery/` | SCR-02 / SCR-03 states in `docs/features/audio-gallery/screens.md` | the `/audio/gallery` section |

## Interaction & writing conventions

- **Errors:** inline — a field error under its field; a request-level error as a destructive-tinted panel above the form's submit button. No toasts.
- **Empty states:** plain text + one call-to-action button.
- **Navigation:** the inset sidebar lists the sections (≥ `md`; a sheet opened from the header trigger below); the current section is marked with `aria-current="page"` + the sidebar's active style; the inset header shows a breadcrumb of where you are; the tab title is «<Section> · Ukiyo».
- **Theme:** every screen is designed for both themes using tokens only (no raw colours); the default follows the system.
- **Loading:** a muted «Loading…» line for lists/details; an in-button spinner + disabled form for in-flight actions.
- **Validation:** on submit; errors attach to fields via `aria-invalid` + a message line under the field.
- **Microcopy tone:** short, plain, no exclamation marks; say what happened and what to do next.
