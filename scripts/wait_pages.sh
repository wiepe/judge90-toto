#!/usr/bin/env bash
set -euo pipefail
# GitHub queue time counts toward this bounded 15-minute wait. A successful
# build for another commit never proves that this prediction was published.
target_commit=${1:?Expected published commit}
attempts=${PAGES_WAIT_ATTEMPTS:-90}
delay=${PAGES_WAIT_DELAY_SECONDS:-10}
for ((attempt=1; attempt<=attempts; attempt++)); do
  build=$(gh api "repos/$GITHUB_REPOSITORY/pages/builds/latest" --jq '[.status,.commit] | @tsv')
  IFS=$'\t' read -r state built_commit <<< "$build"
  echo "Pages poll $attempt/$attempts: $state ($built_commit)"
  if [[ "$built_commit" == "$target_commit" ]]; then
    if [[ "$state" == built ]]; then exit 0; fi
    if [[ "$state" == errored ]]; then echo 'Pages build failed' >&2; exit 1; fi
  fi
  if ((attempt < attempts)); then sleep "$delay"; fi
done
echo 'Pages build timed out; delivery remains unverified' >&2
exit 1
