#!/usr/bin/env bash
# Retry only known transient transport/server errors. Never force or rebase.
set -euo pipefail
log=$(mktemp)
trap 'rm -f "$log"' EXIT
for attempt in 1 2 3; do
  if git push origin HEAD:main >"$log" 2>&1; then
    echo "main push succeeded (attempt $attempt/3)"
    exit 0
  fi
  # Deliberately do not echo raw transport output (remote URLs can carry tokens).
  if grep -Eqi 'non-fast-forward|fetch first|permission|denied|authentication|protected branch|GH006|GH013|repository rule|hook declined' "$log"; then
    echo 'main push rejected: concurrent change, permissions or repository policy; no retry.' >&2
    exit 1
  fi
  if ! grep -Eqi 'fatal error in commit_refs|HTTP (500|502|503|504)|returned error: (500|502|503|504)|remote: Internal Server Error|Connection timed out|Connection reset|Could not resolve host|remote end hung up unexpectedly' "$log"; then
    echo 'main push failed with an unclassified error; no retry.' >&2
    exit 1
  fi
  if [ "$attempt" -eq 3 ]; then
    echo 'main push failed after 3 transient-error attempts; publication must stop.' >&2
    exit 1
  fi
  echo "Transient GitHub push failure; retrying attempt $((attempt+1))/3." >&2
  sleep "$((attempt*15))"
done
