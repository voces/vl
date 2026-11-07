#!/bin/bash
# Writes each inventory row's `Repro:` block to OUT/<inventory>-<row>.vl and prints the count.
#
#   scripts/id-shadow/witnesses.sh OUT DIR...
#
# A block is the fenced or indented text after a `Repro:` line, up to the first line that is
# neither blank nor indented. This approximates `scripts/lib/inventory.vl`'s grammar: it is the
# population the identity shadow sweeps, not a grader.
set -euo pipefail
OUT="$1"; shift
mkdir -p "$OUT"
n=0
for d in "$@"; do
  tag="$(basename "${d%/}")"
  for f in "$d"/D*.md; do
    row="$(basename "$f" .md)"
    c="$(awk -v out="$OUT/$tag-$row" '
      function flush() {
        if (body ~ /[^ \n]/) {
          name = out (k ? "-" k : "") ".vl"; sub(/^\n+/, "", body); sub(/\n+$/, "", body)
          print body > name; close(name); k++
        }
        body = ""; st = 0
      }
      st == 0 && /^[ \t]*Repro:/ { st = 1; next }
      st == 1 && /^[ \t]*$/ { next }
      st == 1 && /^[ \t]*```/ { st = 2; next }
      st == 1 && /^    / { st = 3 }
      st == 1 { st = 0 }
      st == 2 && /^[ \t]*```/ { flush(); next }
      st == 2 { body = body $0 "\n"; next }
      st == 3 && (/^    / || /^[ \t]*$/) { body = body substr($0, 5) "\n"; next }
      st == 3 { flush() }
      st == 0 && /^[ \t]*Repro:/ { st = 1 }
      END { if (st >= 2) flush(); print k + 0 }
    ' "$f")"
    n=$((n + c))
  done
done
echo "$n"
