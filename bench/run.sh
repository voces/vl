#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# bench/run.sh — VL cross-runtime benchmark harness
#
#   Runs every bench/<category>/<name>/ across three runtimes (VL, Rust, deno),
#   verifies stdout against meta.json's `expect`, and emits
#   bench/results/results.json + bench/results/summary.md.
#
#   See bench/README.md for the methodology, the verdict thresholds and the
#   list of things this harness deliberately does NOT do.
#
# Usage:
#   bench/run.sh                       # full sweep, 5 reps
#   BENCH_REPS=9 bench/run.sh          # more reps
#   BENCH_FILTER='arith/' bench/run.sh # only benchmarks whose "cat/name" matches
#   BENCH_PIN=none bench/run.sh        # disable taskset pinning
#   BENCH_QUICK=1 bench/run.sh         # 1 rep, for a smoke test (marks results QUICK)
#
# Env knobs (all optional):
#   BENCH_REPS    number of timed runs per configuration      (default 5)
#   BENCH_PIN     taskset cpu list, or "none"                 (default 2-5)
#   BENCH_FILTER  ERE matched against "<category>/<name>"     (default all)
#   BENCH_WORK    scratch dir for build artifacts             (default /tmp/vl-bench-work)
#   BENCH_OUT     output dir                                  (default bench/results)
#   BENCH_TIMEOUT per-run wall clock cap, seconds             (default 300)
#   BENCH_SKIP    space-separated list of "<category>/<name>" to skip
#   BENCH_NOISE   bench to use for the noise-floor probe      (default arith/i32-accum)
# ---------------------------------------------------------------------------
set -u -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
# Stand-ins for GNU tools a host lacks (macOS has no `timeout`); last on PATH, so real ones win.
export PATH="$PATH:$ROOT/scripts/compat"

REPS="${BENCH_REPS:-5}"
[ "${BENCH_QUICK:-0}" = "1" ] && REPS=1
PIN="${BENCH_PIN:-2-5}"
FILTER="${BENCH_FILTER:-}"
WORK="${BENCH_WORK:-/tmp/vl-bench-work}"
OUT="${BENCH_OUT:-$ROOT/bench/results}"
TIMEOUT="${BENCH_TIMEOUT:-300}"
SKIP="${BENCH_SKIP:-}"
NOISE_BENCH="${BENCH_NOISE:-arith/i32-accum}"

VL="$ROOT/scripts/vl-host/target/release/vl"

# `vl build -O3` shells out to wasm-opt. If it cannot find one it prints a NOTE
# to stderr and writes the UNOPTIMIZED module — so without this the whole -O3
# column silently measures the -O0 module. Point it at the vendored binaryen.
if [ -z "${VL_WASM_OPT:-}" ] && [ -x "$ROOT/node_modules/binaryen/bin/wasm-opt" ]; then
  export VL_WASM_OPT="$ROOT/node_modules/binaryen/bin/wasm-opt"
fi

mkdir -p "$WORK" "$WORK/exp" "$OUT" || exit 1
NDJSON="$OUT/raw.ndjson"
# BENCH_REPORT_ONLY=1 regenerates results.json + summary.md from an existing
# raw.ndjson without re-measuring anything.
REPORT_ONLY="${BENCH_REPORT_ONLY:-0}"
if [ "$REPORT_ONLY" != "1" ]; then
  : > "$NDJSON"
elif [ ! -s "$NDJSON" ]; then
  echo "BENCH_REPORT_ONLY=1 but $NDJSON is empty or missing" >&2; exit 1
fi

# --- pinning -----------------------------------------------------------------
# The box is a 24-thread i9-12900KF. Pinning to a small set of sibling threads
# (default 2 physical cores / 4 hw threads) cuts scheduler migration noise while
# still leaving room for deno's background JIT/GC threads and wasmtime's helper
# threads — pinning to a SINGLE cpu would systematically penalise the runtimes
# that use background threads and make the comparison unfair.
PINCMD=()
if [ "$PIN" != "none" ] && command -v taskset >/dev/null 2>&1; then
  PINCMD=(taskset -c "$PIN")
fi
PIN_RECORDED="$PIN"
[ ${#PINCMD[@]} -eq 0 ] && PIN_RECORDED="none"

# --- tool preflight ----------------------------------------------------------
have_rustc=1; have_deno=1; have_vl=1
command -v rustc   >/dev/null 2>&1 || have_rustc=0
command -v deno    >/dev/null 2>&1 || have_deno=0
[ -x "$VL" ] || have_vl=0

RUSTC_V="$(rustc --version 2>/dev/null | head -1)"
DENO_V="$(deno --version 2>/dev/null | head -1)"
VL_V="$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null)"
# bench/meta.vl and bench/report.vl run on the vl binary, so it is not optional.
[ "$have_vl" = "1" ] || { echo "no vl binary at $VL (bench/meta.vl and bench/report.vl run on it)" >&2; exit 1; }

echo "== VL benchmark harness =="
echo "   root      $ROOT"
echo "   reps      $REPS   pin: $PIN_RECORDED   timeout: ${TIMEOUT}s"
echo "   work      $WORK"
echo "   out       $OUT"
echo "   rustc     $RUSTC_V"
echo "   deno      $DENO_V"
echo "   vl        $VL (repo $VL_V)"
echo

# --- json helpers ------------------------------------------------------------
# jstr <s>  -> a JSON string literal, safely escaped.
#   Backslash, quote, newline, tab and return get their short escapes; every other
#   control character becomes \u00XX. Bytes >= 0x80 pass through as UTF-8.
#   perl rather than `sed -z`, which BSD sed (macOS) does not have.
jstr() {
  printf '"'
  perl -0777 -pe 's/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g; s/\t/\\t/g; s/\r/\\r/g;
                  s/([\x00-\x1f])/sprintf("\\u%04x", ord $1)/ge'
  printf '"'
}

emit() { # emit <json-object-line>
  printf '%s\n' "$1" >> "$NDJSON"
}

# --- timing core -------------------------------------------------------------
# run_once <stdout-file> <stderr-file> -- <cmd...>
# sets LAST_MS (float, milliseconds) and LAST_RC
LAST_MS=0
LAST_RC=0
run_once() {
  local so="$1" se="$2"; shift 2
  [ "$1" = "--" ] && shift
  local s e
  s=$(date +%s%N)
  # `${a[@]+...}`: bash 3.2 (macOS) reads an empty array as unset under `set -u`.
  timeout -k 5 "$TIMEOUT" ${PINCMD[@]+"${PINCMD[@]}"} "$@" >"$so" 2>"$se"
  LAST_RC=$?
  e=$(date +%s%N)
  LAST_MS=$(awk -v a="$s" -v b="$e" 'BEGIN{printf "%.3f",(b-a)/1000000.0}')
}

# --- one measured configuration ---------------------------------------------
# measure <bench> <category> <name> <config> <lang> <expect-file> <cmd...>
# Runs REPS times, verifies stdout each time, appends one NDJSON record.
measure() {
  local bench="$1" cat="$2" nm="$3" cfg="$4" lang="$5" expf="$6"; shift 6
  local so="$WORK/out.txt" se="$WORK/err.txt"
  local times=() status="OK" errmsg="" firstout=""
  local i
  for ((i=0;i<REPS;i++)); do
    run_once "$so" "$se" -- "$@"
    if [ "$LAST_RC" -ne 0 ]; then
      status="RUN-FAIL"
      errmsg="rc=$LAST_RC $(head -c 400 "$se" 2>/dev/null)"
      break
    fi
    if [ "$i" -eq 0 ]; then firstout="$(head -c 2000 "$so")"; fi
    if [ -n "$expf" ] && [ -f "$expf" ]; then
      if ! cmp -s "$so" "$expf"; then
        status="MISMATCH"
        errmsg="stdout != expect; got: $(head -c 300 "$so" | tr '\n' '|')"
        break
      fi
    fi
    times+=("$LAST_MS")
  done

  local tj="[]" med="null" mn="null" mx="null"
  if [ "$status" = "OK" ] && [ ${#times[@]} -gt 0 ]; then
    tj="[$(IFS=,; echo "${times[*]}")]"
    read -r med mn mx < <(printf '%s\n' "${times[@]}" | sort -n | awk '
      {a[NR]=$1} END{ if(NR%2) m=a[(NR+1)/2]; else m=(a[NR/2]+a[NR/2+1])/2;
        printf "%.3f %.3f %.3f\n", m, a[1], a[NR] }')
  fi

  local ej fj
  ej=$(printf '%s' "$errmsg" | jstr)
  fj=$(printf '%s' "$firstout" | jstr)
  emit "{\"kind\":\"run\",\"bench\":\"$bench\",\"category\":\"$cat\",\"name\":\"$nm\",\"config\":\"$cfg\",\"lang\":\"$lang\",\"status\":\"$status\",\"reps\":${#times[@]},\"median_ms\":$med,\"min_ms\":$mn,\"max_ms\":$mx,\"times_ms\":$tj,\"error\":$ej,\"stdout\":$fj}"

  if [ "$status" = "OK" ]; then
    printf '      %-16s %10s ms  (min %s max %s)\n' "$cfg" "$med" "$mn" "$mx"
  else
    printf '      %-16s %s: %s\n' "$cfg" "$status" "$(printf '%s' "$errmsg" | head -c 140)"
  fi
}

# --- a build step (compile time is measured, but ALWAYS separately) ----------
# build_step <bench> <cat> <nm> <config> <lang> <cmd...>  -> BUILD_OK=0/1
BUILD_OK=1
build_step() {
  local bench="$1" cat="$2" nm="$3" cfg="$4" lang="$5"; shift 5
  local so="$WORK/bout.txt" se="$WORK/berr.txt"
  local times=() i
  BUILD_OK=1
  for ((i=0;i<3;i++)); do
    run_once "$so" "$se" -- "$@"
    if [ "$LAST_RC" -ne 0 ]; then
      local ej
      ej=$(printf 'rc=%s %s' "$LAST_RC" "$(head -c 600 "$se")" | jstr)
      emit "{\"kind\":\"build\",\"bench\":\"$bench\",\"category\":\"$cat\",\"name\":\"$nm\",\"config\":\"$cfg\",\"lang\":\"$lang\",\"status\":\"BUILD-FAIL\",\"median_ms\":null,\"min_ms\":null,\"max_ms\":null,\"times_ms\":[],\"error\":$ej}"
      printf '      %-16s BUILD-FAIL: %s\n' "$cfg" "$(head -c 160 "$se" | tr '\n' ' ')"
      BUILD_OK=0
      return 1
    fi
    times+=("$LAST_MS")
  done
  local med mn mx
  read -r med mn mx < <(printf '%s\n' "${times[@]}" | sort -n | awk '
    {a[NR]=$1} END{ if(NR%2) m=a[(NR+1)/2]; else m=(a[NR/2]+a[NR/2+1])/2;
      printf "%.3f %.3f %.3f\n", m, a[1], a[NR] }')
  emit "{\"kind\":\"build\",\"bench\":\"$bench\",\"category\":\"$cat\",\"name\":\"$nm\",\"config\":\"$cfg\",\"lang\":\"$lang\",\"status\":\"OK\",\"median_ms\":$med,\"min_ms\":$mn,\"max_ms\":$mx,\"times_ms\":[$(IFS=,; echo "${times[*]}")],\"error\":\"\"}"
  printf '      %-16s %10s ms (compile)\n' "$cfg" "$med"
  return 0
}

# =============================================================================
# 1. STARTUP BASELINES (empty program per runtime)
# =============================================================================
if [ "$REPORT_ONLY" = "1" ]; then
  echo "-- BENCH_REPORT_ONLY=1: regenerating the report from $NDJSON --"
else
echo "-- startup baselines (empty program, $REPS reps) --"
SB="$WORK/startup"; mkdir -p "$SB"
: > "$SB/empty.js"
printf 'fn main() {}\n' > "$SB/empty.rs"
printf 'function main() {}\nmain()\n' > "$SB/empty.vl"
: > "$SB/empty.expect"

if [ "$have_rustc" = "1" ]; then
  build_step "_startup" "_startup" "empty" "rustc-O-build" "rust" \
    rustc -O "$SB/empty.rs" -o "$SB/empty.bin"
  [ "$BUILD_OK" = "1" ] && measure "_startup" "_startup" "empty" "rust" "rust" "$SB/empty.expect" "$SB/empty.bin"
fi
if [ "$have_vl" = "1" ]; then
  build_step "_startup" "_startup" "empty" "vl-build" "vl" \
    "$VL" build "$SB/empty.vl" -o "$SB/empty.wasm"
  if [ "$BUILD_OK" = "1" ]; then
    measure "_startup" "_startup" "empty" "vl" "vl" "$SB/empty.expect" "$VL" run "$SB/empty.wasm"
    # `vl run <src>` = compile+run in one process; the delta against the line
    # above is what a user pays for not pre-building.
    measure "_startup" "_startup" "empty" "vl-run-src" "vl" "$SB/empty.expect" "$VL" run "$SB/empty.vl"
  fi
fi
[ "$have_deno" = "1" ] && measure "_startup" "_startup" "empty" "deno" "js" "$SB/empty.expect" deno run --quiet "$SB/empty.js"
echo

# =============================================================================
# 2. THE SWEEP
# =============================================================================
metas=$(find "$ROOT/bench" -mindepth 3 -maxdepth 3 -name meta.json | sort)
nbench=0; nrun=0

for meta in $metas; do
  d="$(dirname "$meta")"
  nm="$(basename "$d")"
  cat_="$(basename "$(dirname "$d")")"
  bench="$cat_/$nm"
  nbench=$((nbench+1))

  case " $SKIP " in *" $bench "*) echo "-- $bench : SKIPPED (BENCH_SKIP)"; continue;; esac
  if [ -n "$FILTER" ] && ! printf '%s' "$bench" | grep -Eq "$FILTER"; then continue; fi

  # --- read meta -------------------------------------------------------------
  # bench/meta.vl writes the expect files for main and each extra .vl variant, and
  # the VOID reason, axis and variant list as <workdir>/exp/<cat>_<name>.{void,axis,variants}.
  "$VL" run bench/meta.vl -- "$meta" "$WORK" || { echo "-- $bench : meta.json unreadable --" >&2; exit 1; }
  voidreason=$(cat "$WORK/exp/${cat_}_${nm}.void")
  axis=$(cat "$WORK/exp/${cat_}_${nm}.axis")
  variants=$(cat "$WORK/exp/${cat_}_${nm}.variants")

  if [ -n "$voidreason" ]; then
    ej=$(printf '%s' "$voidreason" | jstr)
    emit "{\"kind\":\"void\",\"bench\":\"$bench\",\"category\":\"$cat_\",\"name\":\"$nm\",\"reason\":$ej}"
    echo "-- $bench : VOID (skipped) --"
    continue
  fi

  echo "-- $bench --"
  aj=$(printf '%s' "$axis" | jstr)
  emit "{\"kind\":\"meta\",\"bench\":\"$bench\",\"category\":\"$cat_\",\"name\":\"$nm\",\"axis\":$aj,\"variants\":\"$variants\"}"

  W="$WORK/${cat_}_${nm}"; mkdir -p "$W"
  EX="$WORK/exp/${cat_}_${nm}"

  # ---- Rust ----------------------------------------------------------------
  if [ "$have_rustc" = "1" ] && [ -f "$d/main.rs" ]; then
    if build_step "$bench" "$cat_" "$nm" "rustc-O-build" "rust" \
         rustc -O "$d/main.rs" -o "$W/main.bin"; then
      measure "$bench" "$cat_" "$nm" "rust" "rust" "$EX.main.expect" "$W/main.bin"
    fi
  fi

  # ---- VL idiomatic (compile time and execution measured SEPARATELY) -------
  if [ "$have_vl" = "1" ] && [ -f "$d/main.vl" ]; then
    if build_step "$bench" "$cat_" "$nm" "vl-build" "vl" \
         "$VL" build "$d/main.vl" -o "$W/main.wasm"; then
      measure "$bench" "$cat_" "$nm" "vl" "vl" "$EX.main.expect" "$VL" run "$W/main.wasm"
    fi
    # The MIDDLE rung. Measuring only default and -O3 cannot distinguish
    # "wasm-opt loses on this shape" (both optimized rungs lose, e.g.
    # arith/mixed-width at 2.23x) from "-O3's profile specifically loses and -O
    # is the best rung" (arrays/sort-heap: 854 / 648 / 837). Those have
    # different answers and a two-rung sweep reports them identically.
    if build_step "$bench" "$cat_" "$nm" "vl-build-O" "vl" \
         "$VL" build "$d/main.vl" -O -o "$W/main.O.wasm"; then
      if cmp -s "$W/main.wasm" "$W/main.O.wasm"; then
        emit "{\"kind\":\"note\",\"bench\":\"$bench\",\"note\":\"O-NOOP\"}"
        echo "      (note: -O module is byte-identical to -O0)"
      fi
      measure "$bench" "$cat_" "$nm" "vl-O" "vl" "$EX.main.expect" "$VL" run "$W/main.O.wasm"
    fi
    if build_step "$bench" "$cat_" "$nm" "vl-build-O3" "vl" \
         "$VL" build "$d/main.vl" -O3 -o "$W/main.O3.wasm"; then
      # Guard: `vl build -O3` writes the UNOPTIMIZED module (with only a stderr
      # note) when it cannot find wasm-opt. Byte-identical output means the -O3
      # column is not measuring -O3.
      if cmp -s "$W/main.wasm" "$W/main.O3.wasm"; then
        emit "{\"kind\":\"note\",\"bench\":\"$bench\",\"note\":\"O3-NOOP\"}"
        echo "      (note: -O3 module is byte-identical to -O0)"
      fi
      measure "$bench" "$cat_" "$nm" "vl-O3" "vl" "$EX.main.expect" "$VL" run "$W/main.O3.wasm"
    fi
    # ---- extra VL spellings (opt.vl, toplevel.vl, globals.vl, ...) ---------
    for v in $variants; do
      if build_step "$bench" "$cat_" "$nm" "vl-$v-build" "vl" \
           "$VL" build "$d/$v.vl" -o "$W/$v.wasm"; then
        measure "$bench" "$cat_" "$nm" "vl-$v" "vl" "$EX.$v.expect" "$VL" run "$W/$v.wasm"
      fi
    done
  fi

  # ---- deno ----------------------------------------------------------------
  if [ "$have_deno" = "1" ] && [ -f "$d/main.js" ]; then
    measure "$bench" "$cat_" "$nm" "deno" "js" "$EX.main.expect" deno run --quiet "$d/main.js"
  fi

  nrun=$((nrun+1))
done

# =============================================================================
# 3. NOISE FLOOR — re-run one identical configuration a second time
# =============================================================================
echo
echo "-- noise floor probe ($NOISE_BENCH, identical config re-run) --"
nb_d="$ROOT/bench/$NOISE_BENCH"
nb_cat="$(dirname "$NOISE_BENCH")"; nb_nm="$(basename "$NOISE_BENCH")"
nb_W="$WORK/${nb_cat}_${nb_nm}"
nb_EX="$WORK/exp/${nb_cat}_${nb_nm}.main.expect"
if [ -d "$nb_d" ] && [ -f "$nb_W/main.wasm" ]; then
  measure "_noise" "_noise" "$nb_nm" "vl-repeat" "vl" "$nb_EX" "$VL" run "$nb_W/main.wasm"
  [ -f "$nb_W/main.bin" ] && measure "_noise" "_noise" "$nb_nm" "rust-repeat" "rust" "$nb_EX" "$nb_W/main.bin"
  [ "$have_deno" = "1" ] && measure "_noise" "_noise" "$nb_nm" "deno-repeat" "js" "$nb_EX" deno run --quiet "$nb_d/main.js"
else
  echo "   (noise bench not built in this sweep; skipping)"
fi
fi  # end of the measuring phase (skipped under BENCH_REPORT_ONLY)

# =============================================================================
# 4. REPORT
# =============================================================================
echo
echo "-- writing report --"
"$VL" run bench/report.vl -- --raw "$NDJSON" --out "$OUT" --reps "$REPS" \
  --pin "$PIN_RECORDED" --quick "${BENCH_QUICK:-0}" --noise "$NOISE_BENCH" \
  --rustc "$RUSTC_V" --deno "$DENO_V" --commit "$VL_V" \
  --generated "$(date +%Y-%m-%dT%H:%M:%S)"
rc=$?
echo "done (rc=$rc): $OUT/results.json  $OUT/summary.md"
exit $rc
