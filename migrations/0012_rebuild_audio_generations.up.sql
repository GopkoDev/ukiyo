-- text-to-speech: rebuild audio_generations with a cost status, the up-front estimate, a nullable voice
-- («provider default»), the provider, the model's display name and the request duration (ADR-0044).
-- 0011 stays unchanged; this migration keeps every prototype row: an amount becomes a final `known` cost,
-- no amount becomes `unavailable` (owner decision 2026-10-25). Nothing references the table yet, so a
-- rebuild inside the runner's single transaction is safe with foreign keys on.
CREATE TABLE IF NOT EXISTS audio_generations_v2 (
  id              TEXT    PRIMARY KEY,                                              -- ULID, minted when the answer arrives
  provider        TEXT    NOT NULL CHECK (length(provider) BETWEEN 1 AND 32),       -- speech provider id, e.g. 'openrouter'
  model           TEXT    NOT NULL CHECK (length(model) BETWEEN 1 AND 100),         -- provider model id, e.g. elevenlabs/eleven-v3
  model_name      TEXT    CHECK (model_name IS NULL OR length(model_name) BETWEEN 1 AND 200), -- catalog name at save time; NULL = prototype row
  voice           TEXT    CHECK (voice IS NULL OR length(voice) BETWEEN 1 AND 100), -- NULL = provider default voice
  text            TEXT    NOT NULL CHECK (length(trim(text)) > 0),
  settings        TEXT    NOT NULL,                                                 -- JSON: only the voice settings sent (incl. delivery instructions)
  file_path       TEXT    NOT NULL UNIQUE,                                          -- relative to the data dir: audio/<id>.<ext>
  media_type      TEXT    NOT NULL CHECK (media_type IN ('audio/mpeg', 'audio/wav')),
  characters      INTEGER NOT NULL CHECK (characters >= 0),                         -- billed characters: code points of the trimmed text
  cost_micros     INTEGER CHECK (cost_micros IS NULL OR cost_micros >= 0),
  cost_status     TEXT    NOT NULL CHECK (cost_status IN ('known', 'pending', 'unavailable')),
  cost_ref        TEXT,                                                             -- OpenRouter generation id for the later cost lookup
  estimate_micros INTEGER CHECK (estimate_micros IS NULL OR estimate_micros >= 0),  -- up-front estimate, always shown as «≈»; NULL = none
  created_at      TEXT    NOT NULL,                                                 -- ISO-8601 UTC
  duration_ms     INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),          -- request sent → audio received; NULL = prototype row
  CHECK ((cost_status = 'known') = (cost_micros IS NOT NULL))
);

INSERT INTO audio_generations_v2
  (id, provider, model, model_name, voice, text, settings, file_path, media_type, characters,
   cost_micros, cost_status, cost_ref, estimate_micros, created_at, duration_ms)
SELECT id, 'openrouter', model, NULL, voice, text, settings, file_path, media_type, characters,
       cost_micros, CASE WHEN cost_micros IS NULL THEN 'unavailable' ELSE 'known' END, cost_ref, NULL, created_at, NULL
FROM audio_generations;

DROP TABLE audio_generations;
ALTER TABLE audio_generations_v2 RENAME TO audio_generations;

-- The cost resolver reads only pending recordings on boot (ADR-0043).
CREATE INDEX IF NOT EXISTS audio_generations_cost_pending ON audio_generations (id) WHERE cost_status = 'pending';
