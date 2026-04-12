-- Add review_date to workflows and tasks
ALTER TABLE workflows ADD COLUMN review_date INTEGER;
ALTER TABLE tasks ADD COLUMN review_date INTEGER;

INSERT INTO schema_version (version, applied_at) VALUES (10, unixepoch());
