# Changelog — models-page-audio

## models-page-audio — speech models on the Models page, and provider balances on every page

**What:**

- **Models page: Image | Audio.** The view is kept in the address: `/models` is Image, `/models?tab=audio` is Audio. Back, Forward and reload keep it, and an unknown tab opens Image. The Image view is the step-10 page, unchanged.
- **A «Models» entry in the Audio group** (accessible name «Audio models») opens the Audio view. The Image group's «Models» opens the Image view. Only the matching entry is marked current (ADR-0056).
- **The Audio view** has one row per OpenRouter speech model, in the Speech page's order. Each row shows:
  - name and id, and maker;
  - price in step 18's wording («$0.08 / 1K chars», «priced per token», «Free», «price unknown»);
  - character limit («· limit not published» when it's Ukiyo's default);
  - voice count («provider default» when the model has no named voices);
  - the voice settings it accepts;
  - **★** and **Show in picker**.

  Preferences of models OpenRouter no longer offers are listed under «No longer offered», with **Forget**.
- **The Speech page's model list follows those choices.** «Favorites» comes first, and hidden models are left out. A hidden model that is currently selected stays selected, at the top of its maker's group and marked «Hidden». When Ukiyo picks a model by itself, it takes the first favorite, otherwise the first visible model. That pick is fixed once, so the selection never jumps afterwards.
- **Speech-model preferences are stored apart from image-model ones** (new table `speech_model_preferences`, migration 0015, additive). A ★ on one side never shows on the other (ADR-0054).
- **Provider balances in the navigation bar on every page.** Each configured provider gets one line: «OpenRouter $12.34», and «Vercel AI Gateway $95.50», because the gateway publishes a credit read too. A balance shows «—» (tooltip «Balance unavailable») when it can't be read. It is read again:
  - after every finished image generation or recording, successful or not;
  - every 5 minutes while the tab is visible;
  - when you return to the tab.

  A refresh that arrives during a read causes exactly one more read. The Speech page's «credits remaining» line uses the same cached figure (ADR-0055).
- **Removed:** `GET /api/audio/credits`. The Speech page now reads `GET /api/providers/openrouter/balance`.
- **Audio gallery (step 19 follow-up):** the component tests deferred by its review are now in place (`GalleryLiveViews.test.tsx`).

**Why:** The Owner couldn't compare or curate speech models, and the only remaining-credit figure was OpenRouter's, on the Speech page ([spec](./spec.md) §1).

| Decision | ADR |
|---|---|
| Speech-model preferences in their own table behind the same operations | [ADR-0054](./adr/0054-keep-speech-model-preferences-in-their-own-table-behind-the-same-preference-operations.md) |
| Balances as an adapter capability, one read per provider | [ADR-0055](./adr/0055-read-provider-balances-through-the-image-adapters-one-read-per-provider.md) |
| One page, two sections, by a query parameter | [ADR-0056](./adr/0056-let-one-page-serve-two-sections-by-a-query-parameter.md) |

**How to use:** Audio → Models. Star or hide speech models, then open Speech → Model. The balance is at the bottom of the navigation bar.
