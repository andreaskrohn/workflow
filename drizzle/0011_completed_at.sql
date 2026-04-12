-- Add completed_at timestamp, set automatically when a task is first marked done.
ALTER TABLE tasks ADD COLUMN completed_at INTEGER;

-- Back-fill existing done tasks using updated_at as the best available proxy.
UPDATE tasks SET completed_at = updated_at WHERE status = 'done';

INSERT INTO schema_version(version, applied_at) VALUES (12, unixepoch());
