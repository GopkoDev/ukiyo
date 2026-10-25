---
status: Draft
updated_at: "2026-10-25"
feature_size: "M"
---

# UX flows — voice-presets

Platform: desktop-first responsive web (the design-system posture, unchanged). The Speech page's side panel
(and its sheet below `lg`) gains a preset row above Voice; Voices is a new Audio section.

## Screen inventory

| SCR | Screen | Notes |
|---|---|---|
| SCR-01 | Speech page — preset row | the applied preset («<name>», «<name> · modified» or «No voice preset»), the preset list, Save, Detach, Rename, Delete |
| SCR-02 | Save dialog | name a new preset, or choose «Update «<name>»» / «Save as new» for a modified one |
| SCR-03 | Rename dialog | same naming rules as SCR-02; opened from SCR-01, SCR-04 or SCR-05 |
| SCR-04 | Voices list | `/audio/voices` — every preset with model, voice, settings, count, total, last use |
| SCR-05 | Preset page | `/audio/voices/<id>` — the preset's header and the grid of its recordings |
| SCR-06 | Recording dialog over the preset grid | the audio gallery's dialog, stepping only through the preset's recordings |
| SCR-07 | Delete confirmation | «Delete «<name>»? Its N recordings are kept.» |

## US-01 / US-03 — save, update, save as new

```mermaid
flowchart TD
  A[SCR-01 Speech page] --> B{applied preset?}
  B -->|none| C[Save → SCR-02 name field, suggestion «voice · model»]
  B -->|applied, unchanged| X[Save unavailable]
  B -->|applied, modified| D[Save → SCR-02 Update «name» / Save as new]
  C -->|confirm valid name| E[preset kept; applied, plain «name»]
  C -->|empty / >60 / name taken| C1[dialog stays + message]
  C -->|save failed| C2[«Couldn't save — try again.», text kept]
  D -->|Update| F[preset replaced; applied, unchanged; past recordings untouched]
  D -->|Save as new| C
  F -->|failed| F1[«Couldn't save — try again.», nothing changes]
```

## US-02 — apply, modify, detach

```mermaid
flowchart TD
  A[SCR-01 preset list, by name] --> B{pick a preset}
  B -->|offered model + voice| C[model, voice, settings set; text kept; «name»]
  B -->|hidden model| C
  B -->|no longer offered| B1[nothing applied + «model is no longer offered»]
  B -->|model list not loaded| B2[listed, can't apply yet]
  A -->|preset list unreadable| B3[«Couldn't load your voices.»; generating still works]
  C -->|catalog changed a setting| M[«name · modified»]
  C -->|Owner edits model / voice / a setting| M
  M -->|values back to the preset's| C
  M -->|Generate| U[recording saved unlinked]
  C -->|Generate| L[recording saved linked]
  C -->|Detach| D[no preset; values kept]
  M -->|Detach| D
```

## US-03 — rename and delete

```mermaid
flowchart TD
  A[SCR-01 applied preset / SCR-04 row / SCR-05 header] -->|Rename| R[SCR-03]
  R -->|valid name| R1[new name everywhere, no reload]
  R -->|invalid / taken| R2[dialog stays + message]
  R -->|failed| R3[«Couldn't save — try again.»]
  A -->|Delete| D[SCR-07 confirmation with N recordings]
  D -->|confirm| D1[gone from list + Voices; recordings kept, unlinked]
  D1 -->|was applied on Speech| D2[Speech: no preset, values kept]
  D1 -->|was on its page| D3[SCR-05 «This voice no longer exists.» + back to Voices]
  D -->|failed| D4[«Couldn't delete — try again.», nothing changes]
```

## US-04 — the link, seen from a recording

```mermaid
flowchart TD
  A[Generate with applied, unchanged preset] --> B{server: setup equals preset now?}
  B -->|yes| C[recording linked]
  B -->|no / preset deleted meanwhile| D[recording saved unlinked]
  C --> E[SCR-06 / recording page names the preset → SCR-05]
  F[Reuse a linked recording] --> G{preset exists, applicable, still equal?}
  G -->|yes| H[SCR-01 text + setup + preset applied]
  G -->|no| I[SCR-01 text + setup, no preset]
  F -->|unsent text kept or request in flight| J[nothing applied]
```

## US-05 / US-06 — Voices and a preset's page

```mermaid
flowchart TD
  N[Audio › Voices] --> A[SCR-04 Voices list]
  A -->|loading| A0[Loading…]
  A -->|read failed| A1[«Couldn't load your voices.» + Try again]
  A -->|no presets| A2[empty: go to Speech to save one]
  A -->|row| B[SCR-05 preset page]
  B -->|no recordings| B0[«No recordings with this voice yet.» + Apply]
  B -->|read failed| B1[«Couldn't load this voice.» + Try again]
  B -->|deleted| B2[«This voice no longer exists.»]
  B -->|scroll| B3[next page; failure → «Couldn't load more.» + Try again]
  B -->|open a card| C[SCR-06 dialog, ← → within the preset]
  C -->|Back / close| B
  C -->|delete recording| C1[steps to neighbour; counts update]
  A -->|Apply| S[SCR-01 with the preset applied]
  B -->|Apply| S
  S -->|request in flight| S1[«Wait for the current recording to finish, then apply.»]
  S -->|Back| B
```

## AC → flow map

| AC | Flow |
|---|---|
| AC-01, AC-02, AC-06 | US-01 / US-03 save |
| AC-03, AC-05, AC-09, AC-10 | US-02 apply |
| AC-07, AC-08 | US-03 rename / delete |
| AC-04, AC-15, AC-18 | US-04 link |
| AC-11, AC-12, AC-13, AC-14, AC-16, AC-19 | US-05 / US-06 |
| AC-17 | N/A: no screen — a refused foreign request shows nothing |
