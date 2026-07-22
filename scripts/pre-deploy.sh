#!/usr/bin/env sh
set -eu

stage=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --stage) stage="${2:-}"; shift 2 ;;
    --stage=*) stage="${1#*=}"; shift ;;
    *) echo "[pre-deploy] Unknown argument: $1" >&2; exit 1 ;;
  esac
done

case "$stage" in
  homolog) expected_branch="homolog" ;;
  production) expected_branch="production" ;;
  *) echo "[pre-deploy] Use --stage homolog or --stage production." >&2; exit 1 ;;
esac

echo "[pre-deploy] Running builds, tests and CDK synth for $stage (no deploy)..."
npm run check
node scripts/project-ops.mjs check --stage "$stage"
git rev-parse --is-inside-work-tree >/dev/null
test "$(git branch --show-current)" = "$expected_branch" || {
  echo "[pre-deploy] Stage $stage must run from branch $expected_branch." >&2
  exit 1
}

echo "[pre-deploy] Ready. This script never deploys or changes AWS/GitHub state."
