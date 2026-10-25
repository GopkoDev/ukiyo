---
status: Accepted
owner: "dmytro.hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 19"
---

# 0050 — Coordinate playback app-wide so one recording plays at a time

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Owner (via the orchestrator), agent

## Context

The gallery shows a player on every card, one in the dialog, and the Speech page stays mounted but hidden after its first visit (ADR-0045) — the HTML `hidden` attribute does not pause media, and the Speech page autoplays a fresh result. Spec AC-02 requires at most one recording playing in the tab, pausing on section change, and no autoplay while Speech isn't shown.

## Decision drivers

- Spec AC-02, AC-09 (stepping stops playback).
- Zero audio bytes before the Owner plays (spec §6 Audio loading).
- Must work for players in components that don't know each other (gallery, dialog, Speech).

## Considered options

1. **One document-level coordinator**: a capture-phase `play` listener pauses every other `audio` element; a route-change hook pauses everything playing; Speech autoplays only while it is the current section. Lives in `src/web/lib/playback.ts`, installed once by the app frame (not in a gallery layer: the Speech page uses it too).
2. **A React context registry** where every player registers and the provider pauses the others — needs every player wrapped, including step-18 ones, and misses plain `audio` elements.
3. **A single shared player bar** with cards acting as play buttons — a new interaction the owner didn't ask for, unlike the image-gallery mirror.

## Decision outcome

**Chosen:** Option 1. It covers every native player, including the existing ones, with one small module and no new UI.

## Consequences

**Positive**
- Works for any future player (step 21) without changes.

**Negative**
- Relies on DOM events outside React; tested with jsdom media stubs.

**Neutral**
- Pausing keeps the position; the next play resumes there (spec AC-02).

## Links

- Spec: [[../spec.md]] AC-02, AC-09
- SAD: [[../sad.md]] §8 Playback
- Related ADR: ADR-0045
