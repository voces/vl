#!/usr/bin/env bash
# The NATIVE self-hosting fixpoint — gcc-style stage3 == stage4 with zero
# TS/deno/V8 in the loop. The auditable bootstrap proof:
#
#   stage3 = vl build compiler/entry.vl                       (seeded compiler)
#   stage4 = vl build compiler/entry.vl --compiler stage3     (self-rebuilt compiler)
#   assert stage3 == stage4 byte-for-byte, and stage3 runs a program correctly
#
# Prereqs (each step prints how to produce it if missing):
#   build/vl-compiler.wasm        — the seed (scripts/fetch-seed.sh, or scripts/refresh-compiler.sh)
#   scripts/vl-host target        — the vl binary (cargo build --release in scripts/vl-host)
#
# The compiler is built from REAL `import`/`export` modules: `compiler/entry.vl`
# re-exports the host ABI under bare names (H-reexport), and the vl host's module
# fetch loop resolves the graph (entry → driver → the pipeline). No sed/cat/rename
# glue — the module system carries the structure. ~6s total.
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
# The self-compile's collector is a CHOICE, not the default's accident: copying from a 2 GiB
# first heap, owned by scripts/self-compile-gc.sh (DECISIONS.md, "The self-compile runs under
# copying from a 2 GiB heap").
. scripts/self-compile-gc.sh
SEED="${SEED:-build/vl-compiler.wasm}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
[ -f "$SEED" ] || { echo "missing seed: $SEED (scripts/fetch-seed.sh, or scripts/refresh-compiler.sh)"; exit 1; }

if [ "${1:-}" = "--pair" ]; then
  # Grade a pair scripts/self-compile-pair.sh built: `names` is the seed's `--names` build and
  # `stage4` is what `names` compiled. A `--names` build is the plain build with only custom
  # sections appended, so the fixpoint is `stage4` == the first bytes of `names`, and the rest
  # of `names` must be nothing but its `name` and `vl-src` sections.
  D="${2:?usage: scripts/native-fixpoint.sh [--pair <dir>]}"
  [ -f "$D/names.wasm" ] && [ -f "$D/stage4.wasm" ] || { echo "missing $D/names.wasm or $D/stage4.wasm"; exit 1; }
  s4=$(wc -c < "$D/stage4.wasm")
  if ! cmp -n "$s4" "$D/names.wasm" "$D/stage4.wasm"; then
    # Tell a broken fixpoint from a `--names` build that stopped being an append.
    echo "== stage4 differs from names' plain bytes; building plain stage3 to say which =="
    "$VL" build compiler/entry.vl -o "$WORK/stage3.wasm" --compiler "$SEED"
    if cmp "$WORK/stage3.wasm" "$D/stage4.wasm"; then
      echo "the fixpoint holds, but a --names build no longer starts with the plain build's bytes"
    else
      echo "NATIVE FIXPOINT FAILED: stage4 differs from stage3"
    fi
    exit 1
  fi
  # Walk the tail's sections: each must be id 0 (custom); print their names.
  tail_names="$(od -An -v -tu1 -j "$s4" "$D/names.wasm" | LC_ALL=C awk '
    function step(b) {
      if (st == 0) { if (b != 0) { printf "a non-custom section (id %d) at tail byte %d\n", b, n; bad = 1; exit 1 } st = 1; sz = 0; sh = 1; return }
      if (st == 1) { sz += (b % 128) * sh; sh *= 128; if (b < 128) { if (sz == 0) { print "an empty custom section"; bad = 1; exit 1 } st = 2; left = sz; nl = 0; nsh = 1 } return }
      left--
      if (st == 2) { nl += (b % 128) * nsh; nsh *= 128; if (b < 128) { st = 3; nm = ""; if (nl == 0) st = 4 } }
      else if (st == 3) { nm = nm sprintf("%c", b); if (length(nm) == nl) { st = 4; names = names " " nm } }
      if (left == 0) { if (st != 4) { print "a truncated custom section name"; bad = 1; exit 1 } st = 0 }
    }
    { for (i = 1; i <= NF; i++) { step($i); n++ } }
    END { if (bad) exit 1; if (st != 0) { print "a truncated section at the end"; exit 1 } print names }')" ||
    { echo "names.wasm past stage4's $s4 bytes is not custom sections: $tail_names"; exit 1; }
  [ -n "$tail_names" ] || { echo "names.wasm carries no custom sections past its plain bytes"; exit 1; }
  for nm in $tail_names; do
    case "$nm" in name|vl-src) ;; *) echo "names.wasm carries an unexpected section '$nm' past its plain bytes"; exit 1 ;; esac
  done
  # The sanity program runs on `names`, which is stage 3 as the standalone mode's is, under the
  # engine configuration stage 4 already compiled it for, so it reuses that `.cwasm` sidecar
  # where `--compiler stage4.wasm` would pay a whole Cranelift compile for a two-line program.
  echo "== stage3 sanity: compiles + runs a program =="
  printf 'print(6 * 7)\nprint(1 + 2)\n' > "$WORK/hello.vl"
  out="$(VL_FUEL=1 VL_PROFILE_GUEST="$WORK/hello.json" "$VL" run "$WORK/hello.vl" --compiler "$D/names.wasm" 2>"$WORK/hello.err")" || true
  [ "$out" = "$(printf '42\n3')" ] || { echo "stage3 misbehaves: $out"; cat "$WORK/hello.err"; exit 1; }
  echo "NATIVE FIXPOINT HOLDS: stage4 == names' plain bytes ($s4 bytes; tail:$tail_names)"
  exit 0
fi

echo "== stage3: seed compiles the compiler =="
"$VL" build compiler/entry.vl -o "$WORK/stage3.wasm" --compiler "$SEED"

echo "== stage3 sanity: compiles + runs a program =="
printf 'print(6 * 7)\nprint(1 + 2)\n' > "$WORK/hello.vl"
out="$("$VL" run "$WORK/hello.vl" --compiler "$WORK/stage3.wasm")"
[ "$out" = "$(printf '42\n3')" ] || { echo "stage3 misbehaves: $out"; exit 1; }

# STAGE 4 IS WHERE A COST REGRESSION FIRST SHOWS. Stage 3 runs the OLD compiler, so a
# quadratic pass added to the source leaves it fast; stage 4 is the candidate compiling
# the compiler, and that is the run that hangs (CLAUDE.md, "A COST REGRESSION SHOWS UP
# ONE BOOTSTRAP STEP LATE"; measured 2026-09-02, D1090: 32 s at L1 against 321 s at L2).
# USER time, not wall: the box is shared, and user seconds are the honest column.
echo "== stage4: stage3 compiles the compiler =="
{ time -p "$VL" build compiler/entry.vl -o "$WORK/stage4.wasm" --compiler "$WORK/stage3.wasm"; } \
  2> "$WORK/stage4.time" || { cat "$WORK/stage4.time"; exit 1; }

cmp "$WORK/stage3.wasm" "$WORK/stage4.wasm"
echo "NATIVE FIXPOINT HOLDS: stage3 == stage4 byte-for-byte ($(wc -c < "$WORK/stage3.wasm") bytes)"

# STAGE 4 IS WHERE A COST REGRESSION FIRST SHOWS. Stage 3 runs the OLD compiler, so a
# quadratic pass added to the source leaves it fast; stage 4 is the candidate compiling
# the compiler, and that is the run that hangs (CLAUDE.md, "A COST REGRESSION SHOWS UP
# ONE BOOTSTRAP STEP LATE"; measured 2026-09-02 on D1090, 32 s at L1 against 321 s at
# L2). USER+SYS, not wall: the box is shared, and CPU seconds are the honest column.
# `scripts/self-compile-time.sh` grades the same build, in guest fuel, against a baseline.
awk '/^user/{u=$2} /^sys/{s=$2} END{printf "stage4 self-compile CPU %.2fs\nSELF_COMPILE_USER_SECONDS=%.2f\n", u + s, u + s}' \
  "$WORK/stage4.time"
