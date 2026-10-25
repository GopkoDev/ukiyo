-- audio-gallery: one model's recordings newest first, and per-model counts / newest id (ADR-0051).
-- A plain index on the existing table; the table itself is not rebuilt.
CREATE INDEX IF NOT EXISTS audio_generations_by_model ON audio_generations (model, id);
