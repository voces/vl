#!/usr/bin/env bash
# The forced IR-only census at two compilers, and which functions changed class between them.
#
#     scripts/ir-only-census-ab.sh <base-commit> <base-seed> <head-seed> <out-dir>
#
# `scripts/ir-only-census.vl` builds its claim-all compiler from the working tree's `compiler/`
# sources (the seed only compiles them), so two runs from one tree measure one compiler whatever
# seeds they name. This restores `compiler/` and `tests/cases/` to <base-commit> for the base run,
# so the base census builds only the programs its own tree held, puts the tree's own back for the
# head run, and prints each class whose count moved and each function that moved (`built` where a
# side has no row). Run it from a clean checkout root; `$VL` is the host, `$JOBS` the fan-out.
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
if ! git diff --quiet -- compiler tests/cases \
  || [ -n "$(git ls-files --others --exclude-standard -- compiler tests/cases)" ]; then
  echo "ir-only-census-ab: compiler/ or tests/cases/ has local changes; commit them first" >&2
  exit 2
fi
mkdir -p "$OUT"
census() {
  JOBS=${JOBS:-4} "$VL" run scripts/ir-only-census.vl --compiler "$1" -- --seed "$1" --out "$2" \
    > "$2.log" 2>&1
}
# Files only the base held come back untracked; the check above saw none at the start.
restore() {
  git restore --worktree compiler tests/cases
  git ls-files --others --exclude-standard -z -- compiler tests/cases | xargs -0 -r rm -f
}
trap restore EXIT
git restore --source="$BASE" --worktree compiler tests/cases
census "$SEED_BASE" "$OUT/base" || { echo "ir-only-census-ab: base census failed" >&2; exit 2; }
restore
census "$SEED_HEAD" "$OUT/head" || { echo "ir-only-census-ab: head census failed" >&2; exit 2; }
trap - EXIT
# Each side's `class\tfunction\tprograms` rows: the class counts that moved, then each function
# whose class differs (`built` where a side has no row).
awk -F '\t' '
  /^#/ { next }
  FNR == NR { b[$2] = $1; cb[$1]++; next }
  { h[$2] = $1; ch[$1]++ }
  END {
    nb = 0; for (f in b) nb++; nh = 0; for (f in h) nh++
    printf "functions missed: %d -> %d\n", nb, nh
    for (k in cb) if (cb[k] != ch[k] + 0) printf "class\t%s\t%d -> %d\n", k, cb[k], ch[k] + 0
    for (k in ch) if (!(k in cb)) printf "class\t%s\t0 -> %d\n", k, ch[k]
    for (f in b) if (!(f in h)) printf "moved\t%s\t%s -> built\n", f, b[f]
    for (f in h) if (!(f in b)) printf "moved\t%s\tbuilt -> %s\n", f, h[f]
      else if (b[f] != h[f]) printf "moved\t%s\t%s -> %s\n", f, b[f], h[f]
  }
' "$OUT/base/functions.tsv" "$OUT/head/functions.tsv" | LC_ALL=C sort
