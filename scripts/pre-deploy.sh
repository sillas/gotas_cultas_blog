#!/usr/bin/env sh
set -eu

echo "[pre-deploy] Running production build, tests and CDK synth (no deploy)..."
npm run check
node scripts/project-ops.mjs check
git rev-parse --is-inside-work-tree >/dev/null
test "$(git branch --show-current)" = "main" || {
  echo "[pre-deploy] Run from the main branch." >&2
  exit 1
}

echo "[pre-deploy] Ready. This script never deploys or changes AWS/GitHub state."
