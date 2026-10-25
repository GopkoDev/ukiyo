-- audio-gallery: the Owner's comment and tags on a recording (ADR-0047). Mirrors generation_comments /
-- generation_tags (0006); both cascade with the recording, so its deletion (ADR-0042) needs no extra statements.
-- Additive only: audio_generations (0011/0012) is not touched.
CREATE TABLE IF NOT EXISTS audio_generation_comments (
  audio_generation_id TEXT PRIMARY KEY REFERENCES audio_generations (id) ON DELETE CASCADE,
  body                TEXT NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 2000), -- characters, not bytes
  updated_at          TEXT NOT NULL                                                       -- ISO-8601 UTC
);

CREATE TABLE IF NOT EXISTS audio_generation_tags (
  audio_generation_id TEXT    NOT NULL REFERENCES audio_generations (id) ON DELETE CASCADE,
  tag                 TEXT    NOT NULL CHECK (length(tag) BETWEEN 1 AND 32 AND tag = lower(trim(tag))),
  position            INTEGER NOT NULL CHECK (position >= 1),                               -- insertion order
  PRIMARY KEY (audio_generation_id, tag)
);
