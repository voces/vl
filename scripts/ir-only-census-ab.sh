#!/usr/bin/env bash
# The forced IR-only census at two compilers, and which functions changed class between them.
#
#     scripts/ir-only-census-ab.sh <base-commit> <base-seed> <head-seed> <out-dir>
#
# `scripts/ir-only-census.vl` builds its claim-all compiler from the working tree's `compiler/`
# sources (the seed only compiles them), so two runs from one tree measure one compiler whatever
# seeds they name. This restores `compiler/` to <base-commit> for the base run, puts the tree's own
# back for the head run, and prints each class whose count moved and each function that moved
# (`built` where a side has no row). Run it from a clean checkout root; `$VL` is the host,
# `$JOBS` the census's fan-out.
set -u
if [ $# -ne 4 ]; then
  echo "usage: scripts/ir-only-census-ab.sh <base-commit> <base-seed> <head-seed> <out-dir>" >&2
  exit 2
fi
BASE=$1
SEED_BASE=$2
SEED_HEAD=$3
OUT=$4
VL=${VL:-scripts/vl-host/target/release/vl}
if ! git diff --quiet -- compiler; then
  echo "ir-only-census-ab: compiler/ has local changes; commit them first" >&2
  exit 2
fi
mkdir -p "$OUT"
census() {
  JOBS=${JOBS:-4} "$VL" run scripts/ir-only-census.vl --compiler "$1" -- --seed "$1" --out "$2" \
    > "$2.log" 2>&1
}
restore() { git restore --worktree compiler; }
trap restore EXIT
git restore --source="$BASE" --worktree compiler
census "$SEED_BASE" "$OUT/base" || { echo "ir-only-census-ab: base census failed" >&2; exit 2; }
restore
census "$SEED_HEAD" "$OUT/head" || { echo "ir-only-census-ab: head census failed" >&2; exit 2; }
trap - EXIT
python3 -I - "$OUT/base/functions.tsv" "$OUT/head/functions.tsv" <<'PY'
import collections, sys
def load(p):
    d = {}
    for line in open(p):
        if line.startswith("#"):
            continue
        cls, fn, _ = line.rstrip("\n").split("\t")
        d[fn] = cls
    return d
b, h = load(sys.argv[1]), load(sys.argv[2])
cb, ch = collections.Counter(b.values()), collections.Counter(h.values())
print(f"functions missed: {len(b)} -> {len(h)}")
for k in sorted(set(cb) | set(ch)):
    if cb[k] != ch[k]:
        print(f"class\t{k}\t{cb[k]} -> {ch[k]}")
for f in sorted(set(b) | set(h)):
    if b.get(f) != h.get(f):
        print(f"moved\t{f}\t{b.get(f, 'built')} -> {h.get(f, 'built')}")
PY
