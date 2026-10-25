# API sync report — voice-presets

## Field origins

| Path | Origin | Confidence |
|---|---|---|
| VoicePreset.id / name / provider / model / modelName / voice / settings / createdAt / updatedAt | `voice_presets` columns (data-model.md) | high |
| VoicePreset.stats.* | access pattern «list presets with stats» (computed, sad §4 item 4) | high |
| PresetName rules | spec AC-02, sad §4 item 3 (graphemes, `name_key`) | high |
| StartSpeechRequest.presetId | sad §4 item 2, ADR-0058 | high |
| Recording.preset | `voice_preset_recordings` join (data-model «presets of a page of recordings») | high |
| GET /audio/recordings `preset` | access pattern «a preset's recordings» (sad §4 item 5) | high |

## Drift checklist

| Check | Result |
|---|---|
| data-model ↔ contract | every `voice_presets` column ↔ `VoicePreset`; no field without origin ✅ |
| error codes ↔ `src/server/lib/errors.ts` | only existing codes (name clash = `VALIDATION_ERROR` `fields.name`, no new code) ✅ |
| validation ↔ constraints | model ≤ 100, voice ≤ 100, name 1–60 graphemes (DB cap 240) ✅ |
| sad §6.1 ↔ POST /audio/recordings | unknown / different / deleted preset → 201 unlinked, never an error ✅ |
| sad §6.2 ↔ presets | catalog read only for a setup change (400/409/502); rename never reads it; delete cascades links ✅ |
| sad §6.3 ↔ list/preset filter | stats on list and get; `preset` filter cursor by id ✅ |
| spec AC-17 | request guard on every route (403) ✅ |

## Back-feed

- Every §5 AC with a server side maps to an operation: AC-01/02 create; AC-06/07 update/delete; AC-04/05/18 createRecording; AC-11/12 list; AC-13/16 recordings `preset` + get; AC-17 all. AC-03, AC-09, AC-10, AC-14, AC-15, AC-19 are browser-side (they consume the above).
- No sequence gaps found.
