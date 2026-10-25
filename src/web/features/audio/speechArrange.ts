import type { ModelPreference } from "../../../shared/models";
import type { SpeechModel } from "../../../shared/speech";

export type ArrangedSpeech = {
  favorites: SpeechModel[];
  makers: { maker: string; models: { model: SpeechModel; hidden: boolean }[] }[];
};

/**
 * The Speech page's model list (models-page-audio AC-03, AC-04): «Favorites» first in the Speech order, then each
 * maker's visible models; hidden models are left out — favorites too — except the selected one, which sits at the top
 * of its maker's group marked hidden. Unreadable preferences (`null`) = the step-18 list.
 */
export function arrangeSpeechModels(
  models: SpeechModel[],
  prefs: ModelPreference[] | null | undefined,
  selected: string,
): ArrangedSpeech {
  const flags = new Map((prefs ?? []).map((p) => [p.model, p]));
  const hidden = (m: SpeechModel) => flags.get(m.id)?.hidden === true;
  const favorites = models.filter((m) => flags.get(m.id)?.favorite === true && !hidden(m));
  const fav = new Set(favorites.map((m) => m.id));
  const makers = [...new Set(models.map((m) => m.maker))]
    .map((maker) => {
      const own = models.filter((m) => m.maker === maker && !fav.has(m.id));
      const pinned = own.filter((m) => hidden(m) && m.id === selected).map((model) => ({ model, hidden: true }));
      const visible = own.filter((m) => !hidden(m)).map((model) => ({ model, hidden: false }));
      return { maker, models: [...pinned, ...visible] };
    })
    .filter((g) => g.models.length > 0);
  return { favorites, makers };
}

/** The model Ukiyo picks by itself: the first favorite, else the first visible model, else the first one. */
export function autoPickSpeech(models: SpeechModel[], prefs: ModelPreference[] | null | undefined) {
  const { favorites, makers } = arrangeSpeechModels(models, prefs, "");
  return favorites[0] ?? makers[0]?.models[0]?.model ?? models[0];
}
