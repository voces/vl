#!/usr/bin/env bash
# What the IR claims against what legacy writes: behaviour parity, with bytes reported.
#
#     scripts/ir-identity.sh <seed-a> <seed-b> [--names]
#     scripts/ir-identity.sh --cases <seed> [--shard i/n]
#     scripts/ir-identity.sh --claimless <seed> [list] [--shard i/n]
#     scripts/ir-identity.sh --compare | --compare-errors <list> <dir-a> <dir-b>
#
# The first builds every distilled cell (`cells/`, `named/`) and the self-compile under two
# seeds; `--names` adds the name and `vl-src` sections. It prints `identical N, fail under both
# N, differ N, built under one only N`, each cell that differs or built under one seed only, and
# `self-compile identical` or `SELF-COMPILE DIFFERS`.
# `--cases` builds a same-tree compiler with `CLAIMED` empty from <seed> (the shipped compiler
# of this checkout), then builds every tests/cases program not marked `@error`, and every
# scripts/capability-probes program, under both, comparing the exit code, and for a program that
# fails under both, its first diagnostic line: a claim that turns a legacy refusal into a build,
# or into another refusal, reds. A program both build to other bytes is not a differ: it counts in
# `bytes differ N (informational)` and goes to `ir-parity.vl --behaviour-only`, which runs both and
# reds when the exit code, trap or output differs (coordinator ruling 2026-11-25, DECISIONS.md).
# `$IR_IDENTITY_BYTES=1` restores the byte gate. It prints `cases: identical N, fail under both N,
# differ N` and each that differs. It then builds every filed inventory witness whose outcome is
# an emit reject (`scripts/inventory/witnesses.vl`) under both, comparing the exit code and the
# first diagnostic line, and prints `witnesses: same N, differ N`.
# `--claimless` builds the same claimless compiler, then every distilled cell and every inventory
# witness filed `runs` (or the programs a list file names) under both, comparing the wasm and the
# exit code: what a claim ships against what legacy would write (`claimless: identical N, fail under
# both N, differ N`). It sees what the armed shadow cannot, a claim built before legacy runs.
# `--compare` and `--compare-errors` are those two comparisons alone, over builds `build_all`
# left in two dirs (each file's `.rc`, `.err` and, built, `.wasm`).
# A build the 60 s limit stopped on either side prints `TIMEOUT f (a|b|both)` and counts in the
# summary's `timeout N`, never as a differ: it is no reading, and the run refuses it (exit 3, after
# any differ's exit 1). The logs of every non-identical file are kept under $IR_IDENTITY_KEEP
# (default $TMPDIR/ir-identity-keep/<run>/). A byte differ of a program that
# scripts/ir-divergence-baseline.txt lists prints `expected divergence f (fns)` and passes when every
# function whose body differs (`--names` builds, `wasm-dis`) is listed for it; `scripts/ir-parity.vl`
# proves those still behave alike. A program listed with a `legacy-wrong:` mechanism (O3: legacy's
# bytes are wrong, the IR's right) may also build under the claims seed where the claimless one
# refuses (`expected divergence f (legacy-wrong: claimless exit N)`); `ir-parity.vl` proves its
# IR-on run against the program's expected output instead of against IR off.
# `--build-claimless <seed> <out>` writes the claimless compiler alone, built from THIS tree's
# compiler/ (the seed only builds it), with `<out>.src` naming that source; it prints the tree.
# Either exits 1 on any other difference. Run from the checkout root; $VL names the host, $JOBS the
# fan-out (default 4); $VL defaults to the checkout's host. Temp files live under $TMPDIR and are removed on exit.
# `--shard i/n` keeps every n-th program of each list, starting at the i-th, so n runs partition
# the lists (CI's ci-ir-identity jobs). $IR_IDENTITY_CLAIMLESS names a claimless compiler
# `--build-claimless` wrote from this tree, so a second mode in one job does not rebuild it.
set -euo pipefail
SHARD=""
args=()
while [ $# -gt 0 ]; do
  if [ "$1" = --shard ]; then SHARD=${2:?usage: --shard i/n}; shift 2; else args+=("$1"); shift; fi
done
set -- "${args[@]+"${args[@]}"}"
if [ -n "$SHARD" ] && ! [[ "$SHARD" =~ ^([1-9][0-9]*)/([1-9][0-9]*)$ && ${BASH_REMATCH[1]} -le ${BASH_REMATCH[2]} ]]; then
  echo "ir-identity: --shard wants i/n with 1 <= i <= n, got '$SHARD'" >&2; exit 2
fi
export VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
# An invalid IR-claimed module is rc 70, never legacy's fallback bytes, so no differ hides behind it.
export VL_IR_STRICT=1
# A byte differ is informational and behaviour decides (coordinator ruling 2026-11-25); BYTES=1
# ($IR_IDENTITY_BYTES) restores the byte gate, with listed divergences read through wasm-dis.
BYTES=${IR_IDENTITY_BYTES:-0}
T=$(mktemp -d)
# The build logs of every file that was not identical (a differ or a timeout) outlive the run,
# under $IR_IDENTITY_KEEP (default $TMPDIR/ir-identity-keep/<run>/), so a reading can be explained.
KEEP=${IR_IDENTITY_KEEP:-${TMPDIR:-/tmp}/ir-identity-keep/$(date +%Y%m%dT%H%M%S)-$$}
keep_logs() {
  [ -s "$T/keep" ] || return 0
  mkdir -p "$KEEP"
  while IFS=$'\t' read -r d k; do
    for e in log err rc; do [ -f "$d/$k.$e" ] && cp "$d/$k.$e" "$KEEP/$(basename "$d").$k.$e"; done
  done < "$T/keep"
  echo "kept the logs of $(cut -f2 "$T/keep" | sort -u | wc -l) non-identical files under $KEEP" >&2
}
trap 'keep_logs; rm -rf "${T:?}"' EXIT
: > "$T/keep"

# The first diagnostic line (`path:line:col: message`) of build log $1, else its first line.
first_error() {
  grep -m1 -E '^[^ ]+:[0-9]+:[0-9]+: ' "$1" || head -n1 "$1"
}
export -f first_error

# Builds each file listed in $1 under seed $2 into dir $3, keeping its exit code beside it.
build_all() {
  mkdir -p "$3"
  # The first build with a compiler compiles that module into the host's cache. Four parallel cold
  # compiles share nothing and can pass the 60 s limit together (the first four programs of a side
  # timed out at once); one untimed warm build first leaves the limit timing the programs alone.
  printf 'print(1)\n' > "$3/warm.vl"
  VL_COMPILER_WASM=$2 "$VL" build "$3/warm.vl" -o "$3/warm.wasm" $FLAGS > /dev/null 2>&1 || true
  rm -f "$3/warm.vl" "$3/warm.wasm"
  xargs -P "${JOBS:-4}" -I{} bash -c '
    k=$(printf "%s" "$1" | tr "/" "_")
    rc=0
    VL_COMPILER_WASM=$2 timeout 60 "$VL" build "$1" -o "$3/$k.wasm" $FLAGS > /dev/null 2> "$3/$k.log" || rc=$?
    echo "$rc" > "$3/$k.rc"
    if [ "$rc" -eq 0 ]; then : > "$3/$k.err"; else first_error "$3/$k.log" > "$3/$k.err"; fi
    [ -s "$3/$k.log" ] || rm -f "$3/$k.log"
    [ "$rc" -eq 0 ] || rm -f "$3/$k.wasm"
  ' _ {} "$2" "$3" < "$1"
}

# A build `timeout 60` stopped (rc 124) under dir $2 or $3, or both: `TIMEOUT f (side)`, kept.
# A timeout is neither identical nor a differ; the run that has one is refused, not passed.
timed_out() {
  local side=""
  [ "$4" = 124 ] && side=a
  [ "$5" = 124 ] && side=${side:+both}${side:-b}
  [ -n "$side" ] || return 1
  printf '%s\t%s\n%s\t%s\n' "$2" "$6" "$3" "$6" >> "$T/keep"
  echo "TIMEOUT $1 ($side)"
}

# The divergences a lane chose (Q57): `program\tfunction\tmechanism\tPR` lines. A byte differ of a
# listed program is an `expected divergence` when every function whose body differs is listed for
# it; `<module>` names everything outside the function bodies.
BASELINE=${IR_DIVERGENCE_BASELINE:-scripts/ir-divergence-baseline.txt}
WASM_DIS=${WASM_DIS:-$PWD/node_modules/.bin/wasm-dis}
# Where `--claimless` extracts the inventory witnesses, a fresh temp dir unless $IR_IDENTITY_WIT names
# one. The baseline key of file $1: a witness written under $WIT/inv<k>/<id>/ is its row's file.
WIT=${IR_IDENTITY_WIT:-$T/wit}
bkey() {
  case "$1" in
    "$WIT"/inv1/*) local r=${1#"$WIT"/inv1/}; echo "docs/internals/inventory/${r%%/*}.md" ;;
    "$WIT"/inv2/*) local r=${1#"$WIT"/inv2/}; echo "docs/internals/inventory-2/${r%%/*}.md" ;;
    "$T"/w/*) local r=${1#"$T"/w/}; r=${r%%/*}
      if [ -f "docs/internals/inventory/$r.md" ]; then echo "docs/internals/inventory/$r.md"; else echo "docs/internals/inventory-2/$r.md"; fi ;;
    *) echo "$1" ;;
  esac
}

# A listed divergence is read through the disassembler; without it the byte differ of a listed
# program would read as a plain differ, so the run stops at the first one instead.
need_dis() {
  [ -x "$WASM_DIS" ] && return 0
  [ -f "$BASELINE" ] && awk -F '\t' -v f="$(bkey "$1")" '$1 == f { hit = 1 } END { exit !hit }' "$BASELINE" || return 0
  echo "ir-identity: $WASM_DIS is not executable, so the listed divergence of $1 cannot be read;" >&2
  echo "  link the main checkout's node_modules into this tree, or set \$WASM_DIS" >&2
  exit 2
}

# Each function of wasm $1 on one line, `name\tbody`, and `<module>\trest`, sorted by name.
fn_lines() {
  "$WASM_DIS" "$1" | awk '
    /^ \(func \$/ { if (name != "") print name "\t" body; name = $2; sub(/^\$/, "", name); body = ""; next }
    /^ \(/ { if (name != "") print name "\t" body; name = ""; rest = rest "\001" $0; next }
    { if (name != "") body = body "\001" $0; else rest = rest "\001" $0 }
    END { if (name != "") print name "\t" body; print "<module>\t" rest }
  ' | LC_ALL=C sort -t "$(printf '\t')" -k1,1
}

# The functions whose bodies differ between wasm $1 and $2 (present in one only counts), one a line.
fn_differs() {
  fn_lines "$1" > "$T/fa" && fn_lines "$2" > "$T/fb" || return 1
  LC_ALL=C join -t "$(printf '\t')" -a1 -a2 -e '<absent>' -o 0,1.2,2.2 "$T/fa" "$T/fb" \
    | awk -F '\t' '$2 != $3 { print $1 }'
}

# Whether file $1's byte differ (wasm $2 vs $3) is an expected divergence; prints its reason. With
# $SEED_A and $SEED_B set, both sides are rebuilt with `--names` so the functions carry names.
expected_divergence() {
  [ -f "$BASELINE" ] && awk -F '\t' -v f="$(bkey "$1")" '$1 == f { hit = 1 } END { exit !hit }' "$BASELINE" || return 1
  local a=$2 b=$3 fn unlisted=""
  if [ -n "${SEED_A:-}" ] && [ -n "${SEED_B:-}" ]; then
    a=$T/na.wasm; b=$T/nb.wasm
    "$VL" build "$1" -o "$a" --names --compiler "$SEED_A" > /dev/null 2>&1 || return 1
    "$VL" build "$1" -o "$b" --names --compiler "$SEED_B" > /dev/null 2>&1 || return 1
  fi
  fn_differs "$a" "$b" > "$T/fd" || return 1
  [ -s "$T/fd" ] || { echo "no function differs under --names"; return 1; }
  while read -r fn; do
    awk -F '\t' -v f="$(bkey "$1")" -v g="$fn" '$1 == f && $2 == g { hit = 1 } END { exit !hit }' "$BASELINE" \
      || unlisted="$unlisted $fn"
  done < "$T/fd"
  if [ -n "$unlisted" ]; then echo "unlisted:$unlisted"; return 1; fi
  echo "$(paste -sd, "$T/fd")"
}

# Whether file $1 has a `legacy-wrong:` line in the baseline.
# A holdout (scripts/ir-i8-census/holdouts.tsv) is graded by its own side alone: refused with
# `cannot yet lower`, whatever the other side does; one that is not refused so differs.
HOLDOUTS=${IR_I8_HOLDOUTS:-scripts/ir-i8-census/holdouts.tsv}
holdout() {
  [ -f "$HOLDOUTS" ] && awk -F '\t' -v f="$(bkey "$1")" '$1 == f { hit = 1 } END { exit !hit }' "$HOLDOUTS"
}
# Grades holdout $1 (key $3) built under dir $2: 0 when refused as expected, else prints its DIFF.
held_ok() {
  [ "$(cat "$2/$3.rc")" != 0 ] && grep -q 'cannot yet lower' "$2/$3.err" && return 0
  echo "DIFF $1 (holdout no longer refused with 'cannot yet lower': remove its line from $HOLDOUTS)"
  return 1
}

# Two refusals that agree once their positions are dropped, whose tree side is a holdout's
# `cannot yet lower`, or that are both emit-stage refusals, are the same refusal: legacy's wording
# and spans went with it at I8, and the `emit_reject` witnesses and `@emit-error` cases grade what
# each refusal says.
same_refusal() {
  local a b
  a=$(sed -E 's/^[^ ]*:[0-9]+:[0-9]+: //' "$1"); b=$(sed -E 's/^[^ ]*:[0-9]+:[0-9]+: //' "$2")
  [ "$a" = "$b" ] || grep -q 'cannot yet lower' "$1" \
    || { grep -q 'emitProgram: ' "$1" && grep -q 'emitProgram: ' "$2"; }
}

legacy_wrong() {
  [ -f "$BASELINE" ] && awk -F '\t' -v f="$(bkey "$1")" '$1 == f && $3 ~ /^legacy-wrong:/ { hit = 1 } END { exit !hit }' "$BASELINE"
}

# Records file key $3 of dirs $1 and $2 as not identical, so its logs are kept.
keep() { printf '%s\t%s\n%s\t%s\n' "$1" "$3" "$2" "$3" >> "$T/keep"; }

# Compares the builds of the files listed in $1 under dirs $2 and $3; prints each that differs.
# With $ERRCMP=1, a file that fails under both differs when its first diagnostic line does.
compare_all() {
  same=0; both=0; diff=0; tmo=0; expd=0; bytes=0; held=0; why=""
  : > "$T/bdiff"
  while read -r f; do
    k=$(printf "%s" "$f" | tr "/" "_")
    why=""
    ra=$(cat "$2/$k.rc"); rb=$(cat "$3/$k.rc")
    if timed_out "$f" "$2" "$3" "$ra" "$rb" "$k"; then tmo=$((tmo + 1)); continue; fi
    if holdout "$f"; then
      if held_ok "$f" "$2" "$k"; then held=$((held + 1)); else diff=$((diff + 1)); fi
      continue
    fi
    [ "$ra" = "$rb" ] && { [ "$ra" != 0 ] || cmp -s "$2/$k.wasm" "$3/$k.wasm"; } \
      && { [ "$ra" = 0 ] || [ "${ERRCMP:-0}" != 1 ] || cmp -s "$2/$k.err" "$3/$k.err"; } || keep "$2" "$3" "$k"
    if [ "$ra" != "$rb" ] && [ "$ra" = 0 ] && legacy_wrong "$f"; then
      expd=$((expd + 1)); echo "expected divergence $f (legacy-wrong: claimless exit $rb)"
      bkey "$f" >> "$T/bdiff"
    elif [ "$ra" != "$rb" ]; then diff=$((diff + 1)); echo "DIFF $f (exit $ra vs $rb)"
    elif [ "$ra" != 0 ] && [ "${ERRCMP:-0}" = 1 ] && ! cmp -s "$2/$k.err" "$3/$k.err" \
      && same_refusal "$2/$k.err" "$3/$k.err"; then
      both=$((both + 1)); echo "refusal text $f (informational: $(cat "$2/$k.err") vs $(cat "$3/$k.err"))"
    elif [ "$ra" != 0 ] && [ "${ERRCMP:-0}" = 1 ] && ! cmp -s "$2/$k.err" "$3/$k.err"; then
      diff=$((diff + 1)); echo "DIFF $f (first error: $(cat "$2/$k.err") vs $(cat "$3/$k.err"))"
    elif [ "$ra" != 0 ]; then both=$((both + 1))
    elif cmp -s "$2/$k.wasm" "$3/$k.wasm"; then same=$((same + 1))
    elif [ "$BYTES" != 1 ]; then bytes=$((bytes + 1)); bkey "$f" >> "$T/bdiff"
    elif need_dis "$f" && why=$(expected_divergence "$f" "$2/$k.wasm" "$3/$k.wasm"); then
      expd=$((expd + 1)); echo "expected divergence $f ($why)"
    else diff=$((diff + 1)); echo "DIFF $f${why:+ ($why)}"; fi
  done < "$1"
}

# Compares the refusals of the files listed in $1 under dirs $2 and $3: the exit code and the
# first diagnostic line, or the wasm when both build; prints each that differs.
compare_errors() {
  esame=0; ediff=0; etmo=0; eexpd=0; ebytes=0; eheld=0; why=""
  while read -r f; do
    k=$(printf "%s" "$f" | tr "/" "_")
    why=""
    ra=$(cat "$2/$k.rc"); rb=$(cat "$3/$k.rc")
    if timed_out "$f" "$2" "$3" "$ra" "$rb" "$k"; then etmo=$((etmo + 1)); continue; fi
    if holdout "$f"; then
      if held_ok "$f" "$2" "$k"; then eheld=$((eheld + 1)); else ediff=$((ediff + 1)); fi
      continue
    fi
    if [ "$ra" != "$rb" ] || { [ "$ra" = 0 ] && ! cmp -s "$2/$k.wasm" "$3/$k.wasm"; } \
      || ! cmp -s "$2/$k.err" "$3/$k.err"; then keep "$2" "$3" "$k"; fi
    if [ "$ra" != "$rb" ] && [ "$ra" = 0 ] && legacy_wrong "$f"; then
      eexpd=$((eexpd + 1)); echo "expected divergence $f (legacy-wrong: claimless exit $rb)"
    elif [ "$ra" != "$rb" ]; then ediff=$((ediff + 1)); echo "DIFF $f (exit $ra vs $rb)"
    elif [ "$ra" = 0 ] && [ "$BYTES" != 1 ] && ! cmp -s "$2/$k.wasm" "$3/$k.wasm"; then
      esame=$((esame + 1)); ebytes=$((ebytes + 1))
    elif [ "$ra" = 0 ] && ! cmp -s "$2/$k.wasm" "$3/$k.wasm" \
      && why=$(expected_divergence "$f" "$2/$k.wasm" "$3/$k.wasm"); then
      eexpd=$((eexpd + 1)); echo "expected divergence $f ($why)"
    elif [ "$ra" = 0 ] && ! cmp -s "$2/$k.wasm" "$3/$k.wasm"; then ediff=$((ediff + 1)); echo "DIFF $f${why:+ ($why)}"
    elif ! cmp -s "$2/$k.err" "$3/$k.err" && same_refusal "$2/$k.err" "$3/$k.err"; then
      esame=$((esame + 1)); echo "refusal text $f (informational: $(cat "$2/$k.err") vs $(cat "$3/$k.err"))"
    elif ! cmp -s "$2/$k.err" "$3/$k.err"; then
      ediff=$((ediff + 1)); echo "DIFF $f (first error: $(cat "$2/$k.err") vs $(cat "$3/$k.err"))"
    else esame=$((esame + 1)); fi
  done < "$1"
}

# Behaviour parity over the programs whose bytes differ (and the legacy-wrong ones the claims seed
# alone builds): `ir-parity.vl --behaviour-only` builds both sides, runs them and compares exit
# code, trap and output, or a legacy-wrong program's IR-on run against its expected output.
# Sets $bdiff (behaviour differs) and $btmo (timeouts); a byte differ alone is never red.
behaviour_check() {
  bdiff=0; btmo=0
  [ -s "$T/bdiff" ] || { echo "behaviour: no program's bytes differ"; return 0; }
  local rc=0
  "$VL" run scripts/ir-parity.vl --compiler "$1" -- --seed "$1" --claimless "$2" \
    --from "$T/bdiff" --behaviour-only --out "$T/parity.tsv" > "$T/parity.log" 2>&1 || rc=$?
  grep -E '^ir-parity: [0-9]+ programs' "$T/parity.log" | sed 's/^ir-parity/behaviour/' || true
  grep -vP '^ir-parity: [0-9]+ programs|\tsame\t' "$T/parity.log" | sed 's/^/BEHAVIOUR /' || true
  case "$rc" in
    0) ;;
    3) btmo=1 ;;
    *) bdiff=$(awk -F '\t' '$2 == "differs" || $2 ~ /^build-fails\((on|off)\)$/' "$T/parity.tsv" | wc -l)
       [ "$bdiff" -gt 0 ] || bdiff=1 ;;
  esac
}

# The run's verdict: 1 on a differ, else 3 on a timeout (refused, never passed), else 0.
verdict() {
  [ "$1" -eq 0 ] || return 1
  if [ "$2" -gt 0 ]; then
    echo "TIMEOUT: $2 builds hit the 60 s limit on one side or both; neither identical nor a differ."
    echo "  Rerun on a quiet box (fewer \$JOBS, nothing else running); the logs are kept."
    return 3
  fi
}

if [ "${1:-}" = "--compare" ]; then
  ERRCMP=1 compare_all "${2:?usage: --compare <list> <dir-a> <dir-b>}" "${3:?}" "${4:?}"
  echo "cases: identical $same, fail under both $both, differ $diff, timeout $tmo, expected divergence $expd, holdouts refused $held, bytes differ $bytes (informational)"
  verdict "$diff" "$tmo"
  exit
fi

if [ "${1:-}" = "--compare-errors" ]; then
  compare_errors "${2:?usage: --compare-errors <list> <dir-a> <dir-b>}" "${3:?}" "${4:?}"
  echo "errors: same $esame, differ $ediff, timeout $etmo, expected divergence $eexpd, holdouts refused $eheld, bytes differ $ebytes (informational)"
  verdict "$ediff" "$etmo"
  exit
fi

# Keeps list file $1's share under `--shard i/n`: the lines whose index is i modulo n.
shard_list() {
  [ -n "$SHARD" ] || return 0
  awk -v i="${SHARD%/*}" -v n="${SHARD#*/}" '(NR - 1) % n == i - 1' "$1" > "$1.shard"
  mv "$1.shard" "$1"
}

# The checkout's compiler with `CLAIMED` empty, built by seed $1 to $T/claimless.wasm.
# The source a claimless compiler is built from is this tree's compiler/, whatever seed builds it:
# `src_id` names it, `claimless` records it beside the build (`<out>.src`), and a comparison of two
# compilers from one source is refused rather than run (it would compare the tree with itself).
src_id() { cat compiler/*.vl | sha256sum | cut -c1-16; }
src_where() {
  local rev; rev=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
  [ -z "$(git status --porcelain -- compiler 2>/dev/null)" ] || rev="$rev+dirty"
  echo "$(pwd) at $rev, compiler/ $(src_id)"
}
claimless() {
  if [ -n "${IR_IDENTITY_CLAIMLESS:-}" ]; then
    local want; want=$(src_id)
    if [ -f "$IR_IDENTITY_CLAIMLESS.src" ] && [ "$(cat "$IR_IDENTITY_CLAIMLESS.src")" != "$want" ]; then
      echo "ir-identity: \$IR_IDENTITY_CLAIMLESS was built from compiler/ $(cat "$IR_IDENTITY_CLAIMLESS.src"), not this tree's ($want); rebuild it here" >&2
      exit 2
    fi
    cp "$IR_IDENTITY_CLAIMLESS" "$T/claimless.wasm"
    src_id > "$T/claimless.src"
    return
  fi
  echo "ir-identity: the claimless compiler is built from $(src_where)" >&2
  src_id > "$T/claimless.src"
  cp -r compiler "$T/c0"
  awk '
    /^const CLAIMED: IrFamily\[\] = \[$/ { print "const CLAIMED: IrFamily[] = []"; skip = 1; hit = 1; next }
    skip && /^\]$/ { skip = 0; next }
    !skip { print }
    END { if (!hit) { print "ir-identity: CLAIMED not found" > "/dev/stderr"; exit 1 } }
  ' compiler/ir_build.vl > "$T/c0/ir_build.vl"
  "$VL" build "$T/c0/entry.vl" -o "$T/claimless.wasm" --compiler "$1" > /dev/null
}

if [ "${1:-}" = "--build-claimless" ]; then
  claimless "${2:?usage: --build-claimless <seed> <out.wasm>}"
  cp "$T/claimless.wasm" "${3:?usage: --build-claimless <seed> <out.wasm>}"
  cp "$T/claimless.src" "$3.src"
  exit
fi

if [ "${1:-}" = "--claimless" ]; then
  SEED=${2:?usage: scripts/ir-identity.sh --claimless <seed>}
  export FLAGS=""
  claimless "$SEED"
  SEED_A=$SEED SEED_B=$T/claimless.wasm
  if [ -n "${3:-}" ]; then cp "$3" "$T/list"; else
    ls scripts/silent-sweep/distilled/cells/*.vl scripts/silent-sweep/distilled/named/*.vl > "$T/list"
    "$VL" run scripts/ir-i8-census/witnesses.vl --compiler "$SEED" -- "$WIT" \
      docs/internals/inventory docs/internals/inventory-2 >> "$T/list"
  fi
  shard_list "$T/list"
  build_all "$T/list" "$SEED" "$T/a"
  build_all "$T/list" "$T/claimless.wasm" "$T/b"
  compare_all "$T/list" "$T/a" "$T/b"
  echo "claimless: identical $same, fail under both $both, differ $diff, timeout $tmo, expected divergence $expd, holdouts refused $held, bytes differ $bytes (informational)"
  behaviour_check "$SEED" "$T/claimless.wasm"
  verdict $((diff + bdiff)) $((tmo + btmo))
  exit
fi

if [ "${1:-}" = "--cases" ]; then
  SEED=${2:?usage: scripts/ir-identity.sh --cases <seed>}
  export FLAGS="" ERRCMP=1
  claimless "$SEED"
  SEED_A=$SEED SEED_B=$T/claimless.wasm
  { grep -rL '^// @error' --include='*.vl' tests/cases; ls scripts/capability-probes/*.vl; } \
    | sort > "$T/list"
  shard_list "$T/list"
  build_all "$T/list" "$SEED" "$T/a"
  build_all "$T/list" "$T/claimless.wasm" "$T/b"
  compare_all "$T/list" "$T/a" "$T/b"
  echo "cases: identical $same, fail under both $both, differ $diff, timeout $tmo, expected divergence $expd, holdouts refused $held, bytes differ $bytes (informational)"
  behaviour_check "$SEED" "$T/claimless.wasm"
  "$VL" run scripts/inventory/witnesses.vl --compiler "$SEED" -- --outcome emit_reject --out "$T/w" > "$T/errs"
  shard_list "$T/errs"
  # A witness of the test-only refusal hook refuses only under the flag `check-filed-witnesses` passes.
  FLAGS=--test-emit-refusal build_all "$T/errs" "$SEED" "$T/ea"
  FLAGS=--test-emit-refusal build_all "$T/errs" "$T/claimless.wasm" "$T/eb"
  compare_errors "$T/errs" "$T/ea" "$T/eb"
  echo "witnesses: same $esame, differ $ediff, timeout $etmo, expected divergence $eexpd, holdouts refused $eheld, bytes differ $ebytes (informational)"
  verdict $((diff + ediff + bdiff)) $((tmo + etmo + btmo))
  exit
fi

A=${1:?usage: scripts/ir-identity.sh <seed-a> <seed-b> [--names] | --cases <seed> | --claimless <seed>}
B=${2:?usage: scripts/ir-identity.sh <seed-a> <seed-b> [--names] | --cases <seed> | --claimless <seed>}
export FLAGS=${3:-}
SEED_A=$A SEED_B=$B
# Two claimless builds of one compiler/ source are the same compiler: the comparison is vacuous.
if [ -f "$A.src" ] && [ -f "$B.src" ] && [ "$(cat "$A.src")" = "$(cat "$B.src")" ]; then
  echo "ir-identity: $A and $B were both built from compiler/ $(cat "$A.src"), so comparing them compares a tree with itself; build each side in its own tree (git worktree)" >&2
  exit 2
fi
# Two seeds have no claimless relation to run against, so this mode stays a byte identity.
BYTES=${IR_IDENTITY_BYTES:-1}
D=scripts/silent-sweep/distilled
ls "$D"/cells/*.vl "$D"/named/*.vl > "$T/list"
shard_list "$T/list"
build_all "$T/list" "$A" "$T/a"
build_all "$T/list" "$B" "$T/b"
compare_all "$T/list" "$T/a" "$T/b"
only=0
echo "identical $same, fail under both $both, differ $diff, built under one only $only, timeout $tmo, expected divergence $expd"
"$VL" build compiler/entry.vl -o "$T/sa.wasm" --compiler "$A" $FLAGS > /dev/null
"$VL" build compiler/entry.vl -o "$T/sb.wasm" --compiler "$B" $FLAGS > /dev/null
self=0
if cmp -s "$T/sa.wasm" "$T/sb.wasm"; then echo "self-compile identical"
elif why=$(expected_divergence compiler/entry.vl "$T/sa.wasm" "$T/sb.wasm"); then
  echo "self-compile: expected divergence ($why)"
else echo "SELF-COMPILE DIFFERS${why:+ ($why)}"; self=1; fi
verdict $((diff + self)) "$tmo"
