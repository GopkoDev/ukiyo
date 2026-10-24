# Tracker — text-to-speech

> Status of every task in the epic. `implement` updates **Status** and **Step** after every subagent it runs (and commits them with the task).
> Status: `todo` · `in_progress` · `blocked` · `review` · `done`.
> Step: `SELECT` · `RED` · `GREEN` · `REFACTOR` · `GATE` · `REVIEW` · `COMMIT` (`—` before the task starts).

| # | Task | Layer | Owner | Estimate | Blocked by | Status | Step |
|---|---|---|---|---|---|---|---|
| T1 | Promote migration 0012 and keep the prototype insert valid | migration | pipeline agent | S | — | done | COMMIT |
| T2 | Add the speech family spec map and the shared speech DTOs | domain | pipeline agent | M | — | done | COMMIT |
| T3 | Build the SpeechProvider port and the OpenRouter speech adapter | infra | pipeline agent | M | T2 | done | COMMIT |
| T4 | Wrap raw PCM as a WAV file | domain | pipeline agent | S | — | done | COMMIT |
| T5 | Give the file store single-file audio staging, trash and one combined boot sweep | infra | pipeline agent | M | — | done | COMMIT |
| T6 | Generalise cost sync over an injected repo and lookup | app | pipeline agent | S | — | done | COMMIT |
| T7 | Write the recordings repo over the rebuilt table | infra | pipeline agent | M | T1, T2 | done | COMMIT |
| T8 | Build the audio service: validate, speak, save atomically, track cost, delete | app | pipeline agent | L | T3, T4, T5, T6, T7 | done | COMMIT |
| T9 | Expose the audio contract, wire it in createApp and retire the prototype server code | ports | pipeline agent | M | T8 | todo | — |
| T10 | Group the navigation into Image and Audio and move Speech under /audio | ui | pipeline agent | S | — | todo | — |
| T11 | Show speech prices, estimates and recording costs honestly | ui | pipeline agent | S | T2 | todo | — |
| T12 | Build ModelSelect, VoiceSelect and descriptor-driven VoiceControls | ui | pipeline agent | M | T2 | todo | — |
| T13 | Rebuild the Speech page on the new contract | ui | pipeline agent | L | T9, T10, T11, T12 | todo | — |
| T14 | List recent recordings with reuse, delete and live pending costs | ui | pipeline agent | M | T13 | todo | — |
| T15 | Prove the audio NFRs and the image/audio separation | tests | pipeline agent | S | T9 | todo | — |
| T16 | Register the audio components in the design canon and the architecture map | docs | pipeline agent | S | T13, T14 | todo | — |

**Total:** 16 tasks, ~8 person-days.
