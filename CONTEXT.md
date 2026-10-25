---
status: Living
updated_at: "2026-10-25"
---

# Domain Context — Ukiyo

## Glossary

- Audio gallery — the Owner's browsable list of every saved recording, newest first, with a detail view per recording; it can show one speech model's recordings or group them by speech model (the view lives in its address). NOT the Gallery: image generations and recordings are never listed together.
- Comment — the Owner's own free-text note on a generation or a recording (one per item, editable, may be empty). NOT the prompt or a recording's text: those were sent to the provider, the comment never is.
- Cost lookup — Ukiyo asking a provider, some time after a generation, for the price it did not state in its answer; it ends with a known amount or «unavailable». NOT a price estimate made before generating (roadmap step 7).
- Cost status — whether a generation's or a recording's price is `known` (an exact amount), `pending` (expected to arrive later) or `unavailable` (the provider gave none). NOT a zero price: an unknown cost is never shown or stored as free.
- Deletion — the Owner removing a generation (or a recording) for good: its record, comment, tags, output images and input copies (for a recording: its audio file, tags and comment) disappear together, with no undo. NOT hiding or archiving: nothing of a deleted generation stays on the machine.
- Derived generation — a generation made by re-running or reusing another one; it records its source generation and keeps its own copies of every input. NOT a variation the provider made: deriving is the Owner's action in Ukiyo.
- Favorite model — an image model the Owner marked with ★ under one provider; the model picker lists favorites first in their own group. NOT a default model: marking a favorite never selects it.
- Gallery — the owner's browsable list of every saved generation, newest first, with a detail view per generation. NOT a provider's playground history: the gallery lives only on the owner's machine.
- Gallery view — how the gallery is shown: every generation, one model's generations, grouped by model, grouped by prompt, or one prompt's generations (later by folder); kept in the gallery's address. NOT a filter on the Generate form: views only change what the gallery shows.
- Generation — one request the owner sent to a provider together with everything it produced and cost: prompt, model, parameters, output images, cost, duration, raw request/response. NOT a single image: one generation can hold several output images.
- Hidden model — an image model the Owner chose to leave out of the model picker (set on the Models page, step 10); it stays usable when a re-run or the current selection needs it. NOT a deleted or unavailable model: hiding changes only the picker, never past generations.
- Image model — a provider-offered model that can produce images, identified by the provider's model id. NOT a text-only chat model.
- Input image — an image the Owner attaches to a generation request (img→img, img+text→img); Ukiyo keeps its own copy with the generation. NOT an output image: inputs go to the provider, outputs come back from it.
- Lineage — the link from a derived generation to its source generation (re-run of / made from output N of), shown on both sides. NOT ownership: deleting the source never deletes or blocks its derived generations.
- Model preference — the Owner's per-model choices kept on the machine for one provider + model id: favorite and hidden. NOT a generation parameter: preferences shape the picker, they are never sent to a provider.
- Output image — an image file a provider returned for a generation, stored on the owner's machine. NOT an input image (an image the owner attaches to a prompt — roadmap step 3).
- Owner — the single person who runs Ukiyo on their own machine and holds the provider API keys. The only human role; there are no accounts, admins or guests.
- Price estimate — what Ukiyo expects a request to cost before it is sent, from the provider's published price (or, for per-token image models, the Owner's own past known costs; speech models get no such estimate); always labelled as an estimate. NOT the generation's cost: the recorded cost after generating is the only source of truth, and an image estimate is never stored. A recording keeps its up-front estimate beside its cost, always labelled as an estimate.
- Prompt group — every generation whose prompt is exactly the same text (same characters, spaces, line breaks and case), whatever model or parameters made it. NOT similar prompts: «a cat» and «A cat» are two groups.
- Provider — an external generation service Ukiyo calls with the owner's key (OpenRouter, Vercel AI Gateway for images; OpenRouter for speech). NOT a model: one provider offers many image and speech models.
- Recording — one text-to-speech request the Owner sent to a provider together with everything it produced and cost: text, speech model, voice, voice settings, audio file, billed characters, cost (with its status) and the up-front estimate. NOT a generation: a generation produces images; recordings are kept and listed apart from them.
- Re-run — starting a new generation from an existing one with the same provider, model, prompt, parameters and input images pre-filled; the Owner may change anything before generating. NOT a promise of the same picture: re-running resends the same inputs, results can differ.
- Recent recordings — the Owner's ten latest recordings listed on the Speech page, newest first. NOT the audio gallery: it never pages.
- Recent generations — the Owner's ten latest generations shown next to the generate form, one thumbnail each, newest first. NOT the gallery: it never pages and holds only the latest ten.
- Reuse (recording) — putting a recording's text, speech model, voice and voice settings back into the Speech form, from the recent recordings or the audio gallery; it never generates by itself. NOT «use as input»: that attaches an image; this is the recording counterpart of a re-run.
- Reuse (use as input) — attaching one of a generation's output images as an input image of the next generation in one action, without saving and re-uploading the file. NOT a re-run: only that image is carried over.
- Section — one top-level area of Ukiyo with its own page and address, listed in the navigation bar under its section group (Image: Generate, Gallery, Models, later Folders; Audio: Speech, Gallery (the audio gallery), later Voices). NOT a generation's detail page: a detail page belongs to the Gallery section.
- Section group — a named block of sections in the navigation bar: «Image» first, «Audio» second. NOT a section: a group has no page or address of its own.
- Speech model — a provider-offered model that turns text into spoken audio, identified by the provider's model id (e.g. `elevenlabs/eleven-v3`). NOT an image model: speech models never appear in the image model picker.
- Source generation — the generation a re-run or reuse started from (the parent in the lineage). NOT the provider's original request: it is a Ukiyo generation record.
- Voice — the speaker a speech model reads the text with, named by the provider (e.g. «george», «Kore»); each model offers its own voices, and some use a provider default. NOT a voice preset (roadmap step 21): a voice is the provider's, a preset is the Owner's saved choice of voice + model + settings.
- Voice settings — the per-model controls the Owner sets for a recording (e.g. speed, stability, similarity, style, delivery instructions); only those the chosen speech model accepts are sent and recorded. NOT generation parameters of image models.
- Tag — a short label the Owner attaches to a generation or a recording to group it with others (normalized: trimmed, lower-case; an item holds each tag once). Image and recording tags are kept apart: a recording's tags never appear on a generation. NOT a model or provider attribute: tags come only from the Owner.

## Invariants

- A derived generation never depends on its source's files: it is saved with its own copies, so deleting the source changes nothing about it except that its lineage shows the source as deleted.

- A generation is saved only together with all of its output images and copies of all of its input images — never a record without its image files, never image files without a record.
- A deletion is all-or-nothing too: a generation's record and all its files disappear together — never a record whose files are gone, never files of a deleted record that stay reachable.
- A recording is saved only together with its audio file — never a record without its file, never a file without its record; its deletion is all-or-nothing too.
- A provider API key never leaves the server process — it is never shown to the owner's browser, stored in a generation's raw request, or written to logs.
- The app is reachable only from the owner's own machine.

## Out of scope

- Other human roles (guests, admins, shared accounts) · the product is «me, one machine» (idea-brief §3).
