-- Add sort_order and archived_at to workflows
ALTER TABLE workflows ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflows ADD COLUMN archived_at INTEGER;

-- Initialize sort_order based on created_at order within each project
WITH ranked AS (
  SELECT id,
    (ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at ASC)) - 1 AS rn
  FROM workflows
)
UPDATE workflows SET sort_order = (SELECT rn FROM ranked WHERE ranked.id = workflows.id);

-- Convert task position_y from absolute canvas coords to band-relative.
-- Relative Y = absolute_y - (workflow_index * TOTAL_BAND) - WORKFLOW_HEADER_HEIGHT
-- TOTAL_BAND = 552 (52 header + 380 content + 120 gap), WORKFLOW_HEADER_HEIGHT = 52
WITH wf_order AS (
  SELECT id AS workflow_id,
    (ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY sort_order ASC, created_at ASC)) - 1 AS wf_index
  FROM workflows
)
UPDATE tasks
SET position_y = position_y - (
  SELECT (wf_index * 552 + 52)
  FROM wf_order
  WHERE wf_order.workflow_id = tasks.workflow_id
)
WHERE workflow_id IS NOT NULL AND position_y IS NOT NULL;

INSERT INTO schema_version (version, applied_at) VALUES (8, unixepoch());
