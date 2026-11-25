#!/usr/bin/env bash
# Refuse to commit if anything that looks like an NVIDIA API key is staged or tracked.
set -euo pipefail
if git grep -n "nvapi""-" || git grep -n --cached "nvapi""-"; then
  echo "ABORT: API key pattern found" >&2
  exit 1
fi
