#!/usr/bin/env bash
set -eo pipefail

if [ -z "${1:-}" ]; then
  echo "ERROR: No commit message file provided"
  exit 1
fi

msg=$(head -1 "$1")
pattern="^(feat|fix|hotfix|chore|docs|test|refactor|style|perf|ci|build|revert)\([a-z0-9._-]+\): .+$"

if ! echo "$msg" | grep -qE "$pattern"; then
  echo "ERROR: Commit message does not match <type>(<scope>): <description>"
  echo "Got: $msg"
  echo "Allowed types: feat, fix, hotfix, chore, docs, test, refactor, style, perf, ci, build, revert"
  exit 1
fi
