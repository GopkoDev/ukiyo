---
status: Draft
updated_at: "2026-10-25"
feature_size: "M"
tool: code
---

# Screens — voice-presets

## Source

`tool: code` (docs/design-system.md) — inline wireframes below. Reuse-first: shadcn `Popover`, `Button`, `Badge`, `Card`, `Dialog`, `Input`, `Label`, `DropdownMenu`, `Tooltip`; app pieces `RecordingCard`, `RecordingDialog` / `MediaDialog`, `usePagingSentinel`, `CostLabel`-style wording, `settingsLabels`, `voiceLabel` / `voiceDot`, `formatRelative`, `formatUsdSig`.

## SCR-01 — Speech page preset row (side panel «Settings» tab, above Voice; also in the sheet)

```
Voice preset
[ Narrator · modified        ▾ ]  [Save]  [⋯]        ← ⋯ = DropdownMenu: Rename, Delete, Detach (only when applied)
  popover list (role=listbox «Voice presets»), by name:
    Narrator          ElevenLabs v3 · George
    Old one  [No longer offered]  (aria-disabled)
    Soft     [Hidden]  Eleven Flash · Kore
```

| State | Shows | Source |
|---|---|---|
| default (none applied) | trigger «No voice preset»; Save enabled when a model is chosen; ⋯ hidden | AC-01 |
| applied | trigger «<name>»; Save disabled (title «Nothing to save»); ⋯ Rename / Delete / Detach | AC-03, AC-06 |
| modified | trigger «<name> · modified»; Save enabled → SCR-02 update choice | AC-05, AC-10 |
| loading | trigger «Loading voices…» disabled | AC-19 |
| empty | list: «No voice presets yet — set up a voice and press Save.» | AC-01 |
| error | list: «Couldn't load your voices.» + Try again; generating still works | AC-19 |
| no longer offered | row badge «No longer offered», picking it shows «<model name> is no longer offered» under the row | AC-09 |
| catalog not loaded | rows listed, not pickable, note «Loading models…»; when the model list failed: «Couldn't load the speech models.» (a `?preset=` handover: «Couldn't load the speech models — the voice preset wasn't applied.») | AC-09, review R4 |
| notice | «Wait for the current recording to finish, then apply.» / «This voice no longer exists.» (the page's notice line) | AC-14 |

## SCR-02 — Save dialog

```
┌ Save voice preset ────────────────────────┐
│ (modified only)  ( ) Update «Narrator»    │
│                  (•) Save as new          │
│ Name  [George · ElevenLabs v3        ]    │   ← only for a new preset
│       A voice named «Narrator» already exists
│                         [Cancel] [Save]   │
└───────────────────────────────────────────┘
```

| State | Shows | Source |
|---|---|---|
| default | name prefilled «<voice> · <model name>» (≤ 60), focused | AC-01 |
| update choice | two buttons «Update «<name>»» and «Save as new»; Save as new reveals the name field | AC-06 |
| validation | message under the field: «Enter a name» / «At most 60 characters» / «A voice named «X» already exists» (`aria-invalid`) | AC-02 |
| saving | Save disabled + spinner | — |
| error | «Couldn't save — try again.» above the buttons; typed name kept | AC-02, AC-07 |
| success | dialog closes; SCR-01 shows the preset applied | AC-01, AC-06 |

## SCR-03 — Rename dialog

Same as SCR-02's name field: title «Rename voice», prefilled with the current name, «Rename» button. States: default / validation (AC-02; a case-only change is valid) / saving / error «Couldn't save — try again.» / success (new name everywhere).

## SCR-04 — Voices list (`/audio/voices`)

```
Voices
┌───────────────────────────────┐ ┌───────────────────────────────┐
│ Narrator                  ⋯   │ │ Old one  [No longer offered] ⋯│
│ ● George · ElevenLabs v3      │ │ ● Kore · Retired TTS          │
│ [speed 1.1] [stability 0.5]   │ │ [speed 1]                     │
│ 3 recordings · $0.42 + 1 pending │ No recordings yet · —        │
│ Last used 2 h ago   [Apply]   │ │ Never used          [Apply]   │ ← disabled
└───────────────────────────────┘ └───────────────────────────────┘
```

Cards in the gallery grid (`grid-cols-2 md:3 xl:4`); the name links to SCR-05; ⋯ = Rename, Delete.

| State | Shows | Source |
|---|---|---|
| loading | «Loading…» | — |
| empty | «No voice presets yet.» + button «Go to Speech» | AC-11 |
| error | «Couldn't load your voices.» + Try again | AC-19 |
| default | one PresetCard per preset by name | AC-11, AC-12 |
| no longer offered | badge; Apply disabled with tooltip «<model> is no longer offered» | AC-09 |
| deleted notice | «Voice deleted.» after deleting from SCR-05 | AC-07 |

## SCR-05 — Preset page (`/audio/voices/<id>`)

```
← Voices
Narrator                                   [Apply] [Rename] [Delete]
● George · ElevenLabs v3 · [speed 1.1] [stability 0.5]
3 recordings · $0.42 + 1 pending · Last used 2 h ago
┌RecordingCard┐ ┌RecordingCard┐ ┌RecordingCard┐
Load more / That's everything
```

| State | Shows | Source |
|---|---|---|
| loading | «Loading…» | — |
| default | header + newest-first grid of the preset's RecordingCards, paging by sentinel + «Load more» | AC-13 |
| empty | «No recordings with this voice yet.» + Apply | AC-13 |
| error | «Couldn't load this voice.» + Try again | AC-19 |
| gone | «This voice no longer exists.» + link «Back to Voices» | AC-07 |
| page error | «Couldn't load more.» + Try again, cards kept | AC-19 |
| no longer offered | badge in the header, Apply disabled | AC-09 |

## SCR-06 — Recording dialog over the preset grid

`RecordingDialog` unchanged in look; steps through the preset's list only; the Details card gains a row **Voice preset** → link «Narrator» to SCR-05 (also on the recording page; absent when unlinked). States: as audio-gallery SCR-04 (loading / gone / error / stepping / deleted → neighbour). Source: AC-04, AC-13, AC-16.

## SCR-07 — Delete confirmation

`Dialog`: «Delete «Narrator»?» / «Its 3 recordings are kept.» (or «It has no recordings.») / [Cancel] [Delete] (destructive). States: default / deleting (disabled + spinner) / error «Couldn't delete — try again.» / success (closes; SCR-01 detaches, SCR-05 → SCR-04 with notice). Source: AC-07.

## New components

| Component | Why no existing primitive fits |
|---|---|
| NEW: PresetSelect (`features/audio/presets/PresetSelect.tsx`) | a preset list with applied / modified / no-longer-offered states — ModelSelect lists models, not saved setups; built from the same Popover pattern |
| NEW: SavePresetDialog, RenamePresetDialog (`PresetNameDialog`) | naming with server-side uniqueness; composed of Dialog + Input + Label |
| NEW: DeletePreset | confirm text with the recording count; DeleteRecording is recording-specific |
| NEW: PresetCard, VoicesPage, PresetPage | the Voices section's own list card and pages; the grid below reuses RecordingCard |
