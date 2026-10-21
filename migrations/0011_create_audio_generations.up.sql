-- audio-generation: one row per ElevenLabs text-to-speech result, generated through OpenRouter. The audio itself
-- lives under the data dir (`audio/<id>.<ext>`); only its relative path is stored.
CREATE TABLE IF NOT EXISTS audio_generations (
  id          TEXT    PRIMARY KEY,                                   -- ULID
  created_at  TEXT    NOT NULL,                                      -- ISO-8601 UTC
  model       TEXT    NOT NULL CHECK (length(model) BETWEEN 1 AND 100),  -- OpenRouter id, e.g. elevenlabs/eleven-v4
  voice       TEXT    NOT NULL CHECK (length(voice) BETWEEN 1 AND 100),  -- premade voice name or ElevenLabs voice id
  text        TEXT    NOT NULL CHECK (length(text) >= 1),
  settings    TEXT    NOT NULL,                                      -- JSON: the voice settings sent
  file_path   TEXT    NOT NULL UNIQUE,
  media_type  TEXT    NOT NULL,
  characters  INTEGER NOT NULL CHECK (characters >= 0),              -- billed characters (code points)
  cost_micros INTEGER CHECK (cost_micros IS NULL OR cost_micros >= 0), -- characters × catalog price, micro-USD
  cost_ref    TEXT                                                   -- OpenRouter X-Generation-Id
);
