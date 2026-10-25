---
status: draft
feature_size: "M"
tool: "code"
updated_at: "2026-10-25"
---

# Screens — audio-gallery

> The canonical screen manifest for [spec.md](./spec.md) / [ux-flows.md](./ux-flows.md). Downstream reads only this.
> Visual language: the image gallery's (`src/web/features/gallery/` — `Tile`, `CardBadges`, `GenerationDialog`, `Notes`, `ByModel`, `GalleryViews`), which this step reuses through the shared media-gallery layer (ADR-0049).

## Source

- **Tool:** code (from `docs/design-system.md`)
- **File:** inline wireframes below

## Screens

### SCR-01 — Navigation bar

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | always | AppSidebar: Audio group = Speech (`AudioLines`), Gallery (`Library` icon) | wireframe below |
| current | on `/audio/gallery` or a recording address | AppSidebar current entry «Gallery» in Audio; breadcrumb «Gallery», or «Gallery › Recording» on a recording | — |
| error / empty | N/A: static navigation, no data | — | — |

```text
Image            Audio
  Generate         Speech
  Gallery        > Gallery      <- current
  Models
```

### SCR-02 — Audio gallery grid («All» or one model)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | page(s) loaded (AC-01) | view switch (Button ×2 «All» «By model» + Popover «Choose a model» with Badge counts); grid 2/3/4 cols of `NEW: RecordingCard`; «Load more» Button + sentinel; «That's everything» | wireframe A |
| loading | first read in flight | «Loading…» text | — |
| loading more | next page in flight | Loader2 + «Loading more…», Load more disabled | — |
| empty | no recordings (AC-03) | «No recordings yet.» + Button link «Go to Speech» | wireframe B |
| error | first read failed (AC-03) | destructive panel «Couldn't load the gallery» + Button «Retry» | — |
| error (more) | next page failed (AC-03) | «Couldn't load more.» + Button «Try again» under the cards; no auto retry | — |
| stale | refresh failed with cards shown | «These cards may be out of date. Refresh» | — |
| one model | `?model=` (AC-13) | heading «Eleven v3 · 12 recordings» + link Button «Show all recordings»; trigger reads «Model: Eleven v3» | wireframe A |
| no such model | one-model view, empty (AC-15) | «No recordings with <name or id>.» + Button «Show all recordings» | — |
| notice | after a delete closed the dialog / on the page (AC-11) | «Recording deleted.» text above the grid | — |
| model choice error | models read failed (AC-13) | inside the Popover: «Couldn't load your models.» + Button «Try again» | — |
| card: playing | the Owner plays (AC-02) | native `audio controls preload="none"`; others pause | — |
| card: audio unavailable | the player errors (AC-03) | «Audio unavailable» text in the player slot | — |
| card: cost pending | costStatus pending (AC-04) | CostLabel «cost pending · ≈ $x»; settles in place | — |

```text
A — default
[All] [By model] [Choose a model v]
+--------------------+ +--------------------+ +--------------------+
| (o) George   2h ago| | ...                | | ...                |
| > ||------- 0:04   | |                    | |                    |
| Welcome to the show| |                    | |                    |
| and the next line… | |                    | |                    |
| $0.0016 · 2.1 s    | |                    | |                    |
| Eleven v3          | |                    | |                    |
| stab 0.5 sim 0.75  | |                    | |                    |
| [narration] [+2] 💬| |                    | |                    |
|            [Reuse] | |                    | |                    |
+--------------------+ +--------------------+ +--------------------+
              (  Load more  )
B — empty
No recordings yet.   [Go to Speech]
```

Card anatomy (`NEW: RecordingCard`, built on Card + Badge, mirrors `Tile`): header row = voice dot + `voiceLabel` (VoiceSelect helpers) · relative time; player; text clamped to 2 lines (`line-clamp-2`); a badge strip — CostLabel (cost status + «≈» estimate) · duration (`formatDuration`) · model display name (secondary Badge, truncated); settings strip — one outline Badge per recorded setting (`speed 1.1`, `stability 0.5`, `similarity 0.75`, `style 0.3`, `speaker boost`, `instructions`); tags strip — first three tags + «+N», MessageSquare marker when commented; footer — ghost Button «Reuse» (RotateCcw). The text/header area is the link that opens SCR-04 (plain click = dialog, modified click = new tab); the player, Reuse and download never open it.

### SCR-03 — «By model»

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | groups read (AC-14) | one `section` per model: h3 display name, «12 recordings», link Button «Show all 12», a row of up to four RecordingCard | wireframe below |
| loading | read in flight | «Loading…» | — |
| empty | no recordings | as SCR-02 empty | — |
| error | read failed | destructive panel «Couldn't load the models.» + «Try again» | — |
| stale | refresh failed with groups shown | «These may be out of date.» + «Try again» | — |

```text
Eleven v3                               Show all 12
12 recordings
[card] [card] [card] [card]
Gemini 3.8 Flash TTS                    Show all 3
[card] [card] [card]
```

### SCR-04 — Recording dialog

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | recording read (AC-05) | Dialog `sm:max-w-5xl`; `NEW: DialogFrame` header: title = text excerpt, Step «Newer»/«Older» (Tooltip), Close; left column: player + Download Button + full text; right column: actions (Reuse, Delete), `NEW: NotesCard`, Details Card (Model, Voice, Settings incl. full instructions, Created, Duration, Characters, File type, Cost = CostLabel + status Badge) | wireframe below |
| loading | not read yet | Placeholder «Loading…» in the right column | — |
| gone | 404 (AC-06) | «This recording no longer exists.»; stepping and closing still work | — |
| error | read failed (AC-06) | destructive panel «Couldn't load this recording» + «Try again» | — |
| busy | unsaved comment / typed tag / delete confirm (AC-09) | Step buttons `aria-disabled`, tooltip «Save or cancel your changes first» | — |
| loading next | stepping past the end | Older shows Loader2 | — |
| next failed | next page failed (AC-05) | strip «Couldn't load the next one. Try again» | — |
| deleted notice | after a delete moved to a neighbour (AC-11) | status strip «Recording deleted.» | — |
| not in order | opened outside the loaded order | «Not in the gallery's current order» instead of steps | — |
| delete failed | delete error (AC-12) | alert «Couldn't delete this recording» | — |

```text
+------------------------------------------------------------------------+
| Welcome to the show…            < Newer   Older >                  [x] |
+-----------------------------------+------------------------------------+
| > ||-------------------- 0:04     |              [Reuse] [Delete]      |
| [Download]                        | Notes                              |
|                                   |  No comment yet      [Add comment] |
| Welcome to the show. And the next |  [narration x] [Add a tag…      ]  |
| line of the full text, wrapped.   | Details                            |
|                                   |  Model     Eleven v3               |
|                                   |  Voice     (o) George              |
|                                   |  Settings  stability 0.5 · …       |
|                                   |  Created   25 Oct 2026, 10:00      |
|                                   |  Duration  2.1 s                   |
|                                   |  Characters 20 · MP3               |
|                                   |  Cost      cost pending · ≈ $0.0016|
+-----------------------------------+------------------------------------+
```

### SCR-05 — Recording page

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | direct visit, recording read (AC-06) | link Button «← Gallery» (to «All»); `NEW: RecordingDetail` layout `page`: same content as SCR-04 in one column, no steps | — |
| loading | read in flight | «Loading…» | — |
| gone | 404 (AC-06) | «This recording no longer exists.» + «← Gallery» | — |
| error | read failed | destructive panel «Couldn't load this recording» + «Retry» | — |
| delete failed | (AC-12) | alert «Couldn't delete this recording» | — |

### SCR-06 — Notes card (in SCR-04 / SCR-05)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | (AC-07) | `NEW: NotesCard` (Card, Textarea, Input, Badge, Button) — exactly the image Notes card | — |
| editing | Add comment / Edit | Textarea + «n / 2000» + Cancel / Save | — |
| saving | mutation in flight | Save with Loader2, fields disabled | — |
| validation | rule broken (AC-08) | Input/Textarea `aria-invalid` + message under it, typed text kept | — |
| gone | recording deleted elsewhere (AC-08) | detail refetch → SCR-04/SCR-05 «gone» | — |
| empty | no comment, no tags | «No comment yet» + «Add comment»; tag Input only | — |

### SCR-07 — Delete recording? (confirm)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Delete chosen (AC-11) | Dialog: «Delete this recording?», quoted excerpt, «Its audio file, tags and comment are deleted too. This can't be undone.», Cancel (autofocus) / destructive Delete | — |
| deleting | in flight | «Deleting…» + Loader2, both buttons disabled, no close | — |
| failed | (AC-12) | closes; SCR-04/SCR-05 alert | — |
| empty | N/A: a confirmation has no data state | — | — |

Reuses step 18's `DeleteRecording` dialog content; it now reports busy to the dialog and hands the result to the dialog's delete-then-move (ADR-0049).

### SCR-08 — Speech page on Reuse (step 18 page)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | `?reuse=<id>` applied (AC-16) | SpeechPage form filled; SpeechResult shows the recording (no autoplay) | — |
| loading | recording or models still loading | form unchanged; muted line «Loading the recording…» | — |
| replace? | unsent differing text (AC-17) | ReplaceTextDialog «Replace your text?» Keep mine / Replace | — |
| retired model | model not in the loaded list (AC-17) | existing notice «<name> is no longer offered — kept <current>» | — |
| models failed | model list failed (AC-17) | existing «Couldn't load speech models — … Try again»; reuse waits | — |
| in flight | a request is generating (AC-17) | muted line «Wait for the current recording to finish, then reuse.»; form unchanged | — |
| gone | recording deleted (AC-17) | muted line «This recording no longer exists.» | — |

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| RecordingCard (`features/audio/gallery/RecordingCard.tsx`) | `Tile` is an image card (thumbnail, image badges); a recording card needs a player, voice, settings badges and Reuse | pending |
| RecordingDetail (`features/audio/gallery/RecordingDetail.tsx`) | `Detail` is image-specific (outputs, inputs, lineage, raw exchange) | pending |
| NotesCard (`features/media-gallery/NotesCard.tsx`) | extracted from the image `Notes` so both media share it (ADR-0049); `Notes` becomes a wrapper | pending |
| DialogFrame + useDialogStepping (`features/media-gallery/`) | extracted from `GenerationDialog` (ADR-0049) | pending |
| AudioGalleryViews (`features/audio/gallery/AudioGalleryViews.tsx`) | `GalleryViews` has «By prompt» and image model ids/providers; audio needs All / By model / model choice only | pending |

The existing image gallery components (`Tile`, `CardBadges`, `Notes`, `GenerationDialog`, `ByModel`, `GalleryViews`) are not yet in the design-system inventory; implement registers them together with the new ones.
