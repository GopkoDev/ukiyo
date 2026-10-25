# Changelog — voice-presets

## voice-presets — named speaker setups, truthful links from recordings, and a Voices section

**What:**

- **Save a speaker on the Speech page.** A «Voice preset» row above Voice has **Save**: the current speech model, voice and the settings that model accepts are kept under a name (1–60 characters, unique ignoring case in any alphabet; suggested «Voice · Model»). The text is never stored.
- **Apply in one click.** The preset list (by name) sets model, voice and settings and keeps the text; a hidden model is allowed («Hidden»). A preset whose model — or listed voice — is gone is marked «No longer offered» and can't be applied.
- **«modified».** Any change after applying shows «Name · modified»; back to the preset's values shows the plain name. **Save** on a modified preset offers «Update «Name»» or «Save as new». **⋯** has Rename, Delete and Detach.
- **Truthful links.** A recording made while a preset is applied and unchanged is linked to it. The server decides: it compares what it is about to send with the stored preset and links only on an exact match; a different, unknown or meanwhile-deleted preset saves the recording unlinked and never fails the paid request (ADR-0058). A linked recording names its preset in its dialog and page; reusing it re-applies the preset if it still matches.
- **Voices section** (`/audio/voices`, Audio group: Speech, Gallery, Voices, Models): one card per preset with model, voice, settings badges, number of recordings, total cost (known costs only, «+ N pending», «· N without a price») and last use, plus Apply / Rename / Delete. Each preset has its own page `/audio/voices/<id>` with the grid of its recordings (the audio gallery's cards, paging and dialog with ← → within the preset).
- **Deleting a preset keeps its recordings** — they lose only the link. Updating a preset never changes past recordings. Recordings made before this step stay unlinked.

**Why:** the Owner kept re-creating the same speakers by hand and couldn't see which recordings a speaker made or what it cost ([spec](./spec.md) §1).

| Decision | ADR |
|---|---|
| Links in their own cascading table, `audio_generations` untouched | [ADR-0057](./adr/0057-link-recordings-to-voice-presets-through-a-separate-link-table.md) |
| The server decides the link by comparing the normalized setup | [ADR-0058](./adr/0058-decide-a-recordings-preset-link-on-the-server-by-comparing-the-normalized-setup.md) |
| A recording dialog belongs to the grid named in its history state | [ADR-0059](./adr/0059-let-the-grid-that-opened-a-recording-dialog-own-it-by-its-history-state.md) |
| Section aliases redirect only when declared, so Voices owns `/audio/voices/<id>` | [ADR-0060](./adr/0060-redirect-only-declared-section-aliases-so-sections-can-own-sub-paths.md) |

**Operational note:** adds migration **0016_create_voice_presets** (two new tables + one index; additive — no existing row changes). It applies on the next server start. Rollback: `pnpm db:rollback` once drops only the preset tables (recordings, tags and comments stay).

**How to use:** Audio → Speech → set up a voice → **Save**. Pick it later from «Voice preset». Audio → Voices to see each speaker's recordings and cost.
