#!/usr/bin/env bash
# The I8 census's sixth population: the programs only a test's harness builds (a source a test
# writes, or a file outside the five populations, often under its own flags). It runs the ci-native
# suites with `$VL_HARNESS_BIN` pointed at a recording wrapper, which logs each `.vl` argument and
# copies it, then execs the real binary with the same arguments and environment, so no outcome
# changes. Outcomes are not graded here.
#
#     scripts/ir-i8-census/harness-pop.sh <out-dir> [<census-out>]
#
# Writes <out-dir>/log.tsv (sha, path, cwd, VL_* flags, argv), <out-dir>/src/<sha>.vl, and
# <out-dir>/programs.txt: one copied source per program whose bytes no census population holds
# (`<census-out>/programs.txt`, when given). Covers the tests that spawn tests/support/tree.ts's
# `VL`; a test that names the binary's path itself, or runs it through a script, is not seen.
set -euo pipefail
OUT=${1:?usage: harness-pop.sh <out-dir> [<census-out>]}
CEN=${2:-}
REAL=${VL:-$PWD/scripts/vl-host/target/release/vl}
[ -x "$REAL" ] || { echo "harness-pop.sh: no vl binary at $REAL" >&2; exit 2; }
mkdir -p "$OUT/src"
OUT=$(cd "$OUT" && pwd)
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT
: > "$OUT/log.tsv"
cat > "$T/vl" <<WRAP
#!/usr/bin/env bash
for a in "\$@"; do
  case "\$a" in
    *.vl) if [ -f "\$a" ]; then
        h=\$(sha1sum "\$a" | cut -c1-16)
        cp -n "\$a" "$OUT/src/\$h.vl" 2> /dev/null || true
        printf '%s\t%s\t%s\t%s\t%s\n' "\$h" "\$a" "\$PWD" "\$(env | grep -E '^VL_' | tr '\n' ' ')" "\$*" >> "$OUT/log.tsv"
      fi ;;
  esac
done 2> /dev/null
exec "$REAL" "\$@"
WRAP
chmod +x "$T/vl"
VL_HARNESS_BIN="$T/vl" SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check --parallel \
  tests/selfhost_native_*_test.ts tests/vl_*_test.ts > "$OUT/suites.txt" 2>&1 || true
# A source the census already measures is not a new program.
: > "$T/known"
if [ -n "$CEN" ] && [ -f "$CEN/programs.txt" ]; then
  while read -r f; do [ -f "$f" ] && sha1sum "$f" | cut -c1-16; done < "$CEN/programs.txt" > "$T/known"
fi
cut -f1 "$OUT/log.tsv" | sort -u | grep -vxFf "$T/known" | sed "s|^|$OUT/src/|; s|\$|.vl|" > "$OUT/programs.txt" || true
echo "harness-pop: $(cut -f1 "$OUT/log.tsv" | sort -u | wc -l) distinct sources, $(wc -l < "$OUT/programs.txt") outside the census"
