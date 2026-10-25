---
id: T7
title: "Speech page preset row: save, apply, modified, detach, rename, delete"
layer: "ui"
deps: ["T6"]
blocks: ["T9"]
acs: ["AC-01", "AC-02", "AC-03", "AC-05", "AC-06", "AC-07", "AC-09", "AC-10", "AC-14", "AC-15", "AC-19"]
files_hint: ["src/web/features/audio/presets/", "src/web/features/audio/useSpeechDraft.ts", "src/web/features/audio/SpeechPage.tsx", "src/web/features/audio/SpeechPresets.test.tsx"]
owner: "dmytro.hopko"
estimate: "M"
context_budget: "L"   # justified: one screen family; the ACs share one state machine
status: "todo"
step: ""
---

# T7 — Speech page preset row: save, apply, modified, detach, rename, delete

## Place in the sequence

- **Blocked by:** T6 · **Blocks:** T9.
- **Lane:** see files_hint overlaps.

## Why (user story)

> ### US-02: Apply a speaker
> 
> **As the** Owner
> **I want** to pick a saved preset on the Speech page and have its model, voice and settings applied at once
> **So that** I can record with it without setting every control again
>
> — `spec.md §4, US-02, verbatim`

## Inlined context

> SAD §4 items 8–10; screens.md SCR-01, SCR-02, SCR-03, SCR-07 (all states).
>
> — `sad.md §4/§6 + adr/, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read [spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/). Do not guess.

## Data delta

No DB changes. — `data-model.md, abridged`

## API contract

Calls listVoicePresets, createVoicePreset, updateVoicePreset, deleteVoicePreset, createRecording(presetId). — `contracts/openapi.yaml, abridged`

## Acceptance criteria

### AC-01 (US-01) — happy path

**Given** the Speech page shows a speech model, a voice (or the provider's default voice) and its voice settings, and no preset is applied
**When** the Owner chooses «Save», enters a name and confirms
**Then** a voice preset is kept on the machine with that name, the speech model, the voice and exactly the settings that model accepts (the ones the Speech page would send) — never the text; the preset becomes the applied one («<name>» shown, not «modified»), it appears in the Speech page's preset list and in Voices, and it is still there after a reload or a restart; the name field starts with a suggestion «<voice> · <model name>» the Owner may change
— `spec.md §5, AC-01, verbatim`

### AC-02 (US-01) — error

**Given** the Owner is naming a preset (saving a new one or renaming one)
**When** the name is empty after trimming, longer than 60 characters, or equal to another preset's name ignoring letter case (in any alphabet — «Диктор» and «диктор» clash) and surrounding spaces; length counts characters as the Owner sees them
**Then** nothing is saved and the dialog stays open saying respectively «Enter a name», «At most 60 characters» or «A voice named «<name>» already exists»; a name differing only in case from the preset's own current name is a valid rename; when the preset can't be saved for another reason the dialog says «Couldn't save — try again.» and keeps what was typed
— `spec.md §5, AC-02, verbatim`

### AC-03 (US-02) — happy path

**Given** the Owner has presets and the Speech page is open
**When** the Owner picks a preset from the Speech page's preset list
**Then** the form's speech model, voice and voice settings become the preset's at once, the text is left as it was, the preset is shown as applied, and the presets are listed by name (ignoring case); applying works even when the preset's model is hidden from the model list (it shows marked «Hidden», as for a reuse) and overrides whatever model Ukiyo picked by itself
— `spec.md §5, AC-03, verbatim`

### AC-05 (US-02, US-04) — domain invariant

**Given** a preset is applied
**When** the Owner changes the speech model, the voice or any voice setting (only the current values count, so changing a value and back restores plain «<name>»)
**Then** the Speech page shows the preset as «<name> · modified» while any value differs from the preset and as plain «<name>» again once every value equals it; a recording generated while it differs is saved with no preset link; a recording is linked only when the model, voice and settings sent equal the preset's at the moment Ukiyo receives the request — Ukiyo checks this itself, so a link never claims a setup the recording wasn't made with; «equal» means the same model, the same voice (the provider's default voice equals only the provider's default voice) and the settings sent — as the model accepts them, defaults filled in, delivery instructions trimmed, empty instructions meaning none — equal to the preset's stored settings exactly, so a setting the preset holds that the model no longer accepts counts as a difference (AC-10); «Detach» — an action next to the applied preset — removes the applied preset and leaves the form's values as they are; a preset that no longer exists stops being applied the same way
— `spec.md §5, AC-05, verbatim`

### AC-06 (US-03) — happy path

**Given** an applied preset is shown as modified
**When** the Owner chooses «Save»
**Then** Ukiyo offers «Update «<name>»» and «Save as new»; «Update» replaces the preset's model, voice and settings with the current ones, keeps its name and links, and leaves the preset applied and unchanged; «Save as new» asks for a name (AC-01, AC-02) and applies the new preset; past recordings of the updated preset keep the model, voice and settings they were made with; while a preset is applied and unchanged «Save» has nothing to save and is unavailable
— `spec.md §5, AC-06, verbatim`

### AC-07 (US-03) — happy path

**Given** the Owner has a preset
**When** the Owner renames it (from the Speech page's applied preset or from Voices) or deletes it after confirming «Delete «<name>»? Its N recordings are kept.»
**Then** a rename shows the new name everywhere the preset appears — the Speech page, Voices, its page, the recording details — without a reload; a deletion removes it from the preset list and Voices, an applied deleted preset stops being applied (the form keeps its values), its page then reads «This voice no longer exists.» with a way back to Voices, and every recording it made is still in the audio gallery, unchanged, with no preset named; when an update, rename or deletion can't be saved, nothing changes and the Owner is told «Couldn't save — try again.» (or «Couldn't delete — try again.»)
— `spec.md §5, AC-07, verbatim`

### AC-09 (US-02) — error

**Given** a preset whose speech model the provider no longer offers, or whose voice that model no longer lists among its voices
**When** the Owner sees it in the Speech page's preset list or in Voices
**Then** it is marked «No longer offered» and can't be applied (picking it does nothing but say «<model name> is no longer offered»), it can be renamed and deleted, its recordings stay listed on its page, and it applies again as before if the model and voice come back; when the speech model list can't be read the presets are listed but can't be applied until it loads
— `spec.md §5, AC-09, verbatim`

### AC-10 (US-02) — domain invariant

**Given** a preset holds a setting the speech model no longer accepts, or a value now outside the model's range
**When** the Owner applies it
**Then** the form shows only the settings the model accepts, brought into range, and the preset shows as «modified» until the Owner updates it — a preset is never silently changed by Ukiyo itself
— `spec.md §5, AC-10, verbatim`

### AC-14 (US-06) — cross-context

**Given** the Owner is on Voices or a preset's page
**When** the Owner chooses «Apply»
**Then** the Speech page opens with that preset applied and the text untouched (step 19's rule, audio-gallery AC-17: a request in flight is never swapped — «Wait for the current recording to finish, then apply.»); Back returns to where «Apply» was chosen; a preset that no longer exists or can't be applied leaves the form as it was and says why
— `spec.md §5, AC-14, verbatim`

### AC-15 (US-04) — cross-context

**Given** a recording linked to a preset
**When** the Owner reuses it (from recent recordings, the audio gallery, its dialog or its page)
**Then** its text, model, voice and settings are put back as step 18/19 describe and, if that preset still exists, can be applied (AC-09) and still equals what the recording was made with, the preset is applied too; otherwise no preset is applied (an updated, deleted or no longer offered preset is not re-applied); when the reuse itself isn't applied (the Owner keeps their unsent text, or a recording is in flight) no preset is applied either
— `spec.md §5, AC-15, verbatim`

### AC-19 (US-05, US-06) — error

**Given** the presets, a preset's page or its recordings can't be read
**When** the Owner opens Voices or a preset's page, or scrolls for more of its recordings
**Then** Voices says «Couldn't load your voices.» with «Try again»; a preset's page says «Couldn't load this voice.» with «Try again» (and «This voice no longer exists.» only when it was deleted); a failed further page says «Couldn't load more.» with «Try again» and keeps the cards already shown; on the Speech page an unreadable preset list says «Couldn't load your voices.» in the preset list and never blocks generating
— `spec.md §5, AC-19, verbatim`

## Definition of Done

SCR-01/02/03/07 built: PresetSelect + Save/Rename/Delete dialogs; useSpeechDraft.apply; applied/modified/detach; presetId sent only when unchanged; ?preset= arrival; reuse re-applies a matching preset; voice-presets invalidated after a recording; component tests per test-plan rows; gate green
