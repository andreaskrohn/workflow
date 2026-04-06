-- Add end-goal node position columns to workflows
ALTER TABLE workflows ADD COLUMN eg_position_x REAL;
ALTER TABLE workflows ADD COLUMN eg_position_y REAL;

INSERT INTO schema_version (version, applied_at) VALUES (9, unixepoch());
