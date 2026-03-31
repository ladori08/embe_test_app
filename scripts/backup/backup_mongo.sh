#!/usr/bin/env bash
set -euo pipefail

# Cron often has a minimal PATH; include common bins explicitly.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

TYPE="${1:-auto}"
case "$TYPE" in
  auto|login|manual) ;;
  *)
    echo "Usage: $0 [auto|login|manual]"
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKUP_LOCAL_DIR="${BACKUP_LOCAL_DIR:-$REPO_ROOT/backups/mongo}"
MONGO_CONTAINER_NAME="${MONGO_CONTAINER_NAME:-embe-mongodb}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/embe?replicaSet=rs0}"
RETENTION_AUTO="${RETENTION_AUTO:-16}"
RETENTION_LOGIN="${RETENTION_LOGIN:-10}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
DOCKER_BIN="${DOCKER_BIN:-$(command -v docker || true)}"

if [[ -z "$DOCKER_BIN" ]]; then
  echo "[backup] error: docker command not found in PATH"
  exit 1
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
UNIQ_SUFFIX="${RANDOM}"
FILE_NAME="embe-${TYPE}-${TIMESTAMP}-${UNIQ_SUFFIX}.archive.gz"
TARGET_DIR="$BACKUP_LOCAL_DIR/$TYPE"
TARGET_PATH="$TARGET_DIR/$FILE_NAME"
TMP_PATH="${TARGET_PATH}.tmp"

mkdir -p "$TARGET_DIR"

echo "[backup] creating $TYPE backup -> $TARGET_PATH"
if ! "$DOCKER_BIN" exec "$MONGO_CONTAINER_NAME" sh -lc "mongodump --uri='$MONGO_URI' --archive --gzip" > "$TMP_PATH"; then
  echo "[backup] error: mongodump failed"
  rm -f "$TMP_PATH"
  exit 1
fi
mv "$TMP_PATH" "$TARGET_PATH"

echo "[backup] done: $TARGET_PATH"

prune_local() {
  local dir="$1"
  local keep="$2"
  local files
  files="$(find "$dir" -maxdepth 1 -type f -name "*.archive.gz" -print | sort)"
  local total
  total="$(printf '%s\n' "$files" | sed '/^$/d' | wc -l | tr -d ' ')"
  if (( total <= keep )); then
    return
  fi
  local remove_count=$((total - keep))
  printf '%s\n' "$files" | sed '/^$/d' | head -n "$remove_count" | while IFS= read -r file; do
    echo "[backup] prune local: $file"
    rm -f "$file"
  done
}

prune_remote() {
  local remote_dir="$1"
  local keep="$2"
  local files
  files="$(rclone lsf --files-only "$remote_dir" | grep -E '\.archive\.gz$' | sort || true)"
  local total
  total="$(printf '%s\n' "$files" | sed '/^$/d' | wc -l | tr -d ' ')"
  if (( total <= keep )); then
    return
  fi
  local remove_count=$((total - keep))
  printf '%s\n' "$files" | sed '/^$/d' | head -n "$remove_count" | while IFS= read -r file; do
    echo "[backup] prune remote: $remote_dir/$file"
    rclone deletefile "$remote_dir/$file"
  done
}

if [[ -n "$RCLONE_REMOTE" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    REMOTE_DIR="${RCLONE_REMOTE%/}/$TYPE"
    echo "[backup] upload -> $REMOTE_DIR/$FILE_NAME"
    rclone copyto "$TARGET_PATH" "$REMOTE_DIR/$FILE_NAME"
  else
    echo "[backup] skip upload: rclone not installed"
  fi
fi

if [[ "$TYPE" == "auto" ]]; then
  prune_local "$TARGET_DIR" "$RETENTION_AUTO"
  if [[ -n "$RCLONE_REMOTE" ]] && command -v rclone >/dev/null 2>&1; then
    prune_remote "${RCLONE_REMOTE%/}/$TYPE" "$RETENTION_AUTO"
  fi
elif [[ "$TYPE" == "login" ]]; then
  prune_local "$TARGET_DIR" "$RETENTION_LOGIN"
  if [[ -n "$RCLONE_REMOTE" ]] && command -v rclone >/dev/null 2>&1; then
    prune_remote "${RCLONE_REMOTE%/}/$TYPE" "$RETENTION_LOGIN"
  fi
fi

echo "[backup] completed successfully"
