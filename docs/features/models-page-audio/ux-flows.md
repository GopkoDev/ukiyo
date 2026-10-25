---
status: Draft
updated_at: "2026-10-25"
feature_size: "M"
---

# UX flows — models-page-audio

## Screen inventory

| SCR | Screen | Notes |
|---|---|---|
| SCR-01 | Models page — Image view | the step-10 page under an «Image \| Audio» tab list; unchanged body |
| SCR-02 | Models page — Audio view | OpenRouter speech-model table + «No longer offered» |
| SCR-03 | Speech page — model list (popover) | step 18's list with a «Favorites» group and hidden models left out |
| SCR-04 | Navigation bar — provider balances | in the sidebar footer on every page; the Speech page's credits line reads the same figure |

## US-01 / US-03 — open the Audio view and compare

```mermaid
flowchart TD
  A[Owner anywhere] -->|Audio › Models| B[SCR-02 Audio view, address names it]
  A -->|Image › Models| C[SCR-01 Image view]
  C -->|tab Audio| B
  B -->|tab Image| C
  B -->|Back| C
  B --> D{speech models}
  D -->|loading| D1[Loading speech models…]
  D -->|OpenRouter not configured| D2[OpenRouter isn't configured — add its key]
  D -->|read failed| D3[Couldn't load the speech models. + Try again]
  D -->|loaded| E[table: name/id, maker, price, limit, voices, controls, ★, Show in picker]
  E -->|preferences unreadable| E1[notice, toggles disabled, no «No longer offered»]
```

## US-02 — curate speech models

```mermaid
flowchart TD
  A[SCR-02 row] -->|★ / Show in picker| B[row updates at once]
  B -->|saved| C[kept; Speech list updates without reload]
  B -->|failed or unknown model| D[toggle reverts + «Couldn't save — try again.»]
  E[No longer offered entry] -->|Forget| F[entry disappears]
  F -->|failed| G[«Couldn't forget — try again.»]
  C --> H[SCR-03: Favorites group first, hidden left out]
  H -->|selected model is hidden| I[stays selected, top of its maker group, «Hidden»]
```

## US-04 / US-05 — balances

```mermaid
flowchart TD
  A[any page] --> B[SCR-04 one line per configured provider]
  B -->|first read| B1[«…»]
  B -->|read ok| B2[«$12.34»]
  B -->|read failed| B3[«—» + tooltip Balance unavailable]
  C[generation ends / recording ends / 5 min / tab back in view] --> D[read again; last figure stays meanwhile]
  D --> B
  B2 --> E[Speech page credits line = same figure]
```

## AC → flow map

| AC | Flow |
|---|---|
| AC-01, AC-08, AC-09, AC-10 | US-01 / US-03 |
| AC-02 … AC-07 | US-02 |
| AC-11 … AC-15 | US-04 / US-05 |
