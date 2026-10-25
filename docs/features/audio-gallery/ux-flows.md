---
status: draft
feature_size: "M"
updated_at: "2026-10-25"
---

# UX flows — audio-gallery

> User flows for every UI-touching §4 user story of [spec.md](./spec.md). All six stories touch the UI.

## Platform decisions

- **Posture:** desktop-first, per [`design-system.md`](../../design-system.md), the same as the image gallery: the grid is two columns on a narrow window, three from `md` and four from `xl`; the dialog uses two columns from `lg`.
- **Navigation:** a new «Gallery» section in the Audio group, after Speech. A recording's own address is a sibling of the audio gallery's.
- **Modality:** the image gallery's pattern. A plain click on a card opens the recording in a dialog over the grid, and the address changes to the recording's. A direct visit to that address shows a full page. Reuse leaves the gallery for the Speech page; the dialog's history entry is replaced so Back lands on the grid.
- **Tool:** code mode — flows here, inline wireframes in `screens.md`.

## Screen inventory

| ID | Screen | Purpose | Entry | Exit |
|---|---|---|---|---|
| SCR-01 | Navigation bar | the Audio group lists Speech, then Gallery | always visible | any section |
| SCR-02 | Audio gallery — grid («All» or one model) | newest-first recording cards with a player, cost, text, model, voice, settings and tag badges, paging; empty / error / no-such-model states | Audio → Gallery; view switch; «Show all» | card → SCR-04; Reuse → SCR-08; view switch → SCR-03 |
| SCR-03 | Audio gallery — «By model» | one section per model: name, count, four latest cards, «Show all N» | view switch | card → SCR-04; «Show all N» → SCR-02 (one model) |
| SCR-04 | Recording dialog | player, download, full text, model, voice, all settings, times, billed characters, file type, cost; Newer / Older; Notes; Reuse; Delete | a card on SCR-02 or SCR-03 | close → SCR-02/SCR-03; Reuse → SCR-08; Delete → SCR-07 |
| SCR-05 | Recording page | the same details and actions as SCR-04, without stepping, with a way back to the gallery | the recording's address opened directly | back → SCR-02; Reuse → SCR-08; Delete → SCR-07 |
| SCR-06 | Notes card (in SCR-04 / SCR-05) | one comment (Save / Cancel) and tags | always part of SCR-04 / SCR-05 | stays |
| SCR-07 | Delete recording? (confirm) | deletion has no undo | Delete on SCR-04 / SCR-05 | confirm → neighbour in SCR-04, or SCR-02 with notice; cancel → back |
| SCR-08 | Speech page (step 18) | the form filled from the recording, the recording as the latest result; «Replace your text?» when unsent text differs | Reuse | stays |

## Flows

### Flow: US-01 — Browse every recording

```mermaid
flowchart TD
    A[SCR-01 Audio, Gallery] --> B{gallery readable?}
    B -->|no| C[SCR-02 Couldn't load the gallery, Retry]
    C -->|Retry| B
    B -->|no recordings| D[SCR-02 No recordings yet, link to Speech]
    D --> Q[SCR-08 Speech page]
    B -->|yes| E[SCR-02 grid, newest first]
    E -->|play a card| F[that card plays, any other player pauses]
    F -->|file missing| G[card shows Audio unavailable]
    E -->|scroll near the end or Load more| H{next page readable?}
    H -->|yes| E
    H -->|no| I[SCR-02 Couldn't load more, Try again]
    I -->|Try again| H
    E -->|last page loaded| J[SCR-02 That's everything]
    E -->|cost pending| K[card settles to known or unavailable within 10 s]
    E -->|recording made on Speech meanwhile| L[new card first in every open view]
```

The Owner opens Audio → Gallery. If the list can't be read, the page says so with Retry. With no recordings, it says «No recordings yet» and links to the Speech page. Otherwise the grid shows the newest recordings first. Playing a card pauses any other player in the tab; a card whose file is gone shows «Audio unavailable» once the Owner tries to play it. Scrolling near the end, or Load more, reads the next page. If that fails, «Couldn't load more» with Try again appears under the cards, with no automatic retry. After the last page the grid says that's everything. A pending cost settles on its card by itself, and a recording finished on the Speech page meanwhile appears first.

### Flow: US-02 — Open one recording

```mermaid
flowchart TD
    A[SCR-02 or SCR-03 card] -->|click| B[SCR-04 dialog over the grid, address names the recording]
    B -->|Newer or Older, arrow keys| C{busy: unsaved comment, typed tag, confirm open?}
    C -->|yes| D[stepping unavailable, Save or cancel your changes first]
    C -->|no| E{neighbour loaded?}
    E -->|yes| B
    E -->|no, more pages| F{next page readable?}
    F -->|yes| B
    F -->|no| G[SCR-04 Couldn't load the next one, Try again]
    B -->|Close, Esc or Back| H[grid where it was, last shown card in view]
    I[address opened directly] --> J{recording exists?}
    J -->|yes| K[SCR-05 recording page]
    J -->|no| L[This recording no longer exists, back to gallery]
    J -->|read failed| M[Couldn't load this recording, Try again]
    K -->|back| N[SCR-02 All]
```

A click on a card opens the dialog over the grid, and the address names the recording. Newer and Older (or ← →) step through the order the grid loaded; past the last loaded card, the next page is read first, and a failure keeps the dialog on the current recording with Try again. Stepping is unavailable while a comment is being edited, tag text is typed, or the delete confirmation is open. Arrow keys inside a text field or on the focused player never step. Close, Esc or Back returns to the grid with the last shown card in view. Opening the address directly shows the full page, or «This recording no longer exists», or «Couldn't load this recording» with Try again; its way back opens «All».

### Flow: US-03 — Label recordings

```mermaid
flowchart TD
    A[SCR-06 Notes in SCR-04 or SCR-05] -->|type a tag, Enter| B{tag valid and under 10?}
    B -->|no| C[field says why, text kept]
    B -->|yes| D[tag shown on the recording and its cards in every view]
    A -->|remove a tag| D
    A -->|Add comment or Edit| E[comment editor]
    E -->|Cancel or Esc| A
    E -->|Save| F{comment valid?}
    F -->|too long| G[editor says why, nothing saved]
    F -->|empty| H[comment removed]
    F -->|ok| I[comment shown, card gets a comment marker]
    B -->|recording deleted elsewhere| J[This recording no longer exists]
```

In the Notes card the Owner types a tag and presses Enter. An invalid tag, or an eleventh one, is refused with the reason and the typed text stays. A valid tag shows at once on the recording and on its card in every view. Removing a tag works the same way. «Add comment» or «Edit» opens the editor; Cancel or Esc closes it unchanged. Save with too long a text says why. Save with an empty text removes the comment, and a valid one is shown with a marker on the card. If the recording was deleted elsewhere meanwhile, the Owner sees that it no longer exists.

### Flow: US-04 — Remove a recording

```mermaid
flowchart TD
    A[SCR-04 or SCR-05] -->|Delete| B[SCR-07 Delete recording?]
    B -->|Cancel or Esc| A
    B -->|Delete| C{deleted?}
    C -->|failed| D[Couldn't delete this recording, recording intact]
    C -->|already gone| E[This recording no longer exists]
    C -->|yes, from SCR-04| F{neighbour in the order before deletion?}
    F -->|older or newer| G[SCR-04 shows it, Recording deleted.]
    F -->|none, or next page failed| H[SCR-02 or SCR-03 with Recording deleted.]
    C -->|yes, from SCR-05| I[SCR-02 with Recording deleted.]
    G --> J[card gone from every view and from the Speech page]
    H --> J
    I --> J
```

Delete opens the confirmation; Cancel or Esc returns. If the deletion fails, the recording stays complete and the page says «Couldn't delete this recording»; if it was already gone, it says so. In the dialog, the neighbour comes from the order as it was before: the next older one (reading the next page if needed), else the newer one, with «Recording deleted.». With no neighbour, or a failed next page, the dialog closes onto the view it came from with the notice. On the full page, the Owner lands on the gallery with the notice. In every case the card leaves every view and the Speech page's recent list and latest result.

### Flow: US-05 — Narrow to one speech model

```mermaid
flowchart TD
    A[SCR-02 All] -->|Choose a model| B{model list readable?}
    B -->|no| C[Couldn't load, Try again]
    B -->|yes| D[models by newest recording, with counts]
    D -->|pick one| E[SCR-02 one model, heading with count, Show all recordings]
    A -->|By model| F[SCR-03 sections by newest recording]
    F -->|Show all N| E
    F -->|card| G[SCR-04 steps within that model]
    E -->|card| G
    G -->|close| H[back to the view it came from]
    G -->|delete the model's last recording| I{came from}
    I -->|one model| J[SCR-02 No recordings with model, Show all recordings]
    I -->|By model| K[SCR-03 without that section]
    L[address with an unknown model] --> J
    E -->|Show all recordings| A
```

From «All», the model choice lists every model with recordings, ordered by its newest recording, with counts; if it can't be read, it says so with Try again. Picking one shows that model's grid with a heading, its count and «Show all recordings». «By model» shows a section per model; «Show all N» opens that model's grid. A card opened from either steps only through that model's recordings, and closing returns to where it was opened. Deleting a model's last recording closes onto the view: the model's grid then says «No recordings with <model>», and «By model» has no section for it. An address naming a model without recordings shows the same message.

### Flow: US-06 — Generate again from a recording

```mermaid
flowchart TD
    A[card on SCR-02 or SCR-03, or SCR-04, SCR-05] -->|Reuse| B[SCR-08 Speech page]
    B --> C{model list loaded?}
    C -->|failed| D[Speech says the models couldn't load, Try again, form unchanged]
    C -->|yes| E{recording being generated?}
    E -->|yes| F[wait for the current request, form unchanged]
    E -->|no| G{unsent text differs?}
    G -->|yes| H[Replace your text?]
    H -->|Keep mine| I[form and latest result unchanged]
    H -->|Replace| J{model still offered?}
    G -->|no| J
    J -->|yes| K[form filled, recording as latest result]
    J -->|no| L[text, voice, accepted settings filled, current model kept, notice]
    K -->|Back| M[SCR-02 grid, not the dialog]
```

Reuse from a card, the dialog or the page opens the Speech page. Once its model list is known, the reuse is applied. If the list can't be loaded, the page says so with Try again and the form stays as it was. While a recording is being generated, the page asks the Owner to wait and changes nothing. Unsent text that differs from the recording's triggers «Replace your text?»; «Keep mine» leaves the form and the latest result alone. Otherwise the form gets the text, model, voice and settings, and the recording becomes the latest result. A model that is no longer offered keeps the current model, with a notice, and the rest is still filled in. Back from the Speech page returns to the grid, not to the closed dialog.

## AC coverage

| AC | Shown by | Notes |
|---|---|---|
| AC-01 | Flow US-01 → grid, paging, That's everything | card contents detailed in screens |
| AC-02 | Flow US-01 → play a card | section leave / dialog pause are app-wide, noted in screens |
| AC-03 | Flow US-01 → error, empty, Audio unavailable branches | |
| AC-04 | Flow US-01 → cost pending | |
| AC-05 | Flow US-02 → dialog, stepping, next page failure, close | |
| AC-06 | Flow US-02 → address opened directly | image addresses unchanged: AC-20 |
| AC-07 | Flow US-03 → tag and comment happy branches | |
| AC-08 | Flow US-03 → refusal branches, deleted elsewhere | |
| AC-09 | Flow US-02 → busy branch | Close / Back / Reuse drop unsaved edits (not blocked) |
| AC-10 | N/A: storage rule, nothing to navigate | covered by integration tests |
| AC-11 | Flow US-04 → deletion branches | |
| AC-12 | Flow US-04 → failed / already gone | |
| AC-13 | Flow US-05 → Choose a model | |
| AC-14 | Flow US-05 → By model | |
| AC-15 | Flow US-05 → unknown model / last deleted | |
| AC-16 | Flow US-06 → Reuse happy path, Back | |
| AC-17 | Flow US-06 → replace, retired model, loading, in-flight | |
| AC-18 | Flow US-01 → new card; Flow US-04 → card gone everywhere | |
| AC-19 | N/A: requests from other sites, no Owner flow | integration test |
| AC-20 | N/A: image gallery regression guard | existing image suites |
| AC-21 | Flow US-05 → counts, sections; Flow US-01 → paging | invariant checked by tests |
