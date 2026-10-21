-- audio-generation: one row per ElevenLabs text-to-speech result. The audio itself lives under the data dir
-- (`audio/<id>.<ext>`); only its relative path is stored.
CREATE TABLE IF NOT EXISTS audio_generations (
  id          TEXT    PRIMARY KEY,                                   -- ULID
  created_at  TEXT    NOT NULL,                                      -- ISO-8601 UTC
  model       TEXT    NOT NULL CHECK (length(model) BETWEEN 1 AND 100),
  voice_id    TEXT    NOT NULL CHECK (length(voice_id) BETWEEN 1 AND 100),
  voice_name  TEXT    NOT NULL,
  text        TEXT    NOT NULL CHECK (length(text) >= 1),
  settings    TEXT    NOT NULL,                                      -- JSON: the voice settings sent
  file_path   TEXT    NOT NULL UNIQUE,
  media_type  TEXT    NOT NULL,
  characters  INTEGER CHECK (characters IS NULL OR characters >= 0) -- characters billed, as ElevenLabs reported
);
