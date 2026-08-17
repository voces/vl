#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# bench/buffer-view-bounds/run.sh — what the per-access bounds check on a
# `std:buffer` typed view costs in a hot kernel, at each optimizer rung
# (webcraft P1.4).
#
# Four kernel SHAPES x three SPELLINGS x three RUNGS (plus one extra spelling on
# `scale`), and an R=0 control build of every one of them.
#
#   spelling  view      the fenced canonical: `v[i]` / `v[i] = …` through the
#                       typed-view bracket, `0 <= i < length` per access.
#   spelling  accessor  the same kernel written `v.getF32(i)` / `v.setF32(i, …)`
#                       — same check, one fewer call per access, because the
#                       bracket is a function that FORWARDS to this one.
#   spelling  buf       the UNFENCED TWIN: `Buf.loadF32`/`storeF32`, byte offsets,
#                       one call per access and NO check.
#   spelling  hoist     the STATED FAST PATTERN: the view supplies the extent, the
#                       base and the count come out of the loop, and the body is
#                       the bare `__load_*__` / `__store_*__` intrinsic.
#
#   (accessor - buf) = the price of the FENCE at matched call counts
#   (buf - hoist)    = the price of the CALL
#   (view - accessor) = the bracket's forwarding hop (a `none`-rung effect only)
#
# METHOD, and why each part of it is there:
#
# - EVERY MODULE IS PREBUILT. `vl run <src>` carries compile time (100s of ms);
#   only `vl run <prebuilt.wasm>` is a measurement of the kernel.
# - EVERY CONFIGURATION HAS AN R=0 CONTROL — the same source with the trip count
#   zeroed, so it allocates and seeds the identical 4-8 MiB and runs no trips.
#   Its wall time is subtracted, which removes process startup, instantiation,
#   growth and seeding from the number.
# - INTERLEAVED MIN-OF-N. The rep loop is OUTSIDE the configuration loop, so a
#   drifting machine perturbs every row equally instead of the rows that happen
#   to run while it drifts.
# - THE OUTPUT IS ASSERTED. Each shape prints a value that differs between R>0
#   and R=0, so a kernel that was optimized away is reported as WRONG rather
#   than as fast, and the R>0 wall time must additionally exceed its own control
#   by a factor (ELIDE_FACTOR) or the row is failed as elided.
# - `vl build -O3` WITHOUT a wasm-opt on PATH writes the UNOPTIMIZED module and
#   still exits 0 (a note on stderr). That would silently measure -O0 three
#   times, so VL_WASM_OPT is pointed at the vendored binaryen and every rung's
#   module size is asserted to have MOVED.
#
# Usage:
#   bench/buffer-view-bounds/run.sh
#   VB_REPS=9 bench/buffer-view-bounds/run.sh
#   VB_PIN=none bench/buffer-view-bounds/run.sh
# ---------------------------------------------------------------------------
set -u -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1

REPS="${VB_REPS:-5}"
PIN="${VB_PIN:-2-5}"
WORK="${VB_WORK:-/tmp/vl-viewbounds}"
ELIDE_FACTOR="${VB_ELIDE_FACTOR:-3}"

VL="$ROOT/scripts/vl-host/target/release/vl"
COMPILER="$ROOT/build/vl-compiler.wasm"
SRC="$ROOT/bench/buffer-view-bounds"

[ -x "$VL" ] || { echo "FATAL: missing $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
[ -f "$COMPILER" ] || { echo "FATAL: missing $COMPILER (scripts/fetch-seed.sh)"; exit 1; }

if [ -z "${VL_WASM_OPT:-}" ] && [ -x "$ROOT/node_modules/binaryen/bin/wasm-opt" ]; then
  export VL_WASM_OPT="$ROOT/node_modules/binaryen/bin/wasm-opt"
fi
[ -x "${VL_WASM_OPT:-/nonexistent}" ] || {
  echo "FATAL: no wasm-opt (npm ci). -O3 would silently write the UNOPTIMIZED module."
  exit 1
}

RUNNER=("$VL" run)
if [ "$PIN" != "none" ] && command -v taskset > /dev/null 2>&1; then
  RUNNER=(taskset -c "$PIN" "$VL" run)
fi

mkdir -p "$WORK" || exit 1

# Every kernel, as "<shape>-<spelling>". `scale-accessor` is the extra column:
# `scale-view` with the bracket written out as the accessor call it forwards to,
# which is the only spelling that executes the same ONE call per access as
# `scale-buf` while still checking — i.e. the clean isolation of the check at the
# unoptimized rung, where `view` is paying for the forwarding hop as well.
#
# `axpy-fencedhoist` is the ATTRIBUTION control, not a spelling anyone should
# write: the same six per-access compares as `axpy-view`, written by hand over a
# base and an extent hoisted into locals. It separates the check from the field
# reload, which is the whole question §M4 turns on.
#
# `scale-seedtwice` is the control that NAMES the axis: `scale-view` with its
# idempotent seed helper called twice. Same one view, same one column, same
# kernel source — and 3.0x slower, because the reload is decided by whether
# binaryen's inlining budget lets Heap2Local melt the descriptor, not by how many
# views the module holds (§M4).
KERNELS="scale-view scale-accessor scale-buf scale-hoist scale-seedtwice
reduce-view reduce-buf reduce-hoist
axpy-view axpy-fencedhoist axpy-buf axpy-hoist
rows-view rows-buf rows-hoist"
RUNGS="none O O3"

# VB_ONLY is an ERE matched against each kernel name — for re-measuring one
# family without re-timing the whole table.
if [ -n "${VB_ONLY:-}" ]; then
  sel=""
  for k in $KERNELS; do
    echo "$k" | grep -Eq "$VB_ONLY" && sel="$sel $k"
  done
  [ -n "$sel" ] || { echo "FATAL: VB_ONLY='$VB_ONLY' matched no kernel"; exit 1; }
  KERNELS="$sel"
fi

# Inner-loop iterations per run: N * R, identical for all four shapes.
ITERS=525336576

# Accesses per inner-loop iteration, per shape — the multiplier between "per
# iteration" and "per access" in the report.
acc_of() {
  case "$1" in
    scale) echo 2 ;;   # one load + one store
    reduce) echo 1 ;;  # one load
    axpy) echo 3 ;;    # two loads + one store
    rows) echo 2 ;;    # one load + one store
  esac
}

# Expected stdout, R>0 and R=0. The pair is the elision detector.
want_of() { case "$1" in scale) echo 2 ;; reduce) echo 525336576 ;; axpy) echo 501 ;; rows) echo 501 ;; esac; }
want0_of() { case "$1" in scale) echo 1 ;; reduce) echo 0 ;; axpy) echo 0 ;; rows) echo 0 ;; esac; }

flag_of() { case "$1" in none) echo "" ;; O) echo "-O" ;; O3) echo "-O3" ;; esac; }

nk=$(echo "$KERNELS" | wc -w)

# ── build ──────────────────────────────────────────────────────────────────
echo "== building $nk kernels x 3 rungs x {R, R=0} into $WORK =="
built=0
for k in $KERNELS; do
  src="$SRC/$k.vl"
  [ -f "$src" ] || { echo "FATAL: missing $src"; exit 1; }
  # The R=0 control: the identical source with the trip count zeroed.
  ctl="$WORK/$k.r0.vl"
  sed 's/^const R = .*$/const R = 0/' "$src" > "$ctl"
  grep -q '^const R = 0$' "$ctl" || { echo "FATAL: R=0 substitution missed in $ctl"; exit 1; }
  base=""
  for rung in $RUNGS; do
    f=$(flag_of "$rung")
    for v in main ctl; do
      [ "$v" = main ] && s="$src" || s="$ctl"
      out="$WORK/$k.$v.$rung.wasm"
      if [ -z "$f" ]; then
        "$VL" build "$s" --compiler "$COMPILER" -o "$out" > /dev/null 2>&1
      else
        "$VL" build "$s" --compiler "$COMPILER" "$f" -o "$out" > /dev/null 2>&1
      fi
      rc=$?
      [ $rc -eq 0 ] || { echo "FATAL: build rc=$rc for $s $f"; exit 1; }
      built=$((built + 1))
    done
    # Assert wasm-opt actually did something at this rung (see the header).
    sz=$(stat -c%s "$WORK/$k.main.$rung.wasm")
    if [ "$rung" = none ]; then
      base="$sz"
    elif [ "$sz" = "$base" ]; then
      echo "FATAL: $k $rung is byte-size-identical to the unoptimized module — wasm-opt inert?"
      exit 1
    fi
  done
done
echo "   $built modules"

# ── correctness + elision gate, once per configuration ─────────────────────
echo "== verifying output and non-elision =="
for k in $KERNELS; do
  shape="${k%%-*}"
  want=$(want_of "$shape")
  want0=$(want0_of "$shape")
  for rung in $RUNGS; do
    got=$("${RUNNER[@]}" "$WORK/$k.main.$rung.wasm" 2>&1)
    rc=$?
    [ $rc -eq 0 ] || { echo "FATAL: run rc=$rc $k.$rung"; exit 1; }
    [ "$got" = "$want" ] || { echo "FATAL: $k.$rung printed [$got], want [$want]"; exit 1; }
    got0=$("${RUNNER[@]}" "$WORK/$k.ctl.$rung.wasm" 2>&1)
    rc=$?
    [ $rc -eq 0 ] || { echo "FATAL: control run rc=$rc $k.$rung"; exit 1; }
    [ "$got0" = "$want0" ] || { echo "FATAL: control $k.$rung printed [$got0], want [$want0]"; exit 1; }
  done
done
echo "   $nk x 3 configurations produce their expected value, and their controls do not"

# ── interleaved min-of-N ───────────────────────────────────────────────────
declare -A MIN
echo "== timing: $REPS interleaved reps, pin=$PIN =="
for rep in $(seq 1 "$REPS"); do
  for k in $KERNELS; do
    for rung in $RUNGS; do
      for v in main ctl; do
        key="$k/$rung/$v"
        t0=$(date +%s%N)
        "${RUNNER[@]}" "$WORK/$k.$v.$rung.wasm" > /dev/null 2>&1
        rc=$?
        t1=$(date +%s%N)
        [ $rc -eq 0 ] || { echo "FATAL: timed run rc=$rc $key"; exit 1; }
        ns=$((t1 - t0))
        cur="${MIN[$key]:-}"
        if [ -z "$cur" ] || [ "$ns" -lt "$cur" ]; then MIN[$key]=$ns; fi
      done
    done
  done
  echo "   rep $rep/$REPS done"
done

# ── report ─────────────────────────────────────────────────────────────────
echo
echo "ns per inner-loop iteration ($ITERS iterations per run; control subtracted)"
printf '%-8s %-9s %10s %10s %10s %8s\n' shape spelling none -O -O3 acc/iter
for k in $KERNELS; do
  shape="${k%%-*}"
  spell="${k#*-}"
  row=""
  for rung in $RUNGS; do
    m=${MIN["$k/$rung/main"]}
    c=${MIN["$k/$rung/ctl"]}
    d=$((m - c))
    if [ "$m" -lt $((c * ELIDE_FACTOR)) ]; then
      echo "FATAL: $k/$rung ran in ${m}ns against a ${c}ns control — kernel elided?"
      exit 1
    fi
    row="$row $(awk -v d="$d" -v n="$ITERS" 'BEGIN{printf "%10.3f", d/n}')"
  done
  printf '%-8s %-9s%s %8d\n' "$shape" "$spell" "$row" "$(acc_of "$shape")"
done
echo
echo 'At (none) read (accessor - buf) as the CHECK and (buf - hoist) as the CALL;'
echo 'view additionally pays the bracket forwarding hop, which both rungs inline away.'
