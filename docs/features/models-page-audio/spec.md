---
status: Draft
owner: "dmytro.hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-25"
feature_size: "M"
---

# Spec — models-page-audio

> **Glossary:** [CONTEXT](../../../CONTEXT.md)
> **Reference module / docs / channels used:** [`docs/roadmap.md`](../../roadmap.md) step 20 (owner request 2026-10-25, audio epic); the shipped [`models-page`](../models-page/spec.md) and [`model-picker-preferences`](../model-picker-preferences/spec.md) specs and their code (`src/web/features/models/`, `src/server/modules/models/`); step 18 [`text-to-speech`](../text-to-speech/spec.md) (speech catalog, price wording, the Speech page's credits line); step 19 [`audio-gallery`](../audio-gallery/spec.md) (Audio nav group); Vercel AI Gateway REST reference (checked 2026-10-25: it publishes a credit-balance read for the key's team — remaining balance and total used, in USD).

## 1. Context

The Owner now makes recordings as well as images, but the Models page only knows image models: to see what a speech model costs, how much text it takes or how many voices it has, the Owner has to open the Speech page's model list one model at a time, and there is no way to put the few speech models they actually use on top or to drop the ones they never want to see. Image models already have both (★ favorites and «hide from the picker», steps 9–10); speech models should behave the same way.

Separately, every generation spends the Owner's prepaid provider credit, yet the only place Ukiyo shows what is left is a line on the Speech page (OpenRouter only). The Owner wants the remaining balance of each provider in view on every page, so a run of image generations or a long recording never hits an empty account by surprise.

Committed approach: one Models page with an **Image | Audio** choice kept in the page's address; the Audio view lists every speech model with its price, limits, voices and controls plus the same ★ / «Show in picker» toggles, which shape the Speech page's model list exactly as the image toggles shape the image picker. Speech-model preferences are kept apart from image-model preferences. The navigation bar shows each configured provider's remaining balance on every page — OpenRouter and Vercel AI Gateway, since both publish a balance read — refreshed after every finished image generation and recording and on a regular interval; the Speech page's credits line becomes a reader of that same balance.

Traceability: the image Models page (step 10) is the reference for the table, the toggles, «No longer offered» and the error states; the image picker (step 9) for favorites-first and hidden handling; the step-18 price wording («$0.08 / 1K chars», «priced per second of audio», «Free», «price unknown») and limit wording («5 000 chars · limit not published») are reused verbatim.

## 2. Goals

- The Owner can compare every speech model on one page and decide which ones the Speech page offers, the same way they already do for image models.
- The Speech page's model list reflects those choices immediately: favorites first, hidden models out.
- The Owner always sees how much provider credit is left, wherever they are in Ukiyo, and it stays current after spending.

## 3. Non-goals

- Spend history, charts or per-model spend — only the current balance is shown (the provider dashboards already have history).
- Topping up credit or any write to the provider account — Ukiyo only reads the balance.
- Low-balance warnings or blocking a generation on a low balance — the provider already refuses an unaffordable request and Ukiyo shows that error (step 18 / step 2).
- Changing the image Models table, its columns or its behaviour — the Image view is the existing page, unchanged.
- Speech models from Vercel AI Gateway — speech stays OpenRouter-only (step 18).

## 4. User stories

### US-01: Compare speech models

**As an** Owner
**I want** a table of every speech model with maker, price, character limit, voices and supported controls
**So that** I can pick a model for a recording without trying each one on the Speech page

### US-02: Curate the speech model list

**As an** Owner
**I want** to mark speech models with ★ and hide the ones I don't use
**So that** the Speech page's model list starts with my favorites and leaves out the noise

### US-03: Switch and link between image and audio models

**As an** Owner
**I want** the Models page to have an Image and an Audio view I can switch, link and reach from each navigation group
**So that** I land on the models I'm working with and Back/reload keep my place

### US-04: See the remaining provider balance

**As an** Owner
**I want** each configured provider's remaining credit in the navigation bar on every page
**So that** I know how much I can still spend before I generate

### US-05: Keep the balance current

**As an** Owner
**I want** the balance to refresh after each image generation and each recording, and on its own every so often
**So that** the figure I see reflects what I just spent

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** OpenRouter is configured and offers speech models
**When** the Owner opens the Models page on the Audio view
**Then** a table lists every speech model in the Speech page's order (ElevenLabs first, then by maker) with, per row: the model's name and id, its maker, its price in step 18's wording («$0.08 / 1K chars», «priced per second of audio», «priced per token», «Free» or «price unknown» — never «$0» or a blank), its character limit («5 000 chars», or «5 000 chars · limit not published» when the limit is Ukiyo's default), its voice count («12 voices», or «provider default» when the model offers no named voices), the voice settings it accepts by name (e.g. «speed, stability, similarity») or «—», a ★ toggle and a «Show in picker» switch; the card heading says «OpenRouter · N speech models»

### AC-02 (US-02) — happy path

**Given** the Owner is on the Audio view
**When** the Owner turns a speech model's ★ on or off, or its «Show in picker» switch off or on
**Then** the row shows the new state at once (a hidden row is dimmed and marked «Hidden»), the choice is kept on the machine — it is still there after a reload or a restart — and toggling twice ends where it started

### AC-03 (US-02) — cross-context

**Given** the Owner has favorite and hidden speech models
**When** the Owner opens the Speech page's model list
**Then** a «Favorites» group lists the favorite models first, in the Speech page's order (maker order, ElevenLabs first, then the catalog order), then the makers' groups list every other visible model as before; hidden models are in no group, even when they are also favorites; with no favorites and nothing hidden the list is exactly as in step 18; a change made on the Models page shows in the list without reloading the page

### AC-04 (US-02) — cross-context

**Given** the Speech form has a model selected (chosen, restored from the draft, or put back by a Reuse) and the Owner hides that model
**When** the Owner returns to the Speech page
**Then** the model stays selected and is shown at the top of its maker's group marked «Hidden», for as long as it stays selected, so the draft can be generated as is; whenever Ukiyo picks a speech model by itself (first visit, or a saved draft naming a model no longer offered) it picks the first favorite, otherwise the first visible model, never a hidden one — a Reuse naming a model no longer offered keeps the current model with step 18's notice, unchanged; a Reuse naming a hidden model selects it (it then shows as above); hiding a model never changes past recordings, the audio gallery or recorded costs

### AC-05 (US-02) — domain invariant

**Given** a model id is offered both as an image model and as a speech model, or the Owner has image-model preferences
**When** the Owner stars or hides a speech model
**Then** only that speech model's preference changes — speech-model preferences and image-model preferences are kept apart, so no ★ or «Hidden» on one side ever appears on, or changes, the other

### AC-06 (US-02) — domain invariant

**Given** the Owner starred or hid a speech model that the provider no longer offers
**When** the Owner opens the Audio view
**Then** the model is not in the table but is listed under «No longer offered» with its «Favorite» / «Hidden» marks and a «Forget» action that clears both; until forgotten, the preference is kept so the model comes back as before if offered again; «Forget» and turning a flag off succeed even when the model is no longer offered, the speech model list can't be read or OpenRouter isn't configured; the «No longer offered» list is built only from a speech model list that loaded and is not shown while the preferences can't be read; the Speech page's list never shows an entry for a model that can't be chosen

### AC-07 (US-02) — error

**Given** the Owner toggles ★ or «Show in picker» on a speech model
**When** the change can't be saved, or the change turns a flag on and Ukiyo doesn't recognise the model as a speech model the provider offers
**Then** that toggle returns to its previous state, the row says «Couldn't save — try again.» (an unknown model is refused and no preference is kept for it), and nothing else on the page changes

### AC-08 (US-01) — error

**Given** the speech model list can't be read, OpenRouter isn't configured, or the Owner's speech-model preferences can't be read
**When** the Owner opens the Audio view
**Then** respectively: «Couldn't load the speech models.» with «Try again»; «OpenRouter isn't configured — add its key to .env.local.»; or the table with every model and «Favorites and hidden models couldn't be loaded.» and the toggles unavailable — while on the Speech page an unreadable preference list leaves the model list as in step 18 (hidden ones included) and never blocks generating

### AC-09 (US-03) — happy path

**Given** the Owner is anywhere in Ukiyo
**When** the Owner chooses «Models» in the Image group, or «Models» in the Audio group
**Then** the Models page opens on the Image view or the Audio view respectively, the matching navigation entry (and only it) is marked as the current one, and the page's address names the view so the link opens the same view; switching between Image and Audio on the page changes the address, Back/Forward move between the two views, and a reload keeps the view; an address with no view or an unknown one opens the Image view

### AC-10 (US-03) — cross-context

**Given** the Owner opens the Image view
**When** the Owner uses it
**Then** it behaves exactly as the step-10 Models page: same providers, columns, prices, toggles, «No longer offered» and error states; speech models never appear in it and image models never appear in the Audio view

### AC-11 (US-04) — happy path

**Given** one or both providers are configured
**When** the Owner is on any page, including a generation's or a recording's detail page
**Then** the navigation bar lists each configured provider with its remaining credit in US dollars with two decimals («OpenRouter $12.34», «Vercel AI Gateway $95.50»); a provider that isn't configured isn't listed; while the first read is under way the figure reads «…»

### AC-12 (US-04) — error

**Given** a provider's balance can't be read (the provider is unreachable, refuses, or answers something Ukiyo can't understand)
**When** the navigation bar shows that provider
**Then** its figure reads «—» (with a tooltip «Balance unavailable») after that failed read — even if an earlier read succeeded — never «$0.00»; while a new read is under way the last figure (or «—») stays in place; the other provider's figure and every page keep working; a later successful read replaces the «—»

### AC-13 (US-05) — happy path

**Given** the balance is shown
**When** an image generation finishes (successfully or not), a recording finishes (successfully or not), a few minutes pass while Ukiyo's tab is in view, or the Owner returns to Ukiyo's tab after leaving it
**Then** the balance is read again and the new figure replaces the old one without the page moving; a trigger that arrives while a read is under way leads to exactly one more read after it, so a spend is never missed; the Speech page's «credits remaining» line shows the same OpenRouter figure as the navigation bar at all times, from the same read

### AC-14 (US-04) — authorization

**Given** a page from another site is open in the Owner's browser
**When** it asks Ukiyo for the provider balances or tries to change a speech-model preference
**Then** Ukiyo refuses it like every other Ukiyo request; the balance is read by Ukiyo itself with the Owner's key, and the key never reaches the browser

### AC-15 (US-04) — domain invariant

**Given** the balance is shown in the navigation bar
**When** the Owner reads it
**Then** it is the provider's own figure of what is left (for OpenRouter: purchased credit minus usage; for Vercel AI Gateway: the published remaining balance) — Ukiyo never computes a balance from its own recorded costs and never stores the balance

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Balance read | the balance answer for both providers ≤ 2 s p95 server time against reachable providers; a provider that hangs costs at most 10 s and never delays the other provider's figure or any page | integration test with a hanging fake provider |
| No duplicate balance requests | one balance read per refresh trigger for the whole app (navigation bar and Speech page together); triggers arriving during an in-flight read merge into one follow-up read; the interval refresh pauses while the browser tab is hidden | component test counting requests |
| Refresh interval | every 5 minutes while the tab is visible, and once on returning to the tab; after each finished generation / recording within 1 s | component test with fake timers |
| Preference save | a speech-model ★ / hide change ≤ 50 ms p95 server time with a warm catalog | integration test |
| Audio view | the table renders from the already-cached speech catalog without another catalog read; first show with a cold catalog = one catalog read | component test counting requests |
| Migration safety | the new preference storage applies on top of the Owner's current database without changing any existing row (image preferences, generations, recordings) | migration test + ship check on a copy of the Owner's data |

## 6.1 Security / privacy

- **Data classification:** internal — model preferences and the account balance of the Owner's own provider accounts; nothing leaves the machine except the balance read to each provider.
- **Personal data touched:** none new. The balance is a number shown, never stored or logged.
- **AuthZ/AuthN impact:** no new roles. The balance read and the speech-preference changes are covered by the same same-origin rule as every other Ukiyo request; the provider keys are used only by the server for the balance read and are never included in what the browser receives.
- **Abuse cases:**
  - A foreign site reads the Owner's balance through the browser: refused (same-origin rule, AC-14) — the balance is account information.
  - A foreign site stars or hides models: refused, nothing changes (AC-14).
  - A provider's balance answer echoes request details: Ukiyo passes on only the number (or «unavailable»), never the provider's raw answer or headers.
  - A crafted model id in a preference change: refused unless it is a speech model the provider offers (turning flags on) — AC-07.
- **Security review:** Required (light) — the Vercel AI Gateway key gains a new use (the balance read) and the account balance becomes readable by Ukiyo's pages; checked in `review`: the key is used only inside the adapter, the answer carries a number or nothing, the read sits behind the same-origin rule.

## 7. Metrics / KPIs

- **Speech models curated** — baseline: 0 speech-model preferences; target: the Owner has ≥ 1 favorite or hidden speech model within 7 days of shipping.
- **Balance visible** — baseline: balance shown on 1 page (Speech, OpenRouter only); target: shown on every page for every configured provider at ship (ship check).
- **Balance freshness** — baseline: refreshed only after a recording; target: the figure after any finished generation or recording equals the provider's figure within one refresh (ship check on the real app, free reads only).

## 8. Open questions

None open. Settled while specifying (orchestrator decisions 2026-10-25 or taken as the image precedent's default — see the ASSUMED list in the run report):

- [x] Does Vercel AI Gateway publish a balance read? **Yes** — its REST reference documents a credit read returning the remaining balance and total used (USD, for the key's team); it is shown like OpenRouter's.
- [x] Is an unconfigured provider shown in the balance? **No** — only configured providers are listed (assumed; nothing to read without a key).
- [x] Refresh interval? **5 minutes**, paused while the tab is hidden (assumed; the figure changes only when the Owner spends, which already triggers a refresh).
- [x] Where does a speech model's ★ live relative to image models? **Kept apart** (AC-05) — mirrors image tags vs recording tags.
