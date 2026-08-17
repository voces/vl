#!/usr/bin/env bash
# Bounded sweep: $1 = cell dir, $2 = result dir.  FOUR concurrent `vl` invocations, never more.
# One result file per cell (never a shared append), so concurrent interleaving cannot corrupt
# a count.
set -u
cd "$(dirname "$0")/.." || exit 99
here="$(basename "$(dirname "$0")")"
cells="$1"
res="$2"
mkdir -p "$res"
rm -f "$res"/*.res
ls "$cells"/*.vl | xargs -P4 -I{} bash "$here/runcell.sh" {} "$res"
echo "cells=$(ls "$cells"/*.vl | wc -l) results=$(ls "$res"/*.res 2>/dev/null | wc -l)"
