-- Reverts text-to-speech's rebuild to the 0011 shape. Status, estimate, provider, model name and duration
-- are dropped; a pending/unavailable cost keeps its amount (NULL); a provider-default voice becomes 'default'.
DROP INDEX IF EXISTS audio_generations_cost_pending;

CREATE TABLE IF NOT EXISTS audio_generations_v1 (
  id          TEXT    PRIMARY KEY,
  created_at  TEXT    NOT NULL,
  model       TEXT    NOT NULL CHECK (length(model) BETWEEN 1 AND 100),
  voice       TEXT    NOT NULL CHECK (length(voice) BETWEEN 1 AND 100),
  text        TEXT    NOT NULL CHECK (length(text) >= 1),
  settings    TEXT    NOT NULL,
  file_path   TEXT    NOT NULL UNIQUE,
  media_type  TEXT    NOT NULL,
  characters  INTEGER NOT NULL CHECK (characters >= 0),
  cost_micros INTEGER CHECK (cost_micros IS NULL OR cost_micros >= 0),
  cost_ref    TEXT
);

INSERT INTO audio_generations_v1
  (id, created_at, model, voice, text, settings, file_path, media_type, characters, cost_micros, cost_ref)
SELECT id, created_at, model, COALESCE(voice, 'default'), text, settings, file_path, media_type, characters,
       cost_micros, cost_ref
FROM audio_generations;

DROP TABLE audio_generations;
ALTER TABLE audio_generations_v1 RENAME TO audio_generations;
