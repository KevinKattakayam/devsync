#!/usr/bin/env bash
set -euo pipefail
# Read data only from the base workflow; never execute downloaded artifacts.
service="$1"
mkdir -p baseline
if [[ "${GITHUB_EVENT_NAME:-}" == "workflow_dispatch" ]]; then BASE_SHA="$(git rev-parse HEAD^)"; fi
if [[ ! "${BASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Missing validated base commit for coverage comparison' >&2
  exit 1
fi
run_id=$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/main.yml/runs?head_sha=${BASE_SHA}&status=success&per_page=1" --jq '.workflow_runs[0].id // empty')
if [[ "$run_id" =~ ^[0-9]+$ ]]; then
  gh run download "$run_id" --repo "$GITHUB_REPOSITORY" --name "coverage-${service}" --dir baseline
  node tools/ci/coverage.mjs "$service" "coverage/${service}/coverage-summary.json" baseline/coverage-summary.json
elif git cat-file -e "${BASE_SHA}:tools/ci/coverage-baseline.json" 2>/dev/null; then
  echo 'No successful base-commit coverage artifact exists yet; comparing against the measured baseline from the base commit'
  git show "${BASE_SHA}:tools/ci/coverage-baseline.json" > baseline/coverage-summary.json
  node tools/ci/coverage.mjs "$service" "coverage/${service}/coverage-summary.json" baseline/coverage-summary.json
else
  echo 'No successful base-commit coverage artifact or base-commit measured baseline; refusing to skip comparison' >&2
  exit 1
fi
