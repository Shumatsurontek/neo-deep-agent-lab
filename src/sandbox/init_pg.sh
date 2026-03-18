#!/bin/bash
set -e

# Detect PG version
PG_VERSION=$(pg_lsclusters -h | head -1 | awk '{print $1}')
echo "PostgreSQL version: $PG_VERSION"

# Start PostgreSQL
pg_ctlcluster $PG_VERSION main start
echo "PostgreSQL started."

# Set password
su - postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\""
echo "Password set."

# Load dump if present
if [ -f /tmp/neo_dump.sql ]; then
    echo "Loading dump..."
    su - postgres -c "psql -d postgres < /tmp/neo_dump.sql" 2>&1 | tail -5
    echo "Dump loaded."
fi

# Set statement timeout
su - postgres -c "psql -c \"ALTER USER postgres SET statement_timeout = '10s';\""
echo "Statement timeout set."

# Set read-only mode (last!)
su - postgres -c "psql -c \"ALTER USER postgres SET default_transaction_read_only = ON;\""
echo "Read-only mode set."

# Verify
TABLE_COUNT=$(su - postgres -c "psql -t -A -d postgres -c \"SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';\"")
echo "Public tables: $TABLE_COUNT"
echo "Init complete!"
