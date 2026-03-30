#!/usr/bin/env bash
# Delete log files older than 30 days, skipping files modified within the last 24 hours.
set -euo pipefail

LOGS_DIR="$(cd "$(dirname "$0")/.." && pwd)/logs"

if [ ! -d "$LOGS_DIR" ]; then
  echo "Logs directory not found: $LOGS_DIR"
  exit 0
fi

find "$LOGS_DIR" -type f -name "*.log*" -mtime +30 ! -mtime -1 -delete

echo "Log cleanup complete."
