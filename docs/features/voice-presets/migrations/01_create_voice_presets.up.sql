-- voice-presets: the Owner's named speaker setups and the links from recordings to them (ADR-0057).
-- Additive only: audio_generations (0012) and its tags/comments (0013) are not touched. Existing recordings
-- have no link row, so they read as unlinked (no backfill, owner decision 2026-10-25).
CREATE TABLE IF NOT EXISTS voice_presets (
  id          TEXT PRIMARY KEY,                                                   -- ULID
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 240 AND name = trim(name)), -- 1–60 graphemes checked by the shared schema; 240 = safety cap
  name_key    TEXT NOT NULL UNIQUE,                                               -- JS name.toLowerCase(): unique ignoring case in any alphabet
  provider    TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 32),            -- speech provider id, 'openrouter'
  model       TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 100),              -- provider model id
  model_name  TEXT NOT NULL CHECK (length(model_name) BETWEEN 1 AND 200),         -- catalog name at the last save (shown when retired)
  voice       TEXT CHECK (voice IS NULL OR length(voice) BETWEEN 1 AND 100),      -- NULL = provider default voice
  settings    TEXT NOT NULL,                                                      -- JSON: the model's accepted subset (settingsFor)
  created_at  TEXT NOT NULL,                                                      -- ISO-8601 UTC
  updated_at  TEXT NOT NULL                                                       -- ISO-8601 UTC, last rename or update
);

-- At most one preset per recording (PK); a deleted preset drops its links, the recordings stay (spec AC-07/AC-08);
-- a deleted recording drops its link (AC-16).
CREATE TABLE IF NOT EXISTS voice_preset_recordings (
  audio_generation_id TEXT PRIMARY KEY REFERENCES audio_generations (id) ON DELETE CASCADE,
  preset_id           TEXT NOT NULL REFERENCES voice_presets (id) ON DELETE CASCADE
);

-- A preset's recordings newest first (cursor by id), its stats, and the preset_id foreign key.
CREATE INDEX IF NOT EXISTS voice_preset_recordings_by_preset ON voice_preset_recordings (preset_id, audio_generation_id);
