-- Add defer_date to tasks, due_date to workflows
ALTER TABLE tasks ADD COLUMN defer_date INTEGER;
ALTER TABLE workflows ADD COLUMN due_date INTEGER;

INSERT INTO schema_version (version, applied_at) VALUES (7, unixepoch());
