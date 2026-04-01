#!/usr/bin/env bash
set -euo pipefail

DB_DIR="$HOME/Documents/workflow-data"
DB_PATH="$DB_DIR/workflow.db"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
BACKUP_PATH="$DB_DIR/workflow-$TIMESTAMP.backup.db"

cp "$DB_PATH" "$BACKUP_PATH"
echo "Backup created: $BACKUP_PATH"
