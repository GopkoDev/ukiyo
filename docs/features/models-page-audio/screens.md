---
status: Draft
updated_at: "2026-10-25"
feature_size: "M"
tool: code
---

# Screens — models-page-audio

Reuse-first: shadcn `Tabs`, `Card`, `Table`, `Badge`, `Button`, `Switch`, `Tooltip` (all in `src/web/components/ui/`); the step-10 Row cells and «No longer offered» block; step 18's `ModelSelect`. No new primitive.

## SCR-01 / SCR-02 — Models page with tabs

```
Models
[ Image | Audio ]                      ← Tabs; value from the address (?tab=audio), changing it pushes history
```

**Image (SCR-01):** the step-10 body (one card per provider) — unchanged.

**Audio (SCR-02):**

```
┌ OpenRouter · 14 speech models ───────────────────────────────────────────────────────────────┐
│ Name                Maker       Price            Character limit              Voices          Controls                       ★   Show in picker │
│ Eleven v3           ElevenLabs  $0.08 / 1K chars 5 000 chars                   21 voices       stability, similarity, …       ☆   (on)           │
│ elevenlabs/eleven-v3                                                                                                                         │
│ GPT-4o mini TTS     OpenAI      priced per token 2 000 chars · limit not publ. 11 voices       speed, instructions            ★   (on)           │
│ Some model [Hidden] Acme        price unknown    4 096 chars                   provider default —                              ☆   (off) dimmed  │
│                                                                                                                              │
│ No longer offered                                                                                                            │
│ retired/tts  [Favorite] [Hidden]  Forget                                                                                     │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| State | Shows |
|---|---|
| loading | «Loading speech models…» |
| not configured | «OpenRouter isn't configured — add its key to .env.local.» |
| catalog error | «Couldn't load the speech models.» + Try again |
| empty | «No speech models.» |
| prefs unreadable | table + «Favorites and hidden models couldn't be loaded.», toggles disabled, no «No longer offered» |
| save failed | row: «Couldn't save — try again.» (role alert), toggle reverted |
| forget failed | entry: «Couldn't forget — try again.» |

## SCR-03 — Speech model list

```
[ Eleven v3                ▾ ]
 Favorites
   GPT-4o mini TTS   priced per token · 2 000 chars
 ElevenLabs
   Eleven v2 [Hidden] … (only while selected, top of its group)
   Eleven v3   $0.08 / 1K chars · 5 000 chars
 OpenAI
   …
```

## SCR-04 — Navigation bar balances

Sidebar footer, above the theme toggle / server badge; hidden in the collapsed icon rail.

```
Balance
OpenRouter         $12.34
Vercel AI Gateway  —        (tooltip: Balance unavailable)
```

| State | Shows |
|---|---|
| first read | «…» |
| ok | `$` two decimals, tabular numbers |
| failed | «—» + tooltip «Balance unavailable» |
| none configured | block hidden |

Speech page footer line: «$12.34 credits remaining» from the same OpenRouter entry (hidden when null).
