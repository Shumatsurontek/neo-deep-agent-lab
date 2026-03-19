#!/usr/bin/env bash
set -euo pipefail

branch=$(git rev-parse --abbrev-ref HEAD)

if [ "$branch" = "main" ] || [ "$branch" = "HEAD" ]; then
  exit 0
fi

pattern="^(feat|fix|hotfix|chore|docs|test|refactor|style|perf|ci|build|revert)/[a-z0-9._-]+$"

if ! echo "$branch" | grep -qE "$pattern"; then
  echo "ERROR: Branch name \"$branch\" does not match <type>/<description>"
  echo "Allowed types: feat, fix, hotfix, chore, docs, test, refactor, style, perf, ci, build, revert"
  exit 1
fi
