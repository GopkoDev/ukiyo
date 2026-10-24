---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 18"
---

# 0041 — Request mp3 where offered and wrap raw PCM as WAV in the adapter

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** pipeline agent under the owner's run brief (dmytro.hopko)

## Context

`response_format` is `mp3` or `pcm` (default pcm). HeyGen and Gemini answer PCM only, and reject mp3 with an error. MiniMax and Voxtral answer mp3 only. Raw PCM (16-bit little-endian) has no header, so a browser can't play it. Its content type carries `rate=…;channels=…`. The prototype always asks for mp3, so PCM-only models fail.

## Decision drivers

- Spec AC-10: every recording plays in the page and downloads as a common audio file; nothing is lost; the Owner never picks a format.
- File size: mp3 is about 10× smaller than PCM/WAV for the same speech.

## Considered options

1. **Ask for mp3 unless the family spec says `pcm`; the adapter returns the bytes with their content type as received, and the audio service's save step prepends a 44-byte WAV header (`audio/wav.ts`), using the rate and channels from the content type (default 24 000 Hz mono)** — lossless, no dependency. A failed conversion is a save failure (spec AC-20), not a provider error.
2. **Store the native bytes (mp3 or raw PCM) and play PCM in the browser through the Web Audio API** — no server conversion, but the download is an unplayable raw file and the player becomes custom.
3. **Transcode PCM to mp3 on the server** — small files, but needs an encoder dependency and loses quality.

## Decision outcome

**Chosen:** Option 1. It keeps the small mp3 everywhere it is offered, makes PCM-only models playable without a dependency, and leaves the file intact (WAV = the same samples plus a header).

## Consequences

**Positive**
- Every catalog model produces a playable `audio/mpeg` or `audio/wav` file.

**Negative**
- WAV recordings are large (≈ 2.9 MB per minute at 24 kHz mono); acceptable for a local tool.

**Neutral**
- A model that turns out PCM-only is fixed by one map entry.

## Links

- Spec: [[../spec.md]] AC-10
- SAD: [[../sad.md]] §4
- Related ADR: [[0040-describe-speech-model-controls-with-a-family-spec-map-and-a-voice-and-text-fallback]]
