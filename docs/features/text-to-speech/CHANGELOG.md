# Changelog — text-to-speech

## text-to-speech — an Audio section that speaks with every OpenRouter speech model, honest costs included

**What:**

- **Navigation.** The navigation bar is split into an **Image** group (Generate, Gallery, Models) and an **Audio** group (Speech).
- **Models and controls.** The Speech page, now at `/audio/speech` (the old `/speech` still opens it), offers every OpenRouter speech model: 36 from 14 makers today, grouped by maker with their price and character limit. Each model shows only the controls it accepts:
  - ElevenLabs: stability (stepped on v3), similarity, style, speaker boost, and speed where honoured.
  - OpenAI, Gemini and Fish Audio: delivery instructions.
  - OpenAI and Seed: speed.
  - Any other model: voice and text only.
  - A model without listed voices uses the provider's default voice or a typed name.
- **Cost, before and after.** Before generating, the page shows an estimate labelled «≈», or says how the model is priced (per second, per token, free, unknown) — never $0. Each recording is saved with its audio file in one atomic step. Raw PCM from Gemini or HeyGen is stored as a playable WAV. The cost starts as «cost pending · ≈ estimate» and settles to the amount OpenRouter actually charged, without a reload; if OpenRouter never reports it, it shows «cost unavailable».
- **Recent recordings.** The ten latest recordings appear on the page and can be played, downloaded, reused (it asks before replacing unsent text) and deleted (the file goes with the record).
- **Prototype recordings.** The 19 recordings made with the prototype stay as they were, with their amounts as known costs.

**Why:** The prototype had the right page but the wrong foundations ([spec](./spec.md) §1):
- ElevenLabs only.
- No cost status: a missing price looked like nothing.
- A file write that a crash could split from its row.
- Its own OpenRouter client inside the audio module.

The decisions behind the rebuild:

| Decision | ADR |
|---|---|
| Speech sits behind its own provider port | [ADR-0039](./adr/0039-put-speech-behind-its-own-provider-port-with-an-openrouter-adapter.md) |
| Model capabilities come from a family spec map with a safe fallback | [ADR-0040](./adr/0040-describe-speech-model-controls-with-a-family-spec-map-and-a-voice-and-text-fallback.md) |
| mp3 where offered, PCM wrapped as WAV | [ADR-0041](./adr/0041-request-mp3-where-offered-and-wrap-raw-pcm-as-wav-in-the-adapter.md) |
| Recordings go through the shared file store | [ADR-0042](./adr/0042-save-recordings-through-the-file-store-with-a-single-file-staging-path.md) |
| Costs use the shared cost resolver, with the estimate kept beside the cost | [ADR-0043](./adr/0043-resolve-recording-costs-with-the-shared-cost-sync-resolver-and-keep-the-estimate-beside-the-cost.md) |
| The audio table is rebuilt in a new migration | [ADR-0044](./adr/0044-rebuild-the-audio-table-in-a-new-migration-keeping-prototype-rows-as-known-cost.md) |
| Synchronous requests, and a page that stays mounted | [ADR-0045](./adr/0045-generate-speech-synchronously-in-the-request-and-keep-the-speech-page-mounted.md) |
| Section groups, with audio addresses under `/audio` | [ADR-0046](./adr/0046-group-sections-in-the-registry-and-put-audio-addresses-under-audio.md) |

**How to use:**
- In the UI: open **Audio → Speech**, type the text, pick a model and a voice, adjust the controls, then press **Generate speech** (or Cmd/Ctrl+Enter).
- In the API ([openapi.yaml](./contracts/openapi.yaml)):
  - `GET /api/audio/models`, `GET /api/audio/credits`
  - `GET|POST /api/audio/recordings`
  - `GET|DELETE /api/audio/recordings/{id}`
  - `GET /api/audio/recordings/{id}/file[?download=1]`

**Operational notes:**
- **Migration:** `0012_rebuild_audio_generations` applies on the next boot. It rebuilds `audio_generations`, keeping every prototype row: an amount becomes `known`, no amount becomes `unavailable`. It was verified on a copy of the Owner's DB (19 rows, Σ $0.49248 kept). `pnpm db:rollback` reverts it to the 0011 shape, with a provider-default voice becoming `'default'`.
- **Breaking API change:** the prototype routes `/api/audio`, `/api/audio/:id/file` and `DELETE /api/audio/:id` are replaced by `/api/audio/recordings…`. The SPA is their only client and ships with the change.
- **Config:** none new; speech needs `OPENROUTER_API_KEY`.
- **Rollback:** `pnpm db:rollback` once, then revert the branch.
- **Repo hygiene (flagged for the Owner):** `CLAUDE.md` §Conventions still names only `ImageProvider`. It should read «an adapter behind the matching port (`ImageProvider` | `SpeechProvider`)» (ADR-0039). The agent did not edit CLAUDE.md.

**Acceptance criteria delivered:** AC-01 … AC-20 (spec §5).

- **Independent review:** PASS after fixes ([review](./_review/review-2026-10-25.md)): 2 stage-1 and 12 stage-2 findings, all fixed.
- **Verified on the running app on 2026-10-25**, against a copy of the Owner's data:
  - 0012 applied, and the 19 prototype recordings were listed as known.
  - 36 models were listed, and the credits were read.
  - Three real recordings:
    - ElevenLabs v4: mp3, $0.0032.
    - Gemini 3.8 Flash TTS: PCM → valid 24 kHz mono WAV, $0.000699.
    - Fish Audio S1 with the provider-default voice: mp3, $0.00051.
  - All three costs went from pending to known through OpenRouter's generation lookup, which answers spec §8 Q1.
  - Deleting a recording removed it and its file.
  - A foreign origin was refused.
  - `/audio/speech` and `/speech` were served.
- **Not driven in a browser this run:** the UI was not clicked through by hand; that is left to the Owner at merge. It is covered by component tests.
