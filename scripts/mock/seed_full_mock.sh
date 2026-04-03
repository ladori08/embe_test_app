#!/usr/bin/env bash
set -euo pipefail

MONGO_CONTAINER_NAME="${MONGO_CONTAINER_NAME:-embe-mongodb}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/embe?replicaSet=rs0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_JS="$SCRIPT_DIR/seed_full_mock.js"

if [[ ! -f "$SEED_JS" ]]; then
  echo "[seed] missing script: $SEED_JS"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[seed] docker command not found"
  exit 1
fi

echo "[seed] using container: $MONGO_CONTAINER_NAME"
echo "[seed] using uri: $MONGO_URI"

docker cp "$SEED_JS" "$MONGO_CONTAINER_NAME:/tmp/seed_full_mock.js"
docker exec -i "$MONGO_CONTAINER_NAME" mongosh "$MONGO_URI" --quiet /tmp/seed_full_mock.js
docker exec -i "$MONGO_CONTAINER_NAME" rm -f /tmp/seed_full_mock.js

echo "[seed] done"
