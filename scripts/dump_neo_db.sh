#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DUMP_FILE="$PROJECT_DIR/data/neo_dump.sql"

CONTAINER_NAME="${NEO_PG_CONTAINER:-neo-neo-postgres-1}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-postgres}"

echo "==> Dumping database from container: $CONTAINER_NAME"
echo "    User: $PG_USER | DB: $PG_DB"

docker exec "$CONTAINER_NAME" pg_dump \
    -U "$PG_USER" \
    -d "$PG_DB" \
    --no-owner \
    --no-privileges \
    --inserts \
    2>/dev/null \
    | sed '/pg_search/d; /bm25/Id; /paradedb/Id; /^\\restrict/d; /^\\unrestrict/d' \
    > "$DUMP_FILE"

LINE_COUNT=$(wc -l < "$DUMP_FILE")
FILE_SIZE=$(du -h "$DUMP_FILE" | cut -f1)

echo "==> Dump complete: $DUMP_FILE"
echo "    Lines: $LINE_COUNT | Size: $FILE_SIZE"
echo "    ParadeDB extensions stripped."
