---
status: Draft
tool: code
updated_at: "2026-10-25"
feature_size: "M"
---

# Screens — text-to-speech

## Source

- **Tool:** code (per [`design-system.md`](../../design-system.md)) — inline wireframes below.
- **Visual reference:** the owner's reference page `docs/design-ref/body.html` (untracked; «Text to Speech»: a text panel with counter, credits and «Generate speech», and a side panel with «Settings» | «History» tabs holding voice, model, voice adjustment sliders, Speaker Boost and «Reset values»), already followed by the prototype `src/web/features/audio/SpeechPage.tsx`. The rebuild keeps this layout and splits the file into components.
- States derive from spec §5, sad.md §6 flows 1, 4–6 and the contract errors (`contracts/openapi.yaml` `components.responses.Error`).

### SCR-01 — Navigation bar (grouped)

```
┌ Ukiyo ─────────────┐
│ IMAGE              │
│  ✦ Generate   (●)  │   ← job indicator as today
│  ▦ Gallery         │
│  ▣ Models          │
│ AUDIO              │
│  ≋ Speech          │   ← current: isActive + aria-current
├────────────────────┤
│ ◐ theme · server ok│
└────────────────────┘
```

| State | What shows | Components |
|---|---|---|
| default | two `SidebarGroup`s labelled «Image» and «Audio», in that order, entries in registry order | Sidebar, AppSidebar |
| current | the current entry is marked in its group | AppSidebar (`isActive`, `aria-current`) |
| collapsed | icon rail; group labels hidden; tooltips on entries | Sidebar, Tooltip |
| alias | the former Speech address replaces itself with the Audio address; Speech is current | AppSidebar (router `replace`) |
| error / empty | N/A: static navigation, no data to fail or be empty | — |

### SCR-02 — Speech page — compose

```
Text to Speech                                         [⚙] (below lg: opens the panel as a Sheet)
Convert text into natural sounding speech.
┌──────────────────────────────────────────────┐ ┌ [Settings] [Recent] ─────────┐
│ Describe what you want to say…               │ │ Voice     [george        ▾]  │
│                                              │ │ Model     [Eleven v3     ▾]  │
│                                              │ │   ElevenLabs                 │
│                               508 / 5 000 ch │ │    Eleven v3 · $0.08/1K · 5K │
├──────────────────────────────────────────────┤ │   Google …                   │
│ ◎ $12.50 credits remaining  ≈ $0.041 [Generate speech] │ ─────────────────────────────│
└──────────────────────────────────────────────┘ │ Voice adjustment             │
 (error line under the panel)                    │ Stability   Natural  ●───────│
                                                 │ Similarity  75%      ────●── │
                                                 │ Delivery instructions [....] │
                                                 │ [ ] Speaker Boost  [↺ Reset] │
                                                 └──────────────────────────────┘
```

| State | What shows | Components | Source |
|---|---|---|---|
| default | text area, counter «N / limit characters», credits, estimate, enabled «Generate speech»; side panel Settings tab | Card-style panel (prototype `Panel`), Textarea, Button, Tabs, Label | AC-03, AC-07 |
| loading (models) | model and voice selects disabled with «Loading models…» / «Loading voices…»; generate disabled | Select, Button | flow 4 |
| error (models) | «Couldn't load speech models — Try again» under Model; generate disabled | Button (ghost) | flow 4 cache-cold failure (502) |
| not configured | inline notice above the text: «Speech needs OpenRouter — set OPENROUTER_API_KEY in .env.local and restart the server»; generate disabled; credits hidden | Card notice, Button disabled | AC-06, 409 |
| validation | text blank → generate disabled; over the limit → counter in destructive colour «5 210 / 5 000 characters», generate disabled; a server refusal shows its message under the panel (role=alert) | Textarea, Button | AC-04, 400 |
| limit not published | counter suffix «· limit not published» (5 000 default) | — | AC-09 |
| estimate states | «≈ $0.0012» · «≈ < $0.0001» · «Free» · «priced per second of audio» · «priced per token» · «price unknown» — never «$0» | text (muted, tabular) | AC-11, AC-12 |
| working | button «Generating…» with a spinner, disabled; text and settings editable; survives moving to another section and back | Button, Loader icon | AC-17, AC-02 |
| error (provider) | under the panel, role=alert: the provider's reason; for a timeout «… did not answer within 180 s — the provider may still charge for it»; form kept | text (destructive) | AC-05, 502 |
| error (save) | role=alert: «The audio arrived but couldn't be saved — the provider may still charge for it»; form kept | text (destructive) | AC-20, 500 |
| no voices listed | Voice shows «Provider default» plus a «Type a voice name» input | VoiceSelect | AC-09 |
| many voices | voice list with a filter input when > 20 voices | VoiceSelect | AC-07 |
| unknown model | Voice adjustment shows «No adjustable settings for this model» | VoiceControls | AC-09 |
| model gone | after reuse: notice «<name> is no longer offered — kept <current>» above the panel | text (muted) | AC-15 |
| empty | N/A: an empty text is the default state (validation covers it) | — | — |

### SCR-03 — Speech page — latest result

```
┌──────────────────────────────────────────────┐
│ ● George  Eleven v3 · just now · cost pending · ≈ $0.041   [⤓ Download] │
│ ▶ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  0:04 / 0:12                   │
└──────────────────────────────────────────────┘
```

| State | What shows | Components | Source |
|---|---|---|---|
| default | voice dot + name («Provider default» when none), model name, relative time, cost, download, native player | Panel, Badge-free text, Button (link), `<audio controls>` | AC-03 |
| new | player autoplays (only for the recording just generated) | `<audio autoPlay>` | AC-03 |
| cost known | «$0.041» (two significant digits; «< $0.0001» for tiny) | CostLabel | AC-13 |
| cost pending | «cost pending · ≈ $0.041» (estimate omitted when none); updates without reload | CostLabel | AC-13 |
| cost unavailable | «cost unavailable · ≈ $0.041» muted | CostLabel | AC-13 |
| error (file) | the player can't load the file → «Audio unavailable» in place of the player | text (muted) | 404 on file |
| empty | N/A: shown only once there is a result | — | — |

### SCR-04 — Speech page — recent recordings

```
[Settings] [Recent]
┌──────────────────────────────┐
│ Hello from Ukiyo, this is …  │  ← button: reuse
│ ● George · Eleven v3 · 2 min ago · $0.004 │
│ ▶ ━━━━━━━━━━━━  (h-8)        │
│              [⤓] [🗑]         │
└──────────────────────────────┘
 …ten latest, newest first
```

| State | What shows | Components | Source |
|---|---|---|---|
| default | ten latest: excerpt (reuse button), voice, model name, time, cost with status, small player, download, delete | RecordingItem, CostLabel, Button (ghost) | AC-15 |
| loading | «Loading…» (muted) | Skeleton | flow 5 |
| empty | «No speech generated yet.» | text (muted) | flow 5 |
| error | «Couldn't load your recordings — Try again» | Button (ghost) | 400/5xx on list |
| pending refresh | items with cost pending refresh every 10 s until settled | — (query refetch) | AC-13, flow 5 loop |
| prototype rows | listed like any other; model name from the family spec or the id | RecordingItem | AC-18 |
| deleting | the item's delete button disabled with a spinner | Button | flow 6 |
| delete failed | the item stays playable; inline «Couldn't delete — try again» under it | text (destructive) | AC-16, 500 |
| gone | delete of an already-deleted item → removed from the list silently | — | 404 on delete |

### SCR-05 — Replace text? (confirm)

```
┌ Replace your text? ───────────────────┐
│ The form holds unsent text. Replace it│
│ with this recording's text and        │
│ settings?                             │
│                 [Keep mine] [Replace] │
└───────────────────────────────────────┘
```

| State | What shows | Components | Source |
|---|---|---|---|
| default | title, one sentence, «Keep mine» (focus) / «Replace» | Dialog | AC-15 |
| error / empty | N/A: a local choice, nothing to load or fail | — | — |

### SCR-06 — Delete recording? (confirm)

```
┌ Delete this recording? ───────────────┐
│ Its audio file is deleted too. This   │
│ can't be undone.                      │
│                    [Cancel] [Delete]  │
└───────────────────────────────────────┘
```

| State | What shows | Components | Source |
|---|---|---|---|
| default | title, one sentence, «Cancel» (focus) / «Delete» (destructive) | Dialog, Button (destructive) — same shape as `features/gallery/DeleteGeneration.tsx` | AC-16 |
| busy | «Deleting…», both buttons disabled | Dialog, DialogBusy pattern (`features/gallery/DialogBusy.tsx`) | flow 6 |
| error | dialog stays open with «Couldn't delete this recording — try again» | text (destructive) | AC-16, 500 |
| empty | N/A: a confirmation, no data | — | — |

## New components

| Component | Where | Why no existing primitive fits |
|---|---|---|
| Tabs, Slider, Label (inventory addition) | `src/web/components/ui/{tabs,slider,label}.tsx` | already in the repo (prototype added them) but missing from the design-system inventory — registered by implement, not new code |
| NEW: VoiceControls | `src/web/features/audio/VoiceControls.tsx` | renders controls from the model's descriptors (slider / steps / switch / text); no existing component is descriptor-driven |
| NEW: ModelSelect | `src/web/features/audio/ModelSelect.tsx` | a grouped `Select` by maker with price and limit per row; `ModelPicker` is image-specific (favorites, per-image price, provider), step 20 may converge them |
| NEW: VoiceSelect | `src/web/features/audio/VoiceSelect.tsx` | `Select` can't filter by typing or take a typed voice name; built from Popover + Input + a list, like ModelPicker's popover |
| NEW: CostLabel | `src/web/features/audio/CostLabel.tsx` | a recording's cost with status + «≈» estimate; `CardBadges` is an image-card strip with duration and size |
| NEW: RecordingItem | `src/web/features/audio/RecentRecordings.tsx` | a list row with a native audio player; step 19 grows it into the gallery card |
