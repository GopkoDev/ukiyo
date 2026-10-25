---
status: Draft
owner: "dmytro.hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-25"
feature_size: "M"
---

# Spec — voice-presets

> **Glossary:** [CONTEXT](../../../CONTEXT.md)
> **Reference module / docs / channels used:** [`docs/roadmap.md`](../../roadmap.md) step 21 (owner request, audio epic — the last step); step 18 [`text-to-speech`](../text-to-speech/spec.md) (the Speech form, reuse, «no longer offered»); step 19 [`audio-gallery`](../audio-gallery/spec.md) (recording cards, the dialog with ← →, deletion); step 20 [`models-page-audio`](../models-page-audio/spec.md) (hidden speech models, the automatic pick, balances); the code in `src/web/features/audio/` and `src/server/modules/audio/`.

## 1. Context

The Owner keeps returning to the same few speakers: one voice of one speech model with the speed, stability or delivery instructions they tuned for it. Today the only way to get such a speaker back is to find an old recording and press «Reuse», which also replaces the text, or to set model, voice and every control again by hand. Nothing tells the Owner which recordings were made with which speaker, how often a speaker is used or what it has cost.

The trigger is the owner's audio epic (roadmap steps 18–21): this is its last step. Step 18 records the model, voice and settings each recording was made with; step 19 gives recordings a gallery with cards and a stepping dialog; step 20 lets the Owner hide speech models. This step builds on all three.

Committed approach: a **voice preset** is a named, saved speaker setup — speech model, voice and voice settings, never the text. On the Speech page a «Save» action stores the current setup under a name; a preset list applies one in one click; an applied preset that the Owner then edits shows as «modified», and saving it offers «Update preset» or «Save as new». Every recording made while a preset is applied and unchanged is linked to that preset. A new «Voices» section in the Audio group lists the presets with their use and cost, and a preset's own page shows its recordings with the audio gallery's cards and dialog. The presets live on the Owner's machine only.

- Decision (owner, 2026-10-25): a recording is linked to a preset only when what was sent equals the preset at that moment; any edit after applying detaches the link. Deleting a preset never deletes its recordings — they keep what they were made with and only lose the link. Recordings made before this step stay unlinked.
- Decision (owner, 2026-10-25): updating a preset never changes its past recordings; they keep what was actually sent.
- Decision (owner, 2026-10-25): a preset name is 1–60 characters after trimming and unique regardless of letter case.
- Decision (owner, 2026-10-25): a preset whose speech model is no longer offered stays listed as «No longer offered»; it can't be applied, it can be deleted.
- Decision (owner, 2026-10-25): the Audio group lists Speech, Gallery, Voices, Models; Voices is its own section with its own address, and each preset has its own address.
- Failure modes weighed before the AC (devil's-advocate pass): a preset changed or deleted while a paid recording is in flight (AC-18); a catalog change that makes «Apply» rewrite values (AC-09, AC-10); setups that mean the same but are written differently and so never link (AC-05); a total that counts unknown costs as zero (AC-12); counts that miss a deletion elsewhere (AC-16); a preset page whose cards differ from its current setup after an update (AC-13); «no longer offered» confused with «couldn't load» or «hidden» (AC-03, AC-09); look-alike names in a non-Latin alphabet (AC-02).

## 2. Goals

- The Owner gets a saved speaker back on the Speech page in one click, without touching the text.
- The Owner can see, per speaker, which recordings it made, how many, what they cost in total and when it was last used.
- A recording's link to a preset is always truthful: it says the recording was made exactly with that preset.

## 3. Non-goals

- Storing text, or a text template, in a preset — the owner asked for the speaker only.
- Sharing, exporting or importing presets — Ukiyo is one person on one machine.
- Linking existing recordings to presets, by hand or automatically — owner decision (no backfill).
- Re-linking a recording to a different preset, or making a recording from several presets.
- Presets for image models — this step is audio only.
- Tags, comments, folders or ★ on presets — the owner asked for name, use and cost only.
- Previewing a preset's voice without generating (a free sample) — every recording is a paid request.

## 4. User stories

### US-01: Save a speaker

**As the** Owner
**I want** to save the model, voice and settings on the Speech page under a name
**So that** I can get exactly this speaker back later

### US-02: Apply a speaker

**As the** Owner
**I want** to pick a saved preset on the Speech page and have its model, voice and settings applied at once
**So that** I can record with it without setting every control again

### US-03: Keep presets tidy

**As the** Owner
**I want** to update, rename and delete my presets
**So that** the list stays short and every name still says what the speaker is

### US-04: Know which recordings a preset made

**As the** Owner
**I want** every recording made with an applied, unchanged preset to be linked to it
**So that** I can tell later which speaker made which recording

### US-05: Review my speakers

**As the** Owner
**I want** a Voices section listing every preset with its model, voice, settings, number of recordings, total cost and last use
**So that** I can see which speakers I use and what they cost

### US-06: Listen to one speaker's recordings

**As the** Owner
**I want** to open a preset and browse all its recordings, and apply it from there
**So that** I can compare its recordings and record with it again

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** the Speech page shows a speech model, a voice (or the provider's default voice) and its voice settings, and no preset is applied
**When** the Owner chooses «Save», enters a name and confirms
**Then** a voice preset is kept on the machine with that name, the speech model, the voice and exactly the settings that model accepts (the ones the Speech page would send) — never the text; the preset becomes the applied one («<name>» shown, not «modified»), it appears in the Speech page's preset list and in Voices, and it is still there after a reload or a restart; the name field starts with a suggestion «<voice> · <model name>» the Owner may change

### AC-02 (US-01) — error

**Given** the Owner is naming a preset (saving a new one or renaming one)
**When** the name is empty after trimming, longer than 60 characters, or equal to another preset's name ignoring letter case (in any alphabet — «Диктор» and «диктор» clash) and surrounding spaces; length counts characters as the Owner sees them
**Then** nothing is saved and the dialog stays open saying respectively «Enter a name», «At most 60 characters» or «A voice named «<name>» already exists»; a name differing only in case from the preset's own current name is a valid rename; when the preset can't be saved for another reason the dialog says «Couldn't save — try again.» and keeps what was typed

### AC-03 (US-02) — happy path

**Given** the Owner has presets and the Speech page is open
**When** the Owner picks a preset from the Speech page's preset list
**Then** the form's speech model, voice and voice settings become the preset's at once, the text is left as it was, the preset is shown as applied, and the presets are listed by name (ignoring case); applying works even when the preset's model is hidden from the model list (it shows marked «Hidden», as for a reuse) and overrides whatever model Ukiyo picked by itself

### AC-04 (US-04) — happy path

**Given** a preset is applied and unchanged
**When** the Owner generates a recording
**Then** the recording is saved linked to that preset; its detail (dialog and page) names the preset with a way to open the preset's page; the preset's count, total and last use include it as soon as the recording is saved

### AC-05 (US-02, US-04) — domain invariant

**Given** a preset is applied
**When** the Owner changes the speech model, the voice or any voice setting (only the current values count, so changing a value and back restores plain «<name>»)
**Then** the Speech page shows the preset as «<name> · modified» while any value differs from the preset and as plain «<name>» again once every value equals it; a recording generated while it differs is saved with no preset link; a recording is linked only when the model, voice and settings sent equal the preset's at the moment Ukiyo receives the request — Ukiyo checks this itself, so a link never claims a setup the recording wasn't made with; «equal» means the same model, the same voice (the provider's default voice equals only the provider's default voice) and the settings sent — as the model accepts them, defaults filled in, delivery instructions trimmed, empty instructions meaning none — equal to the preset's stored settings exactly, so a setting the preset holds that the model no longer accepts counts as a difference (AC-10); «Detach» — an action next to the applied preset — removes the applied preset and leaves the form's values as they are; a preset that no longer exists stops being applied the same way

### AC-06 (US-03) — happy path

**Given** an applied preset is shown as modified
**When** the Owner chooses «Save»
**Then** Ukiyo offers «Update «<name>»» and «Save as new»; «Update» replaces the preset's model, voice and settings with the current ones, keeps its name and links, and leaves the preset applied and unchanged; «Save as new» asks for a name (AC-01, AC-02) and applies the new preset; past recordings of the updated preset keep the model, voice and settings they were made with; while a preset is applied and unchanged «Save» has nothing to save and is unavailable

### AC-07 (US-03) — happy path

**Given** the Owner has a preset
**When** the Owner renames it (from the Speech page's applied preset or from Voices) or deletes it after confirming «Delete «<name>»? Its N recordings are kept.»
**Then** a rename shows the new name everywhere the preset appears — the Speech page, Voices, its page, the recording details — without a reload; a deletion removes it from the preset list and Voices, an applied deleted preset stops being applied (the form keeps its values), its page then reads «This voice no longer exists.» with a way back to Voices, and every recording it made is still in the audio gallery, unchanged, with no preset named; when an update, rename or deletion can't be saved, nothing changes and the Owner is told «Couldn't save — try again.» (or «Couldn't delete — try again.»)

### AC-08 (US-03) — domain invariant

**Given** a preset with recordings is deleted
**When** the Owner looks at those recordings anywhere (audio gallery, recent recordings, a recording's dialog or page)
**Then** each recording still plays and still shows its own text, model, voice, settings and cost; nothing about it changed except that no preset is named

### AC-09 (US-02) — error

**Given** a preset whose speech model the provider no longer offers, or whose voice that model no longer lists among its voices
**When** the Owner sees it in the Speech page's preset list or in Voices
**Then** it is marked «No longer offered» and can't be applied (picking it does nothing but say «<model name> is no longer offered»), it can be renamed and deleted, its recordings stay listed on its page, and it applies again as before if the model and voice come back; when the speech model list can't be read the presets are listed but can't be applied until it loads

### AC-10 (US-02) — domain invariant

**Given** a preset holds a setting the speech model no longer accepts, or a value now outside the model's range
**When** the Owner applies it
**Then** the form shows only the settings the model accepts, brought into range, and the preset shows as «modified» until the Owner updates it — a preset is never silently changed by Ukiyo itself

### AC-11 (US-05) — happy path

**Given** the Owner has presets
**When** the Owner opens Voices from the Audio group of the navigation bar
**Then** the page lists every preset by name (ignoring case) with: its name, its speech model's name, its voice («Provider default» for the provider's default voice), its settings as the gallery cards show them («speed 1.1», «speaker boost»…), its number of recordings («3 recordings», «No recordings yet»), its total cost and its last use — when its newest existing recording was made («2 h ago»), «Never used» when it has none; the navigation's Audio group lists Speech, Gallery, Voices, Models in that order and marks Voices as current, on the list and on a preset's page

### AC-12 (US-05) — domain invariant

**Given** a preset's recordings have known, pending and unavailable costs
**When** the Owner reads the preset's total cost
**Then** it is the sum of the known costs only, with what is missing named: «$0.42», «$0.42 + 1 pending», «$0.42 · 2 without a price», «$0.42 + 1 pending · 2 without a price»; with no known cost the sum reads «—» followed by the same counts («— + 1 pending»), and «—» alone only when the preset has no recordings; an unknown cost is never counted as zero and a recording's up-front estimate never enters the total; a pending cost that settles is reflected the next time the list or the page is read

### AC-13 (US-06) — happy path

**Given** a preset has recordings
**When** the Owner opens it from Voices
**Then** its page (an address of its own that a reload or a copied link opens again) shows the preset's name, model, voice, settings, count, total and last use with «Apply», «Rename» and «Delete», and below them a newest-first grid of exactly its recordings in the audio gallery's cards, loading more as the Owner scrolls; each card shows the model, voice and settings that recording was actually made with (recordings made before an update may differ from the preset's current setup); opening a card shows the recording dialog over this grid, ← → step through this preset's recordings only, Back closes the dialog and returns to the preset's page at the same scroll; with no recordings the page reads «No recordings with this voice yet.» with «Apply»

### AC-14 (US-06) — cross-context

**Given** the Owner is on Voices or a preset's page
**When** the Owner chooses «Apply»
**Then** the Speech page opens with that preset applied and the text untouched (step 19's rule, audio-gallery AC-17: a request in flight is never swapped — «Wait for the current recording to finish, then apply.»); Back returns to where «Apply» was chosen; a preset that no longer exists or can't be applied leaves the form as it was and says why

### AC-15 (US-04) — cross-context

**Given** a recording linked to a preset
**When** the Owner reuses it (from recent recordings, the audio gallery, its dialog or its page)
**Then** its text, model, voice and settings are put back as step 18/19 describe and, if that preset still exists, can be applied (AC-09) and still equals what the recording was made with, the preset is applied too; otherwise no preset is applied (an updated, deleted or no longer offered preset is not re-applied); when the reuse itself isn't applied (the Owner keeps their unsent text, or a recording is in flight) no preset is applied either

### AC-16 (US-05) — cross-context

**Given** a preset's recording is deleted, or a new one is made, anywhere in Ukiyo
**When** the Owner looks at Voices or the preset's page without reloading
**Then** the count, the total and the last use match the recordings that exist, and a deleted recording's card is gone from the preset's grid; deleting a recording never deletes or changes a preset beyond its count, total and last use; the deleted recording's dialog steps to its neighbour within the preset's recordings as the gallery's does

### AC-17 (US-01, US-02, US-03, US-04, US-05, US-06) — authorization

**Given** a page from another site is open in the Owner's browser
**When** it tries to read, create, change or delete a voice preset, or to generate a recording linked to one
**Then** Ukiyo refuses it like every other Ukiyo request and nothing changes

### AC-18 (US-04) — cross-context

**Given** a recording is being generated with a preset applied
**When** the Owner updates, renames or deletes that preset before the recording arrives
**Then** the recording is still saved (a paid recording is never lost because of a preset change); it is linked when the preset still exists and its setup at the moment Ukiyo received the request equalled what was sent, and unlinked when the preset was deleted before the recording was saved

### AC-19 (US-05, US-06) — error

**Given** the presets, a preset's page or its recordings can't be read
**When** the Owner opens Voices or a preset's page, or scrolls for more of its recordings
**Then** Voices says «Couldn't load your voices.» with «Try again»; a preset's page says «Couldn't load this voice.» with «Try again» (and «This voice no longer exists.» only when it was deleted); a failed further page says «Couldn't load more.» with «Try again» and keeps the cards already shown; on the Speech page an unreadable preset list says «Couldn't load your voices.» in the preset list and never blocks generating

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Voices list | the list with every preset's count, total and last use ≤ 100 ms p95 server time for 200 presets and 5 000 recordings, without any provider call | integration timing test |
| Preset page grid | one page of a preset's recordings ≤ 100 ms p95 server time with 5 000 recordings | integration timing test |
| Preset changes | save, update, rename, delete each ≤ 50 ms p95 server time, never waiting on the provider | integration timing test |
| Apply | applying a preset updates the Speech form within one frame of the pick, with no request to the server beyond the already loaded preset list | component test counting requests |
| Link check | checking a recording's link adds no provider call and no visible delay to generating | integration test |
| Migration safety | the new storage applies on top of the Owner's current database without changing or deleting any existing recording, tag or comment; existing recordings read as unlinked | migration test + ship check on a copy of the Owner's data |

## 6.1 Security / privacy

- **Data classification:** internal — preset names and speaker settings of the Owner's own recordings; nothing leaves the machine. A preset is never sent to a provider; only the model, voice and settings it fills in are, as before.
- **Personal data touched:** none new. A preset name is the Owner's own free text, shown back escaped like a comment.
- **AuthZ/AuthN impact:** no new roles. Preset reads and changes and the linked generation are covered by the same same-origin rule as every other Ukiyo request (AC-17).
- **Abuse cases:**
  - A foreign site creates, renames or deletes presets: refused, nothing changes (AC-17).
  - A request claims a link to a preset with a different setup: the recording is saved unlinked (AC-05) — a link can't be forged into the history.
  - A request names a preset that doesn't exist: the recording is saved unlinked rather than failing a paid request.
  - A crafted name (markup, very long text): limited to 60 characters and shown as text, never as markup.
- **Security review:** Not required beyond the standard review — no new key use, no new outbound call.

## 7. Metrics / KPIs

- **Presets in use** — baseline: 0 presets; target: the Owner has ≥ 2 presets within 7 days of shipping.
- **Linked recordings** — baseline: 0 % of new recordings linked; target: ≥ 50 % of the recordings made in the 14 days after shipping are linked to a preset.
- **Truthful links** — baseline: n/a; target: 0 recordings whose link names a preset setup they were not made with (ship check: a linked and a detached recording on the real app).

## 8. Open questions

None open. Settled while specifying (owner decisions 2026-10-25, or taken as the default — see the ASSUMED list in the run report):

- [x] Is a link checked by Ukiyo or trusted from the page? **Checked** (AC-05): a request naming a preset with a different setup, or a deleted one, is saved unlinked — never refused, because the request is paid.
- [x] Order of presets? **By name, ignoring case**, in both the Speech page list and Voices (assumed — names are what the Owner picks by).
- [x] Where are rename and delete? **Both** the Speech page (applied preset) and Voices / the preset page (assumed).
- [x] Does a reused linked recording re-apply its preset? **Yes, only if the preset still equals the recording's setup** (AC-15, assumed).
- [x] A preset whose voice (not model) is gone? **Treated like a gone model** — «No longer offered» (AC-09, assumed).
- [x] Total cost wording? **Known costs only, with pending / without-a-price counts** (AC-12, assumed — the cost-status rule of steps 18–19).
- [x] Is a recording card marked with its preset? **No** — the preset is named in the recording's dialog and page (AC-04, assumed; the card stays as in step 19).
