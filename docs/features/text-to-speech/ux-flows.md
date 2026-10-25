---
status: Draft
updated_at: "2026-10-25"
feature_size: "M"
---

# UX flows — text-to-speech

## Platform decisions

- **Posture:** desktop-first, per [`design-system.md`](../../design-system.md): designed at `lg` (≥ 1024 px), with the side panel next to the text. Below `lg` the side panel opens as a sheet, as the prototype does. Phone layout is not a goal.
- **Tool:** code mode — flows here, inline wireframes in `screens.md`.

## Screen inventory

| SCR | Screen | Purpose | Entry | Exit |
|---|---|---|---|---|
| SCR-01 | Navigation bar (grouped) | Image group (Generate, Gallery, Models), then the Audio group (Speech) | always visible | any section |
| SCR-02 | Speech page — compose | text, character counter, estimate, credit balance, generate; side panel «Settings» with voice, model and the model's controls | Audio → Speech; the former Speech address | generate → SCR-03; «Recent» tab → SCR-04 |
| SCR-03 | Speech page — latest result | player (autoplays when it is new), voice, model, time, cost with its status (+ «≈ estimate»), download | after a generation; choosing a recording | back to composing on the same page |
| SCR-04 | Speech page — recent recordings | the ten latest recordings: player, excerpt, voice, model, time, cost, download, reuse, delete | side panel «Recent» tab | reuse → SCR-02 (filled) / SCR-05; delete → SCR-06 |
| SCR-05 | Replace text? (confirm) | ask before overwriting unsent text that differs from the recording's | reuse with different unsent text | replace → SCR-02 filled; keep → SCR-04 |
| SCR-06 | Delete recording? (confirm) | deletion has no undo | delete on a recording | delete → SCR-04 without it; cancel → SCR-04 |

## Flows

### US-01: Find Image and Audio apart

```mermaid
flowchart TD
    A[Owner opens Ukiyo] --> B[SCR-01 shows Image group then Audio group]
    B -->|Generate, Gallery or Models| C[image page as before]
    B -->|Speech| D[SCR-02 Speech page]
    E[Owner opens the former Speech address] --> F[address replaced by the Audio one]
    F --> D
    D -->|another section and back| G{request in flight?}
    G -->|yes| H[SCR-02 still in progress, generate unavailable]
    G -->|finished meanwhile| I[SCR-03 shows the result, first in SCR-04]
    G -->|failed meanwhile| J[SCR-02 shows the error, form kept]
    G -->|no| K[SCR-02 with text and settings kept]
```

### US-02: Turn text into speech

```mermaid
flowchart TD
    A[SCR-02 Owner types text, picks model and voice] --> B{OpenRouter configured?}
    B -->|no| C[SCR-02 says how to configure, generate unavailable]
    B -->|yes| D{text blank or over the model limit?}
    D -->|yes| E[counter in warning colour, generate unavailable]
    E --> A
    D -->|no| F[Owner generates]
    F --> G[SCR-02 working, generate unavailable]
    G --> H{outcome}
    H -->|provider refused, failed or no audio| I[SCR-02 plain message with the reason, form kept]
    H -->|no answer in time| J[SCR-02 message, may still be charged, form kept]
    H -->|audio arrived but not saved| K[SCR-02 message, may still be charged, nothing left behind]
    H -->|saved| L[SCR-03 player starts, recording first in SCR-04, balance refreshed]
```

### US-03: Use each model's own controls

```mermaid
flowchart TD
    A[SCR-02 Owner opens the model list grouped by maker] --> B[each entry shows price and character limit]
    B --> C[Owner chooses a model]
    C --> D{what does Ukiyo know about it?}
    D -->|known family| E[only its controls with own ranges and defaults]
    D -->|unknown model| F[voice and text only]
    C --> G{voices listed?}
    G -->|yes, more than 20| H[voice list filterable by typing]
    G -->|yes| I[voice list]
    G -->|none| J[provider default or a typed voice name]
    E --> K[shared values kept, brought into range; voice kept if offered else first or provider default]
    K --> L{Reset values?}
    L -->|yes| M[controls and instructions back to this model's defaults, voice and text kept]
```

### US-04: Know what a recording costs

```mermaid
flowchart TD
    A[SCR-02 Owner types] --> B{how is the model priced?}
    B -->|per character| C[estimate labelled as estimate, two significant digits, below 0.0001 shown as less than]
    B -->|zero price| D[Free]
    B -->|per second or per token| E[says how it is priced, no number]
    B -->|not published| F[price unknown, never 0 or Free]
    C --> G[Owner generates, recording saved]
    E --> G
    F --> G
    G --> H{cost after saving}
    H -->|stated in the answer| I[SCR-03 known amount]
    H -->|waiting for the provider| J[SCR-03 cost pending beside the estimate]
    J -->|reported within ten minutes| I
    J -->|never reported| K[cost unavailable, estimate still labelled]
```

### US-05: Keep and manage my recordings

```mermaid
flowchart TD
    A[SCR-04 Recent tab, ten latest, newest first] --> B{Owner action}
    B -->|play or download| C[audio plays or downloads as a common audio file]
    B -->|reuse| D{unsent text differs?}
    D -->|yes| E[SCR-05 Replace text?]
    E -->|keep| A
    E -->|replace| F{model still offered?}
    D -->|no| F
    F -->|yes| G[SCR-02 filled with text, model, voice and settings]
    F -->|no| H[SCR-02 says the model is no longer offered, text and accepted settings filled, current model kept]
    B -->|delete| I[SCR-06 Delete recording?]
    I -->|cancel| A
    I -->|delete| J{deleted?}
    J -->|yes| K[SCR-04 without it, its cost no longer awaited]
    J -->|failed| L[SCR-04 keeps it playable, says deletion failed]
```

### US-06: Keep my prototype recordings

```mermaid
flowchart TD
    A[Owner opens SCR-04 after the update] --> B[prototype recordings listed with text, model, voice, settings]
    B --> C{had an amount?}
    C -->|yes| D[amount shown as the final cost]
    C -->|no| E[cost unavailable, never 0]
    B --> F[plays and downloads like any recording]
```

## AC coverage

| AC | Flow / node |
|---|---|
| AC-01 | US-01: SCR-01 groups; former address replaced |
| AC-02 | US-01: «another section and back» branches |
| AC-03 | US-02: saved → SCR-03 |
| AC-04 | US-02: blank or over the limit |
| AC-05 | US-02: refused / no answer in time |
| AC-06 | US-02: not configured |
| AC-07 | US-03: list with price and limit, known family, voice filtering |
| AC-08 | US-03: shared values kept, voice fallback, Reset |
| AC-09 | US-03: unknown model, no voices |
| AC-10 | US-05: play or download a common audio file |
| AC-11, AC-12 | US-04: pricing branches |
| AC-13 | US-04: cost after saving |
| AC-14 | US-02: balance refreshed; N/A for the rest — recordings never appear on image screens (no image screen changes) |
| AC-15 | US-05: reuse, replace confirm, model no longer offered |
| AC-16 | US-05: delete branches |
| AC-17 | US-02: working, generate unavailable; US-01: in flight after navigating |
| AC-18 | US-06 |
| AC-19 | N/A — not a UI path (a foreign site's request is refused by the server) |
| AC-20 | US-02: audio arrived but not saved |

Out of scope (no UI): none. Every user story touches the Speech page.
