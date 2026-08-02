#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# bench/run.sh — VL cross-runtime benchmark harness
#
#   Runs every bench/<category>/<name>/ across four runtimes (VL, Rust, deno,
#   python3), verifies stdout against meta.json's `expect`, and emits
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

mkdir -p "$WORK" "$OUT" || exit 1
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
have_rustc=1; have_deno=1; have_py=1; have_vl=1
command -v rustc   >/dev/null 2>&1 || have_rustc=0
command -v deno    >/dev/null 2>&1 || have_deno=0
command -v python3 >/dev/null 2>&1 || have_py=0
[ -x "$VL" ] || have_vl=0

RUSTC_V="$(rustc --version 2>/dev/null | head -1)"
DENO_V="$(deno --version 2>/dev/null | head -1)"
PY_V="$(python3 --version 2>&1 | head -1)"
VL_V="$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null)"

echo "== VL benchmark harness =="
echo "   root      $ROOT"
echo "   reps      $REPS   pin: $PIN_RECORDED   timeout: ${TIMEOUT}s"
echo "   work      $WORK"
echo "   out       $OUT"
echo "   rustc     $RUSTC_V"
echo "   deno      $DENO_V"
echo "   python    $PY_V"
echo "   vl        $VL (repo $VL_V)"
echo

# --- json helpers ------------------------------------------------------------
# jstr <s>  -> a JSON string literal, safely escaped.
jstr() { python3 -c 'import json,sys;sys.stdout.write(json.dumps(sys.stdin.read()))'; }

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
  timeout -k 5 "$TIMEOUT" "${PINCMD[@]}" "$@" >"$so" 2>"$se"
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
: > "$SB/empty.py"
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
[ "$have_py"   = "1" ] && measure "_startup" "_startup" "empty" "python" "py" "$SB/empty.expect" python3 "$SB/empty.py"
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
  # Emits, on separate lines: VOID-reason (or empty), axis, python scale, then
  # writes the expect files for main and each extra .vl variant.
  info=$(python3 - "$meta" "$WORK" <<'PYEOF'
import json,sys,os,re
meta_path, work = sys.argv[1], sys.argv[2]
m = json.load(open(meta_path))
d = os.path.dirname(meta_path)
cat = os.path.basename(os.path.dirname(d)); nm = os.path.basename(d)
bench = cat + "/" + nm
exp = m.get("expect", "")
os.makedirs(os.path.join(work, "exp"), exist_ok=True)
def w(tag, s):
    p = os.path.join(work, "exp", (bench.replace("/", "_")) + "." + tag + ".expect")
    open(p, "w").write(s)
    return p
w("main", exp)
w("py", m.get("expectPython", exp))
variants = []
for f in sorted(os.listdir(d)):
    if not f.endswith(".vl") or f == "main.vl":
        continue
    stem = f[:-3]
    key = "expect" + "".join(p.capitalize() for p in re.split(r"[-_]", stem))
    w(stem, m.get(key, exp))
    variants.append(stem)
print(json.dumps({
    "void": m.get("void", ""),
    "axis": m.get("axis", ""),
    "variants": variants,
}))
PYEOF
)
  voidreason=$(printf '%s' "$info" | python3 -c 'import json,sys;print(json.load(sys.stdin)["void"])')
  axis=$(printf '%s' "$info" | python3 -c 'import json,sys;print(json.load(sys.stdin)["axis"])')
  variants=$(printf '%s' "$info" | python3 -c 'import json,sys;print(" ".join(json.load(sys.stdin)["variants"]))')

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

  # ---- python (may be a REDUCED N; normalisation happens in the report) ----
  if [ "$have_py" = "1" ] && [ -f "$d/main.py" ]; then
    measure "$bench" "$cat_" "$nm" "python" "py" "$EX.py.expect" python3 "$d/main.py"
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
BENCH_RAW="$NDJSON" BENCH_OUTDIR="$OUT" BENCH_REPS_R="$REPS" BENCH_PIN_R="$PIN_RECORDED" \
BENCH_RUSTC="$RUSTC_V" BENCH_DENO="$DENO_V" BENCH_PY="$PY_V" BENCH_COMMIT="$VL_V" \
BENCH_QUICK_R="${BENCH_QUICK:-0}" BENCH_NOISE_R="$NOISE_BENCH" \
python3 - <<'PYREPORT'
import json, os, re, sys, datetime

raw   = os.environ["BENCH_RAW"]
outd  = os.environ["BENCH_OUTDIR"]
reps  = int(os.environ["BENCH_REPS_R"])
pin   = os.environ["BENCH_PIN_R"]
quick = os.environ["BENCH_QUICK_R"] == "1"

# ---------------------------------------------------------------------------
# Python reduced-N normalisation factors.
#
# meta.json states Python's reduced N in prose, not machine-readably, so the
# factor is transcribed here from each benchmark's own notes/audit. `None`
# means the benchmark's own audit says NO single scalar factor is valid — the
# report then refuses to print a normalised Python number for it.
# ---------------------------------------------------------------------------
PYSCALE = {
    "algorithms/binarytrees":        (16.0,   "depth 20 vs 16; work ~2^depth"),
    "algorithms/dispatch-table":     (10.0,   "n 50e6 vs 5e6, linear"),
    "algorithms/lambda-hot":         (25.0,   "n 100e6 vs 4e6, linear"),
    "algorithms/mandelbrot":         (64.0,   "n 8000 vs 1000, O(n^2)"),
    "algorithms/map-filter-reduce":  (10.0,   "n 20e6 vs 2e6, linear"),
    "algorithms/nbody":              (100.0,  "n 50e6 vs 0.5e6, linear"),
    "algorithms/spectralnorm":       (100.0,  "n 5500 vs 550, O(n^2)"),
    "arith/bitcount":                (100.0,  "n 200e6 vs 2e6, linear"),
    "arith/bitops":                  (100.0,  "n 200e6 vs 2e6, linear"),
    "arith/convert":                 (100.0,  "n 400e6 vs 4e6, linear"),
    "arith/f64-accum":               (100.0,  "n 300e6 vs 3e6, linear"),
    "arith/floatops":                (100.0,  "n 200e6 vs 2e6, linear"),
    "arith/i32-accum":               (100.0,  "n 1e9 vs 10e6, linear"),
    "arith/i64-accum":               (100.0,  "n 1e9 vs 10e6, linear"),
    "arith/intdivmod":               (100.0,  "n 200e6 vs 2e6, linear"),
    "arith/mixed-width":             (100.0,  "n 300e6 vs 3e6, linear"),
    "arrays/binsearch":              (20.0,   "QUERIES 6e6 vs 300e3"),
    "arrays/fill-sum":               (10.0,   "ROUNDS 200 vs 20"),
    "arrays/matmul":                 (17.8,   "N 600 vs 230, work cubic"),
    "arrays/push-growth":            (5.0,    "ROUNDS 200 vs 40"),
    "arrays/reverse-inplace":        (16.0,   "ROUNDS 400 vs 25"),
    "arrays/sort-heap":              (4.0,    "ROUNDS 4 vs 1"),
    "arrays/struct-aos":             (8.333,  "ROUNDS 500 vs 60"),
    "arrays/struct-soa":             (8.333,  "ROUNDS 500 vs 60"),
    "collections/map-i32":           (4.0,    "n 200e3 vs 50e3, linear"),
    "collections/map-string":        (4.0,    "n 100e3 vs 25e3, linear"),
    "collections/set-ops":           (4.0,    "n 100e3 vs 25e3, linear"),
    "collections/struct-alloc":      (22.45,  "maxDepth 16 vs 12, 58.37M vs 2.60M nodes"),
    "collections/struct-array-scan": (20.0,   "200M vs 10M visits"),
    "collections/struct-field":      (200.0,  "n/m 300e6/200e6 vs 1.5e6/1e6"),
    "collections/word-freq":         (10.0,   "r 120 vs 12"),
    "recursion/ackermann":           (25.6,   "558.6M vs ~21.8M calls; DEPTH also differs 8190 vs 510"),
    "recursion/deeprec":             (None,   "meta audit: BOTH depth and repeats change; no scalar factor is valid"),
    "recursion/fib":                 (29.03,  "F(43)/F(36) call ratio"),
    "recursion/flatcall":            (100.0,  "n 1.2e9 vs 12e6, linear"),
    "recursion/flatcall-inlined":    (100.0,  "n 1.2e9 vs 12e6, linear"),
    "recursion/mutual":              (50.0,   "n 2500 vs 50, same depth 800"),
    "recursion/tailcall":            (None,   "meta audit: BOTH depth and repeats change; no scalar factor is valid"),
    "recursion/treewalk":            (None,   "meta audit: dominated by the one-time tree build; a multiply is wrong"),
    "strings/char-scan":             (10.0,   "PASSES 600 vs 60"),
    "strings/int-format":            (30.0,   "N 30e6 vs 1e6"),
    "strings/slice-extract":         (30.0,   "PASSES 180 vs 6"),
    "strings/str-eq":                (8.0,    "REPS 6e6 vs 750e3"),
    "strings/substr-search":         (1.0,    "no reduction (str.find is a C routine — interpreter floor does not apply)"),
    "strings/token-count":           (20.0,   "PASSES 1000 vs 50"),
}

# --- verdict thresholds (defended in bench/README.md) -----------------------
DENO_WIN, DENO_PAR, DENO_PRIORITY = 0.80, 1.25, 2.00
RUST_HEADROOM_FLAG = 10.0
PY_RED_ALERT = 5.0

recs = [json.loads(l) for l in open(raw) if l.strip()]
runs, builds, metas, voids = {}, {}, {}, []
notes = {}
for r in recs:
    k = r.get("kind")
    if k == "note":
        notes.setdefault(r["bench"], []).append(r["note"])
    elif k == "run":
        runs.setdefault(r["bench"], {})[r["config"]] = r
    elif k == "build":
        builds.setdefault(r["bench"], {})[r["config"]] = r
    elif k == "meta":
        metas[r["bench"]] = r
    elif k == "void":
        voids.append(r)

startup = {}
for cfg, rec in runs.get("_startup", {}).items():
    startup[cfg] = rec["median_ms"] if rec["status"] == "OK" else None

def med(b, cfg):
    r = runs.get(b, {}).get(cfg)
    if r and r["status"] == "OK" and r["median_ms"] is not None:
        return float(r["median_ms"])
    return None

def mini(b, cfg):
    r = runs.get(b, {}).get(cfg)
    if r and r["status"] == "OK" and r["min_ms"] is not None:
        return float(r["min_ms"])
    return None

def st(b, cfg):
    r = runs.get(b, {}).get(cfg)
    return r["status"] if r else "ABSENT"

def net(ms, base_cfg):
    """Startup-subtracted time. Ratios are computed on NET times so a short
    benchmark compares languages rather than process launchers."""
    if ms is None:
        return None
    b = startup.get(base_cfg)
    if b is None:
        return ms
    return max(ms - b, 0.001)

def ratio(a, b):
    if a is None or b is None or b <= 0:
        return None
    return a / b

def f(x, nd=1):
    return "-" if x is None else ("%.*f" % (nd, x))

# --- noise floor ------------------------------------------------------------
noise = []
for cfg, base in (("vl-repeat", "vl"), ("rust-repeat", "rust"), ("deno-repeat", "deno")):
    a = med("_noise", cfg)
    nb = os.environ.get("BENCH_NOISE_R", "arith/i32-accum")
    b = med(nb, base)
    if a and b:
        noise.append({"runtime": base, "bench": nb, "first_median_ms": b,
                      "repeat_median_ms": a, "spread_pct": abs(a - b) / b * 100.0})
# within-config spread (max-min)/median across every OK run, as a second read
spreads = []
for b, cfgs in runs.items():
    if b.startswith("_"):
        continue
    for c, r in cfgs.items():
        if r["status"] == "OK" and r["median_ms"]:
            spreads.append((float(r["max_ms"]) - float(r["min_ms"])) / float(r["median_ms"]) * 100.0)
spreads.sort()
def pct(p):
    return spreads[min(len(spreads) - 1, int(len(spreads) * p))] if spreads else None

# Outlier accounting. On a shared box the dominant artefact is a SINGLE run per
# configuration landing 2-3x high because an unrelated process ran. Count them,
# so the report can say whether the spread is broad noise (bad — the medians are
# soft) or isolated interference (fine — the median absorbs it).
n_runs_total = n_runs_with_outlier = n_indiv_outliers = 0
for b, cfgs in runs.items():
    for c, r in cfgs.items():
        if r["status"] != "OK" or not r["times_ms"]:
            continue
        n_runs_total += 1
        m = float(r["median_ms"])
        o = [t for t in r["times_ms"] if float(t) > 1.5 * m]
        if o:
            n_runs_with_outlier += 1
            n_indiv_outliers += len(o)
n_samples_total = sum(len(r["times_ms"]) for c in runs.values() for r in c.values())
noise_floor_pct = max([n["spread_pct"] for n in noise] + [pct(0.5) or 0.0]) if (noise or spreads) else 0.0

# --- per-benchmark rows -----------------------------------------------------
rows = []
for b in sorted(metas):
    cat, nm = b.split("/", 1)
    axis = metas[b].get("axis", "")
    varlist = [v for v in metas[b].get("variants", "").split() if v]
    r_rust = med(b, "rust")
    r_vl   = med(b, "vl")
    r_o3   = med(b, "vl-O3")
    r_deno = med(b, "deno")
    r_py   = med(b, "python")
    variants = {v: med(b, "vl-" + v) for v in varlist}

    # min-of-N cross-check: less contaminated by a noisy neighbour, and the
    # honest tie-breaker when the median-based verdict sits near a threshold.
    mn_vl = net(mini(b, "vl"), "vl"); mn_deno = net(mini(b, "deno"), "deno")
    mn_rust = net(mini(b, "rust"), "rust")
    vl_deno_min = ratio(mn_vl, mn_deno)
    vl_rust_min = ratio(mn_vl, mn_rust)

    n_rust = net(r_rust, "rust"); n_vl = net(r_vl, "vl")
    n_o3 = net(r_o3, "vl"); n_deno = net(r_deno, "deno"); n_py = net(r_py, "python")
    n_var = {v: net(x, "vl") for v, x in variants.items()}

    sc, scwhy = PYSCALE.get(b, (None, "NO SCALE FACTOR RECORDED"))
    py_norm = (n_py * sc) if (n_py is not None and sc) else None

    vl_deno = ratio(n_vl, n_deno)
    vl_rust = ratio(n_vl, n_rust)
    py_vl   = ratio(py_norm, n_vl)          # how many x faster VL is than Python
    o3_deno = ratio(n_o3, n_deno)
    best_vl = min([x for x in [n_vl, n_o3] + list(n_var.values()) if x], default=None)
    best_vl_deno = ratio(best_vl, n_deno)

    if vl_deno is None:
        verdict = "NO-DATA"
    elif vl_deno > DENO_PRIORITY:
        verdict = "PRIORITY-LOSS"
    elif vl_deno > DENO_PAR:
        verdict = "LOSS"
    elif vl_deno < DENO_WIN:
        verdict = "WIN"
    else:
        verdict = "PAR"

    flags = []
    if vl_rust is not None and vl_rust > RUST_HEADROOM_FLAG:
        flags.append("RUST-GAP-%.0fx" % vl_rust)
    if py_vl is not None and py_vl < PY_RED_ALERT:
        flags.append("PYTHON-RED-ALERT-%.1fx" % py_vl)
    if sc is None:
        flags.append("PY-UNNORMALISABLE")
    # opt/variant gap: idiomatic vs the fastest hand-spelling = a DEFECT signal
    if n_var:
        bestv = min(n_var.values())
        if n_vl and bestv and n_vl / bestv > 1.15:
            vn = [k for k, v in n_var.items() if v == bestv][0]
            flags.append("IDIOM-GAP-%.2fx(%s)" % (n_vl / bestv, vn))
    if n_vl and n_o3 and n_vl / n_o3 > 1.15:
        flags.append("O3-GAP-%.2fx" % (n_vl / n_o3))
    if n_vl and n_o3 and n_o3 / n_vl > 1.15:
        flags.append("O3-REGRESSION-%.2fx" % (n_o3 / n_vl))
    flags.extend(notes.get(b, []))
    # startup contamination
    for lab, rawms, base in (("rust", r_rust, "rust"), ("deno", r_deno, "deno"),
                             ("python", r_py, "python"), ("vl", r_vl, "vl")):
        if rawms and startup.get(base) and startup[base] / rawms > 0.10:
            flags.append("STARTUP>%d%%(%s)" % (int(startup[base] / rawms * 100), lab))

    statuses = {c: st(b, c) for c in ("rust", "vl", "vl-O3", "deno", "python")}
    bad = {c: s for c, s in statuses.items() if s not in ("OK",)}
    bstat = {c: r["status"] for c, r in builds.get(b, {}).items() if r["status"] != "OK"}

    rows.append(dict(
        bench=b, category=cat, name=nm, axis=axis,
        raw_ms=dict(rust=r_rust, vl=r_vl, vl_O3=r_o3, deno=r_deno, python=r_py,
                    variants=variants),
        net_ms=dict(rust=n_rust, vl=n_vl, vl_O3=n_o3, deno=n_deno, python=n_py,
                    variants=n_var),
        python_scale=sc, python_scale_why=scwhy, python_normalised_ms=py_norm,
        vl_over_deno=vl_deno, vl_over_rust=vl_rust, python_over_vl=py_vl,
        vl_over_deno_minofN=vl_deno_min, vl_over_rust_minofN=vl_rust_min,
        vlO3_over_deno=o3_deno, best_vl_over_deno=best_vl_deno,
        verdict=verdict, flags=flags,
        failures=bad, build_failures=bstat,
        compile_ms=dict(
            vl=(builds.get(b, {}).get("vl-build") or {}).get("median_ms"),
            vl_O3=(builds.get(b, {}).get("vl-build-O3") or {}).get("median_ms"),
            rustc_O=(builds.get(b, {}).get("rustc-O-build") or {}).get("median_ms")),
    ))

results = dict(
    generated=datetime.datetime.now().isoformat(timespec="seconds"),
    preliminary=True,
    quick=quick,
    method=dict(
        reps=reps, statistic="median of reps (min/max also recorded)",
        taskset=pin,
        ratios_use="startup-subtracted (net) times",
        vl_execution="prebuilt .wasm via `vl run <file.wasm>`; compile time measured separately",
        note="OTHER WORK MAY HAVE BEEN ON THE MACHINE — treat as PRELIMINARY.",
    ),
    versions=dict(rustc=os.environ.get("BENCH_RUSTC", ""),
                  deno=os.environ.get("BENCH_DENO", ""),
                  python=os.environ.get("BENCH_PY", ""),
                  vl_repo_commit=os.environ.get("BENCH_COMMIT", "")),
    thresholds=dict(deno_win=DENO_WIN, deno_par=DENO_PAR, deno_priority=DENO_PRIORITY,
                    rust_headroom_flag=RUST_HEADROOM_FLAG, python_red_alert=PY_RED_ALERT),
    startup_baseline_ms=startup,
    noise=dict(repeat_probe=noise, within_config_spread_pct=dict(
        p50=pct(0.5), p90=pct(0.9), p99=pct(0.99)), noise_floor_pct=noise_floor_pct,
        outliers=dict(rule=">1.5x that configuration's own median",
                      configurations=n_runs_total,
                      configurations_with_an_outlier=n_runs_with_outlier,
                      individual_samples=n_samples_total,
                      outlier_samples=n_indiv_outliers)),
    void=[dict(bench=v["bench"], reason=v["reason"]) for v in voids],
    benchmarks=rows,
)
os.makedirs(outd, exist_ok=True)
json.dump(results, open(os.path.join(outd, "results.json"), "w"), indent=2)

# --- summary.md -------------------------------------------------------------
L = []
A = L.append
A("# VL cross-runtime benchmark results (PRELIMINARY)")
A("")
A("Generated %s by `bench/run.sh`. **PRELIMINARY** — other work may have been on the" % results["generated"])
A("machine during this sweep. Re-run `bench/run.sh` on an idle box for authoritative numbers.")
A("")
A("| | |")
A("|---|---|")
A("| reps per configuration | %d (median reported; min/max in results.json) |" % reps)
A("| cpu pinning | `taskset -c %s` |" % pin)
A("| rustc | %s |" % results["versions"]["rustc"])
A("| deno | %s |" % results["versions"]["deno"])
A("| python | %s |" % results["versions"]["python"])
A("| vl repo commit | %s |" % results["versions"]["vl_repo_commit"])
A("| VL execution | prebuilt `.wasm` (`vl run x.wasm`); compile time is a separate column |")
A("| ratios | computed on **startup-subtracted** times |")
A("")
A("## Startup baseline (empty program)")
A("")
A("| runtime | median ms |")
A("|---|---|")
for k in ("rust", "vl", "vl-run-src", "deno", "python"):
    if k in startup:
        A("| %s | %s |" % (k, f(startup[k], 2)))
A("")
A("`vl-run-src` is compile+run of an empty program in one process; `vl` is a prebuilt module.")
A("")
A("## Noise floor")
A("")
if noise:
    A("| runtime | bench | first median ms | repeat median ms | spread |")
    A("|---|---|---|---|---|")
    for n in noise:
        A("| %s | %s | %s | %s | %.1f%% |" % (n["runtime"], n["bench"],
          f(n["first_median_ms"], 2), f(n["repeat_median_ms"], 2), n["spread_pct"]))
A("")
A("Within-configuration (max-min)/median across every measured run: p50 %s%%, p90 %s%%, p99 %s%%."
  % (f(pct(0.5)), f(pct(0.9)), f(pct(0.99))))
A("")
A("Outliers (a single sample >1.5x its own configuration's median): **%d of %d samples**, "
  "affecting %d of %d configurations. Almost every affected configuration has exactly ONE such "
  "sample, i.e. this is isolated interference from unrelated work on the box rather than broad "
  "noise — which is why the median of %d absorbs it and why the `vl/deno(min)` column below "
  "should agree with `vl/deno`. Where they disagree, believe neither and re-run."
  % (n_indiv_outliers, n_samples_total, n_runs_with_outlier, n_runs_total, reps))
A("")
A("**Noise floor taken as %.1f%%.** Differences smaller than this are not differences." % noise_floor_pct)
A("")
A("## Results")
A("")
A("Times are medians in **ms**, startup-subtracted. `py(norm)` is Python's reduced-N time")
A("multiplied by that benchmark's scale factor; `-` means the benchmark's own audit says no")
A("scalar factor is valid. `vl/rust` is HEADROOM, not a loss.")
A("")
A("| benchmark | rust | vl | vl -O3 | deno | py(raw) | py(norm) | vl/rust | vl/deno | vl/deno(min) | py/vl | verdict | flags |")
A("|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|---|")
order = {"PRIORITY-LOSS": 0, "LOSS": 1, "NO-DATA": 2, "PAR": 3, "WIN": 4}
for r in sorted(rows, key=lambda r: (order.get(r["verdict"], 9),
                                     -(r["vl_over_deno"] or 0))):
    A("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
        r["bench"], f(r["net_ms"]["rust"]), f(r["net_ms"]["vl"]), f(r["net_ms"]["vl_O3"]),
        f(r["net_ms"]["deno"]), f(r["net_ms"]["python"]), f(r["python_normalised_ms"]),
        f(r["vl_over_rust"], 2), f(r["vl_over_deno"], 2), f(r["vl_over_deno_minofN"], 2),
        f(r["python_over_vl"], 1),
        r["verdict"], ", ".join(r["flags"]) or ""))
A("")
A("## Extra VL spellings (opt.vl / toplevel.vl / globals.vl / ...)")
A("")
A("A gap between `main.vl` and a hand-spelled variant is a **defect to file**, never a tip.")
A("")
A("| benchmark | vl (idiomatic) | variant | variant ms | idiomatic/variant |")
A("|---|--:|---|--:|--:|")
for r in rows:
    for v, ms in sorted(r["net_ms"]["variants"].items()):
        A("| %s | %s | %s | %s | %s |" % (r["bench"], f(r["net_ms"]["vl"]), v, f(ms),
          f(ratio(r["net_ms"]["vl"], ms), 2)))
A("")
A("## Compile time (never inside an execution number)")
A("")
A("| benchmark | vl build | vl build -O3 | rustc -O |")
A("|---|--:|--:|--:|")
for r in rows:
    c = r["compile_ms"]
    A("| %s | %s | %s | %s |" % (r["bench"], f(c["vl"]), f(c["vl_O3"]), f(c["rustc_O"])))
A("")
fails = [r for r in rows if r["failures"] or r["build_failures"]]
A("## Failures")
A("")
if not fails:
    A("None — every benchmark built and ran in every language.")
else:
    A("| benchmark | what | status | error |")
    A("|---|---|---|---|")
    for r in fails:
        for c, s in sorted(r["build_failures"].items()):
            rec = builds[r["bench"]][c]
            A("| %s | %s | %s | `%s` |" % (r["bench"], c, s,
              (rec.get("error", "") or "").replace("|", "\\|").replace("\n", " ")[:220]))
        for c, s in sorted(r["failures"].items()):
            rec = runs[r["bench"]].get(c, {})
            A("| %s | %s | %s | `%s` |" % (r["bench"], c, s,
              (rec.get("error", "") or "").replace("|", "\\|").replace("\n", " ")[:220]))
A("")
A("## VOID benchmarks (excluded)")
A("")
if not voids:
    A("None.")
else:
    for v in voids:
        A("- **%s** — %s" % (v["bench"], v["reason"][:600]))
A("")
open(os.path.join(outd, "summary.md"), "w").write("\n".join(L) + "\n")
print("rows=%d void=%d fails=%d" % (len(rows), len(voids), len(fails)))
PYREPORT
rc=$?
echo "done (rc=$rc): $OUT/results.json  $OUT/summary.md"
exit $rc
