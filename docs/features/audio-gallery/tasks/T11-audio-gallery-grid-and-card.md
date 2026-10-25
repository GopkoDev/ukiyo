---
id: T11
title: "Build the Audio → Gallery section: grid, recording card, model choice and states"
layer: "ui"
deps: ["T5", "T8", "T9", "T10"]
blocks: ["T12", "T13"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-13", "AC-15"]
files_hint: ["src/web/features/audio/gallery/AudioGallery.tsx", "src/web/features/audio/gallery/RecordingCard.tsx", "src/web/features/audio/gallery/AudioGalleryViews.tsx", "src/web/sections.tsx", "src/web/features/audio/gallery/AudioGallery.test.tsx"]
owner: "agent (sdd:implement)"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T11 — Build the Audio → Gallery section: grid, recording card, model choice and states

## Place in the sequence

- **Blocked by:** T5 — Extract the media-neutral gallery primitives into a shared media-gallery layer, T8 — Add the recording detail route and let sections own their detail renderers, T9 — Coordinate playback app-wide so one recording plays at a time, T10 — Add the audio gallery's API client, view parsing, query keys and cache patching · **Blocks:** T12 — Build the audio «By model» overview, T13 — Build the recording dialog and page with notes, details and delete · **Wave:** 5.
- **Lane:** serialized with tasks sharing `src/web/sections.tsx`.

## Why (user story)

> **As the** Owner
> **I want** a gallery of all my recordings, newest first, where I can play each one in place
> **So that** I can find and listen to anything I made, not only the latest ten
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As the** Owner
> **I want** to see only one speech model's recordings, or an overview grouped by model
> **So that** I can compare what each model sounds like and costs
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers: build the Audio → Gallery section: grid, recording card, model choice and states.

## Inlined context

> SCR-02 states: default · loading · loading more · empty («No recordings yet.» + «Go to Speech») · error («Couldn't load the gallery» + Retry) · error more («Couldn't load more.» + Try again) · stale · one model (heading «<name> · N recordings» + «Show all recordings») · no such model · notice «Recording deleted.» · model choice error · card playing / audio unavailable / cost pending.
>
> — `screens.md, SCR-02, abridged`

> Card anatomy (RecordingCard, mirrors `Tile`): voice dot + voiceLabel · relative time; player (`preload="none"`); text clamped to 2 lines; CostLabel · duration · model display name; one outline Badge per recorded setting; first three tags + «+N», comment marker; ghost «Reuse». The text/header area opens SCR-04 (plain click = dialog, modified click = new tab); player, Reuse and download never open it.
>
> — `screens.md, SCR-02 card anatomy, abridged`

> Audio «Gallery» section at /audio/gallery
>
> — `sad.md §5, sections.tsx, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `listRecordings` (24/page, `model`) and `listRecordingModels` via T10.

## Acceptance criteria

### AC-01 — happy path

> **Given** the Owner has made recordings
> **When** the Owner opens Audio → Gallery
> **Then** the navigation marks «Gallery» in the Audio group, and the page shows a grid of recording cards, newest first. Each card shows:
> - a player that plays the recording in place;
> - its cost with its status, the estimate beside it when the cost isn't known (as on the Speech page);
> - how long the request took;
> - the first two lines of its text;
> - its model's name and its voice;
> - every setting it was made with (defaults included, since a recording keeps all it sent), as short labels (for example «speed 1.1», «stability 0.5», «speaker boost», «instructions» for delivery instructions);
> - its first three tags (with «+N» for more), and a marker when it has a comment;
> - how long ago it was made.
>
> The grid shows the first page. More cards load as the Owner scrolls near the end, and a «Load more» action does the same. After the last page it says that's everything.
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — domain invariant

> **Given** one card's player is playing
> **When** the Owner starts another card's player (in the grid, the dialog or the Speech page)
> **Then** the first one pauses where it was (playing it again resumes there), so at most one recording plays at a time in the Ukiyo tab. Opening a recording's dialog pauses a playing card; closing the dialog stops the dialog's player. Moving to another section pauses what was playing on the section left behind. A recording that finishes generating while the Owner is outside the Speech page does not start playing by itself. A player loads its audio only when the Owner starts it, not when the card appears, and a card's cost refreshing never restarts or interrupts its player.
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — error

> **Given** the gallery can't be read, a further page can't be read, or a recording's audio file can't be played
> **When** the Owner opens or scrolls the gallery
> **Then** the page says what failed in plain words, with a retry: «Couldn't load the gallery» with Retry when nothing is shown; «Couldn't load more» with Try again under the cards already shown, with no automatic retry. A card whose audio won't play (found when the Owner tries to play it) says «Audio unavailable» in place of the player, and its other details stay visible. With no recordings at all, the page says «No recordings yet» and offers a way to the Speech page.
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** a card's cost is pending
> **When** the provider reports the charge, or Ukiyo gives up waiting
> **Then** within 10 seconds that recording's card in every view on screen, its open dialog or page, changes to the known amount, or to «cost unavailable» with its estimate, without a reload and without re-reading every loaded page. An unknown cost never shows as $0. Recordings kept from the prototype show their amount as the cost.
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — happy path

> **Given** recordings were made with several speech models
> **When** the Owner chooses one model from the gallery's model choice, which lists every model that has recordings with its count, ordered by each model's newest stored recording
> **Then** the grid shows only that model's recordings, newest first, with the same paging. A heading names the model with its count and offers «Show all recordings». Stepping in a dialog opened from this grid stays within the model. The view is kept in the address, so Back, a reload or a shared address shows the same view. Each view keeps its own scroll position; «Show all» starts at the top. Choosing Gallery in the navigation opens «All». If the model choice or «By model» can't be read, it says so with Try again.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — error

> **Given** an address names a speech model without any recordings, for example after its last recording was deleted
> **When** the Owner opens it
> **Then** the page says «No recordings with <model>» and offers «Show all recordings». It never shows an empty grid without explanation.
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Section `{id:"audio-gallery", group:"audio", path:"/audio/gallery", label:"Gallery", icon: Library, owns: recording route, detail: (T13)}`
- [ ] `AudioGalleryViews`: All / By model / Choose a model popover (counts, newest-first order)
- [ ] Grid via `usePagingSentinel` + `useSavedScroll`-like memory per view
- [ ] `RecordingCard` as above; Reuse button calls T14's `reuseRecording` (stub link to `/audio/speech?reuse=<id>` until T14)
- [ ] Pending watcher mounted per pending card
- [ ] Component tests per state

## Edge cases

| Case | Behaviour |
|---|---|
| player error | «Audio unavailable», rest visible |
| model with no recordings | «No recordings with <model>» + Show all |
| navigation to Gallery from a model view | opens All |

## Definition of Done

- [ ] component tests for every SCR-02 state pass
- [ ] 0 audio fetches before play (preload none)
- [ ] gate green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
