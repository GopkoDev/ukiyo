# Tracker — audio-gallery

> Status of every task in the epic. `implement` updates **Status** and **Step** after every
> subagent it runs (and commits them with the task), so this table shows where the run is right now.
> Status: `todo` · `in_progress` · `blocked` · `review` · `done`.
> Step: `SELECT` · `RED` · `GREEN` · `REFACTOR` · `GATE` · `REVIEW` · `COMMIT` (`—` before the task starts).

| # | Task | Layer | Owner | Estimate | Blocked by | Status | Step |
|---|---|---|---|---|---|---|---|
| T1 | Promote the audio curation migrations and test them on prototype-shaped data | migration | agent | S | — | done | COMMIT |
| T2 | Add model filter, model groups, stored names and tag/comment statements to the recordings repo | infra | agent | M | T1 | done | COMMIT |
| T3 | Expose model filter, model groups and curation through the audio service, routes and shared schemas | ports | agent | M | T2 | done | COMMIT |
| T4 | Add the audio gallery's server timing tests | tests | agent | S | T3 | done | COMMIT |
| T5 | Extract the media-neutral gallery primitives into a shared media-gallery layer | ui | agent | S | — | done | COMMIT |
| T6 | Extract the dialog stepping engine and frame from the image dialog | ui | agent | M | T5 | todo | — |
| T7 | Extract the notes card from the image Notes | ui | agent | S | T5 | todo | — |
| T8 | Add the recording detail route and let sections own their detail renderers | wiring | agent | M | — | todo | — |
| T9 | Coordinate playback app-wide so one recording plays at a time | ui | agent | S | T8 | todo | — |
| T10 | Add the audio gallery's API client, view parsing, query keys and cache patching | ui | agent | M | T3 | todo | — |
| T11 | Build the Audio → Gallery section: grid, recording card, model choice and states | ui | agent | M | T5, T8, T9, T10 | todo | — |
| T12 | Build the audio «By model» overview | ui | agent | S | T11 | todo | — |
| T13 | Build the recording dialog and page with notes, details and delete | ui | agent | M | T6, T7, T11 | todo | — |
| T14 | Hand Reuse from the gallery to the Speech page | ui | agent | M | T10, T13 | todo | — |
| T15 | Prove cross-section coherence and the request budgets | tests | agent | S | T12, T13, T14 | todo | — |
| T16 | Register the new components and update the architecture map | docs | agent | S | T15 | todo | — |

**Total:** 16 tasks, ~7 person-days.
