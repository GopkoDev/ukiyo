---
status: Draft
updated_at: "2026-10-25"
feature_size: "M"
---

# Test plan — text-to-speech

## Test plan

Levels: unit · integration · component · contract · load (+ e2e-through-UI). Integration means the real app over a real SQLite file in a throwaway temp data dir (`createTestApp`), with provider HTTP answered from recorded fixtures. Component means a web component rendered in isolation in a simulated DOM, with a mocked typed API client. There is no browser-driven e2e harness in the repo, so the e2e-through-UI paths from `ux-flows.md` are walked by hand at ship against a copy of the owner's data. That is the only manual level.

### AC → tests

| AC | Test | Level |
|---|---|---|
| AC-01 | sidebar renders «Image» then «Audio» groups with entries in registry order; current entry marked in its group | component |
| AC-01 | the former Speech address replaces itself with the Audio address and shows Speech; image addresses resolve as before | unit (sectionFor/aliases) + component |
| AC-02 | Speech page stays mounted: text and settings survive moving to Gallery and back; an in-flight generation still shows «Generating…» on return; a finished one shows as the latest result; a failed one shows its error | component |
| AC-03 | generating saves a recording: row with text, model, model name, voice, sent settings, billed characters, estimate, generation id; file under audio/; answer is the recording | integration |
| AC-03 | after generating, the result shows the player (autoplay), voice, model, time, cost, download; the recording is first in Recent | component |
| AC-04 | blank or whitespace-only text and text over the model limit → generate disabled, counter in warning colour | component |
| AC-04 | the server refuses empty text, an unknown model, and text over the model's limit with the reason «<name> takes at most N characters»; nothing is sent to the provider | integration |
| AC-05 | provider refusal (402 fixture) → plain message with the provider's reason, no row, no file | integration |
| AC-05 | provider timeout → message says it may still be charged; no row, no file | integration |
| AC-05 | an empty audio answer → provider error, no row | integration |
| AC-05 | an error message is shown and the form is kept | component |
| AC-06 | no key → credits and generate are refused as «not configured»; the page shows how to configure it and disables generate | integration + component |
| AC-07 | spec map: ElevenLabs ids get their controls, ranges and limits; Gemini/OpenAI/Fish get delivery instructions; speed only where honoured; PCM/mp3 format per family; makers grouped ElevenLabs first | unit |
| AC-07 | listing speech models over the full recorded catalog (36 models) returns every model, with controls, voices, limit, price unit and maker | integration |
| AC-07 | only the chosen model's controls render; the model list is grouped by maker with price and limit; voice filter appears above 20 voices | component |
| AC-08 | settingsFor keeps only accepted keys, clamps shared values into the new range, and fills defaults | unit |
| AC-08 | the request carries only the model's accepted settings (ElevenLabs voice_settings for ElevenLabs only, speed and instructions only where declared), and the row records exactly those | integration |
| AC-08 | switching model keeps the text, keeps the voice if offered (else the first voice or provider default); Reset restores the controls but not the voice or text | component |
| AC-09 | an unknown model gets voice + text only; the limit comes from family, then catalog, then 5 000 «not published» | unit |
| AC-09 | a model without voices generates with no voice sent and records «provider default»; a typed voice name is sent and recorded | integration + component |
| AC-10 | PCM bytes with rate/channels become a valid WAV header + same samples; the 24 kHz mono default applies | unit |
| AC-10 | a PCM-only model is asked for pcm and saved as audio/wav; mp3 is kept as audio/mpeg; the file is served with its type | integration |
| AC-10 | a failure inside the save (commit throws) leaves no row and no file; a crash after staging is swept on restart | integration |
| AC-11 | billedChars = code points of the trimmed text (emoji sequences count per code point); the estimate is chars × price; amounts show two significant digits, «< $0.0001», and «Free» for a zero price | unit |
| AC-11 | the estimate updates while typing | component |
| AC-12 | per-second, per-token and unknown prices show their wording, never «$0» or «Free» | unit + component |
| AC-13 | after save the cost is pending (generation id), known (stated) or unavailable (no id); the lookup resolves pending to known; no report by the deadline → unavailable; lookups resume after restart; prototype rows are never looked up | integration |
| AC-13 | the cost-sync schedule is unchanged for images (existing tests stay green) and drives recordings with the same bounds | unit |
| AC-13 | a pending recording shows «cost pending · ≈ $x» and turns into the amount after a refresh, without reload; unavailable keeps «≈ $x» | component |
| AC-14 | the credit balance refreshes after a generation | component |
| AC-14 | recordings never appear in the generations list, the recent generations or the image cost history | integration |
| AC-15 | Recent lists the ten latest newest first, each with player, excerpt, voice, model, time, cost, download; reuse fills the form; differing unsent text asks first; a model no longer offered keeps the current model and fills the text and accepted settings | component |
| AC-15 | the list returns the ten latest with model name (fallback to the catalog name / id) and paging cursor | integration |
| AC-16 | delete removes the row and the file together; a failed delete transaction restores the file and keeps the row; an interrupted delete is restored on restart; the pending lookup is cancelled | integration |
| AC-16 | the delete confirmation, the busy state and the failure message | component |
| AC-17 | the generate button stays disabled while a request is in flight, also after navigating away and back; one click sends one request | component |
| AC-18 | migration 0012 on a prototype-shaped DB: every row kept, amount → known, no amount → unavailable, voices kept; rollback restores the 0011 shape with the same rows | integration |
| AC-18 | prototype recordings list and play after the upgrade (their file is served) | integration |
| AC-19 | a foreign origin is refused on every audio route; no key in answers, rows or the stored settings | integration |
| AC-20 | the audio arrived but the save failed (staging write throws, or PCM conversion fails) → «couldn't be saved — may still charge», no row, no stray file | integration + component |

### Contract

| Boundary | Test | Level |
|---|---|---|
| server ↔ web | every audio route answer parses with the shared zod schema the web client uses (`Recording`, `RecordingPage`, `SpeechModelsResponse`, `CreditsResponse`, error envelope) | contract (inside the integration tests) |
| adapter ↔ OpenRouter | request bodies built per family match the recorded fixtures (model, input, voice, response_format, speed, instructions, provider.options) | contract (adapter unit tests) |

### Edge cases

- Text exactly at the limit is accepted; limit + 1 is refused.
- A voice listed by the model but containing a colon (MAI-Voice `en-US-Harper:MAI-Voice-2`) round-trips unchanged.
- A catalog fetch fails: the model list shows «Couldn't load speech models»; a second request after the failure retries (no poisoned cache).
- Deleting an id that doesn't exist → not found.
- A file request for a recording whose file is missing → not found, not a crash.

## Integration strategy

- **Dependency:** a real SQLite file in a fresh temp data dir per test (`tests/helpers/test-app.ts`), migrated like on boot; thrown away in `cleanup()`. No mocked datastore.
- **Provider HTTP:** the `fetch` injected into `createApp`, answered from recorded fixtures in `tests/fixtures/openrouter/`: the live speech catalog recorded 2026-10-25 (36 models), plus speech answers (mp3 bytes, PCM with rate/channels), generation-lookup answers (found / not found) and errors (402, timeout via a hanging fetch).
- **Seed:** a new `tests/helpers/recordings.ts` `seedRecording()` writes a row and a small file. Migration tests build a DB at 0011 and insert prototype-shaped rows.
- **Cleanup boundary:** per test (temp dir removed, timers cancelled via `stopBackground`).

## Load

The repo's timing tests (the serial `nfr` projects) carry the numeric NFRs:

| NFR | Scenario | Threshold |
|---|---|---|
| Speech catalog requests | 50 model-list requests over a warm catalog within 10 min of fake time; count provider catalog calls; time each answer | ≤ 1 provider catalog request; p95 ≤ 300 ms |
| Recent recordings | 1 000 seeded recordings; 50 reads of the ten latest | p95 ≤ 100 ms server time |
| Saving after the audio arrives | 20 generations with a fake 10 MB answer | file + record saved p95 ≤ 500 ms |
| Provider time limit | a hanging provider with the timeout injected short; assert the 180 s default is wired | plain error after the injected limit; default = 180 s |
| Cost lookups | fake timers over a pending recording | ≤ 8 lookups, none after 10 min; resumed after restart |

## CI placement

There is no CI. The local gate `pnpm typecheck && pnpm lint && pnpm test` runs every project, unit, integration, web and the timing projects last, before each commit.
