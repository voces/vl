#!/usr/bin/env bash
# P7 scratch: generate every prototype variant from a base .wat.
#   p7-gen.sh <base.wat> <outprefix> <variant> [variant ...]
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="$1"; PREFIX="$2"; shift 2
for v in "$@"; do
  echo "=== $v ==="
  python3 "$ROOT/scripts/p7-patch.py" "$BASE" "$v" "$PREFIX.$v"
done
