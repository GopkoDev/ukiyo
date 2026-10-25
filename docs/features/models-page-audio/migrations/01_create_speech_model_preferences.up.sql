-- models-page-audio: the Owner's per-speech-model choices, one row per provider + model (ADR-0054).
-- Kept apart from model_preferences (image models) so a ★ or «Hidden» never crosses modalities (spec AC-05).
-- No foreign key: models live in the provider's speech catalog; a row of a model no longer offered is kept
-- until «Forget» (spec AC-06). A row with both flags off is deleted.
CREATE TABLE IF NOT EXISTS speech_model_preferences (
  provider   TEXT    NOT NULL CHECK (provider IN ('openrouter')),
  model      TEXT    NOT NULL CHECK (length(model) BETWEEN 1 AND 200),   -- the provider's own id, case-sensitive
  favorite   INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  updated_at TEXT    NOT NULL,                                           -- ISO-8601 UTC
  PRIMARY KEY (provider, model),
  CHECK (favorite = 1 OR hidden = 1)
);
