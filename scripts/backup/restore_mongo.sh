#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-file-path|remote-file-name>"
  echo "Example: $0 backups/mongo/manual/embe-manual-20260324T103000Z.archive.gz"
  exit 1
fi

INPUT_PATH="$1"
MONGO_CONTAINER_NAME="${MONGO_CONTAINER_NAME:-embe-mongodb}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/embe?replicaSet=rs0}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
TMP_DOWNLOAD_DIR="${TMP_DOWNLOAD_DIR:-/tmp/embe-restore}"
FORCE_RESTORE="${FORCE_RESTORE:-0}"

RESOLVED_PATH="$INPUT_PATH"
CLEANUP_TEMP=0

if [[ ! -f "$RESOLVED_PATH" ]]; then
  if [[ -n "$RCLONE_REMOTE" ]] && command -v rclone >/dev/null 2>&1; then
    mkdir -p "$TMP_DOWNLOAD_DIR"
    RESOLVED_PATH="$TMP_DOWNLOAD_DIR/$(basename "$INPUT_PATH")"
    echo "[restore] downloading from remote: ${RCLONE_REMOTE%/}/$INPUT_PATH"
    rclone copyto "${RCLONE_REMOTE%/}/$INPUT_PATH" "$RESOLVED_PATH"
    CLEANUP_TEMP=1
  else
    echo "[restore] backup file not found: $INPUT_PATH"
    echo "[restore] if using remote file, set RCLONE_REMOTE and install rclone"
    exit 1
  fi
fi

if [[ "$FORCE_RESTORE" != "1" ]]; then
  echo "[restore] WARNING: this will replace current MongoDB data (mongorestore --drop)."
  read -r -p "Type 'RESTORE' to continue: " confirm
  if [[ "$confirm" != "RESTORE" ]]; then
    echo "[restore] cancelled"
    exit 1
  fi
fi

echo "[restore] restoring from $RESOLVED_PATH"
cat "$RESOLVED_PATH" | docker exec -i "$MONGO_CONTAINER_NAME" sh -lc "mongorestore --uri='$MONGO_URI' --archive --gzip --drop"

echo "[restore] completed successfully"

if [[ "$CLEANUP_TEMP" == "1" ]]; then
  rm -f "$RESOLVED_PATH"
fi
