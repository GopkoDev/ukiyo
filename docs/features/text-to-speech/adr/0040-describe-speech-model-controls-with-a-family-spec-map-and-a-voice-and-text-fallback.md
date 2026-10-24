---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 18"
---

# 0040 — Describe speech model controls with a family spec map and a voice-and-text fallback

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** pipeline agent under the owner's run brief (dmytro.hopko)

## Context

OpenRouter's speech catalog lists 36 models from 14 makers, and gives `supported_parameters: []` for all of them. It does give voices, `context_length` (for some) and pricing. What a model actually accepts comes from the docs: ElevenLabs voice settings, `instructions` for OpenAI, Gemini and Fish, `speed` for OpenAI and Seed, PCM-only for HeyGen and Gemini, mp3-only for MiniMax and Voxtral. The prototype hard-codes nine ElevenLabs ids and falls back to stability and similarity for anything else, which sends ElevenLabs settings to models that ignore them.

## Decision drivers

- Spec AC-07 (only accepted controls, own ranges/defaults), AC-08 (only accepted settings sent and recorded), AC-09 (unknown models usable with voice + text; limits by precedence family → catalog → 5 000).
- Catalog drift: new ids in a known family should get that family's controls without a code change.
- One source shared by server (what to send) and web (what to show).

## Considered options

1. **A family spec map in `src/shared/speech-models.ts`** — entries matched by id prefix, with optional per-id overrides. Each declares the controls (kind, range, step, default), `maxChars`, the output format (`mp3` | `pcm`), whether voice is required or optional, the pricing-unit label for completion-priced models, and how each control maps onto the wire. Unmatched models get `{ controls: [], voice: required-if-listed, format: mp3 }`.
2. **Probe each new model once (a minimal request per control) and cache what it rejects** — self-updating, but every probe is a paid request, and silent «ignored» controls are invisible to a probe.
3. **Per-id table only (the prototype's way)** — exact, but every new id loses its controls until code changes, and unknown ids get a wrong guess.

## Decision outcome

**Chosen:** Option 1. Family prefixes cover the catalog's churn (e.g. a new `elevenlabs/eleven-v5` inherits ElevenLabs controls), and per-id overrides keep the exact ElevenLabs limits and v3's stability steps. The fallback is deliberately empty of controls (AC-09).

## Consequences

**Positive**
- Settings that a model ignores are never sent or recorded (AC-08); presets (step 21) store only real settings.
- The web renders controls generically from the descriptors, so there is no per-family UI code.

**Negative**
- The map is hand-maintained knowledge; it can be wrong for a provider that changes behaviour (SAD §11).

**Neutral**
- When OpenRouter publishes speech `supported_parameters`, the catalog can override the map entry by entry.

## Links

- Spec: [[../spec.md]] AC-07, AC-08, AC-09
- SAD: [[../sad.md]] §4
- Related ADR: [[0041-request-mp3-where-offered-and-wrap-raw-pcm-as-wav-in-the-adapter]]
