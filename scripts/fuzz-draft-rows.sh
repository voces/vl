#!/usr/bin/env bash
# Turn a fuzz sweep's unsound findings into ready-to-file inventory row drafts. For each
# INVALID-WASM / TRAP / MISMATCH case kept by `fuzz-nightly.sh` (a `keep_<seed>/case_N.vl` beside
# its `.err`), it minimises the program by deleting lines while the outcome holds (a wrong-value
# case stays whole, see `minimise`), drops a
# program a previous case already minimised to, and writes `case_N.row.md` next to it: a status
# line in the grader's outcome vocabulary, the `Repro:` block, a `Want:` block where the minimised
# program still prints the generator's payload, the seed's repro line, and a family guess (the
# open inventory rows whose text holds the same validator or trap sentence). A draft is a draft:
# the mechanism and the ablation are a person's, and the guess is only where to look first.
#
# USAGE: scripts/fuzz-draft-rows.sh <sweep-or-leg-dir>...    (run from the checkout root)
#   `$VL` names the binary (default the dev tree's), `$SEED_WASM` the compiler seed (default
#   build/vl-compiler.wasm), `$FUZZ_DRAFT_TIMEOUT` each run's limit in seconds (default 60).
set -uo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
SEED_WASM="${SEED_WASM:-build/vl-compiler.wasm}"
TO="${FUZZ_DRAFT_TIMEOUT:-60}"
[ $# -gt 0 ] || { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
[ -f "$SEED_WASM" ] || { echo "fuzz-draft-rows: no seed at $SEED_WASM"; exit 2; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# classify FILE WANT: prints the outcome class (OK, REJECT, INVALID-WASM, TRAP, MISMATCH) and
# leaves the run's error text in $WORK/err and its stdout in $WORK/out. WANT is the expected
# stdout; "" skips the MISMATCH test (a minimised program that dropped a print has none).
classify() {
  local f="$1" want="$2" rc
  timeout "$TO" "$VL" run "$f" --compiler "$SEED_WASM" > "$WORK/out" 2> "$WORK/err"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    case "$(cat "$WORK/err")" in
      *"type error"*|*"parse error"*|*"emit error"*) echo REJECT ;;
      *"failed to compile"*|*"failed to parse WebAssembly"*|*"translation error"*|*"Invalid input WebAssembly"*|*"invalid module"*) echo INVALID-WASM ;;
      *) echo TRAP ;;
    esac
    return
  fi
  if [ -n "$want" ] && [ "$(cat "$WORK/out")" != "$want" ]; then echo MISMATCH; return; fi
  echo OK
}

# stem: the first validator or trap sentence of $WORK/err with its offsets and type indices
# masked, which is what a filed row quotes.
stem() {
  grep -oE "type mismatch: [^;]*|wasm trap: [a-z ]+|unreachable|out of bounds[a-z ]*" "$WORK/err" \
    | head -1 | sed -E 's/\$[0-9]+/$N/g; s/offset [0-9]+/offset N/g'
}

# minimise FILE CLASS WANT: deletes runs of 4, 3, 2 and then 1 lines while the class holds, until no
# run can go. A MISMATCH is left whole: a deletion can change what the program should print, and
# the generator's payload is the only oracle, so a smaller wrong-value program proves nothing.
minimise() {
  local f="$1" cls="$2" want="$3" cur="$WORK/cur.vl" cand="$WORK/cand.vl" n i k j changed
  grep -v '^// @' "$f" > "$cur"
  if [ "$cls" = MISMATCH ]; then cat "$cur"; return; fi
  changed=1
  while [ "$changed" -eq 1 ]; do
    changed=0
    for k in 4 3 2 1; do
      n=$(wc -l < "$cur")
      i=1
      while [ $((i + k - 1)) -le "$n" ]; do
        j=$((i + k - 1))
        sed "${i},${j}d" "$cur" > "$cand"
        if [ "$(classify "$cand" "$want")" = "$cls" ]; then
          cp "$cand" "$cur"; changed=1; n=$((n - k))
        else
          i=$((i + 1))
        fi
      done
    done
  done
  cat "$cur"
}

status_of() {
  case "$1" in
    INVALID-WASM) echo "check-clean invalid wasm" ;;
    TRAP) echo "loads then traps" ;;
    MISMATCH) echo "check-clean silently wrong" ;;
  esac
}

seen="$WORK/seen"; : > "$seen"
drafts=0
for root in "$@"; do
  for keep in $(find "$root" -type d -name 'keep_*' | sort); do
    seed=${keep##*keep_}
    leg=$(basename "$(dirname "$keep")")
    # The leg's summary lists its seeds, count and depths; a seed's depth is round-robin by its place.
    repro="scripts/fuzz-vl.sh --seed $seed"
    sum="$(dirname "$keep")/summary.md"
    if [ -f "$sum" ]; then
      line=$(grep -m1 '^seeds: ' "$sum")
      seeds=$(printf '%s' "$line" | sed -E 's/^seeds: ([0-9 ]+) \(.*/\1/')
      cnt=$(printf '%s' "$line" | sed -nE 's/.*count=([0-9]+).*/\1/p')
      dps=$(printf '%s' "$line" | sed -nE 's/.*depths=([0-9 ]+)\).*/\1/p')
      set -- $dps
      nd=$#
      idx=0
      for s0 in $seeds; do [ "$s0" = "$seed" ] && break; idx=$((idx + 1)); done
      if [ "$nd" -gt 0 ] && [ -n "$cnt" ]; then
        shift $((idx % nd)); repro="$repro --count $cnt --depth $1"
      fi
    fi
    case "$leg" in
      branching) flags=" --branching" ;;
      multiobs) flags=" --branching --multiobs" ;;
      declared) flags=" --branching --multiobs --declared" ;;
      *) flags="" ;;
    esac
    for f in "$keep"/case_*.vl; do
      [ -f "$f" ] || continue
      want=$(grep '^// @log ' "$f" | sed 's#^// @log ##')
      cls=$(classify "$f" "$want")
      case "$cls" in INVALID-WASM|TRAP|MISMATCH) ;; *) continue ;; esac
      # A MISMATCH keeps every print, so its `Want:` stays the payload; the other classes may
      # shed prints, so their minimised program states no expected output.
      if [ "$cls" = MISMATCH ]; then mwant="$want"; else mwant=""; fi
      prog=$(minimise "$f" "$cls" "$mwant")
      key=$(printf '%s' "$prog" | cksum | cut -d' ' -f1)
      if grep -qx "$key" "$seen"; then continue; fi
      echo "$key" >> "$seen"
      printf '%s\n' "$prog" > "$WORK/min.vl"
      classify "$WORK/min.vl" "$mwant" > /dev/null
      st=$(stem)
      got=$(cat "$WORK/out")
      guess=""
      if [ -n "$st" ]; then
        # The whole sentence as a pattern, a masked type index matching any `$<n>`.
        re=$(printf '%s' "$st" | sed -E 's/[][(){}.*+?|^\\]/\\&/g; s/\$N/\\$[0-9a-z]+/g')
        guess=$(grep -lE -- "$re" docs/internals/inventory/D*.md 2>/dev/null \
          | xargs -r grep -L '^\*\*closed' 2>/dev/null | xargs -r -n1 basename 2>/dev/null | sed 's/\.md$//' | head -5 | tr '\n' ' ')
      fi
      out="${f%.vl}.row.md"
      {
        echo "### D<id> — (draft: take an id with inventory/ls.vl --next) name the MECHANISM once ablated, not the message"
        echo
        echo "**$(status_of "$cls") · clause 1 · found by fuzz-sweep, leg \`$leg\`, seed $seed, $(basename "$f") · filed against master \`$(git rev-parse --short HEAD)\`**"
        echo
        echo "Repro:"
        echo
        printf '%s\n' "$prog" | sed 's/^/    /'
        [ "$cls" = MISMATCH ] && printf '    // PRINTS %s\n' "$(printf '%s' "$got" | tr '\n' ' ' | sed 's/ $//')"
        if [ -n "$mwant" ]; then
          echo; echo "Want:"; echo
          printf '%s\n' "$mwant" | sed 's/^/    /'
        fi
        echo
        echo "#### Mechanism"
        echo
        echo "Not ablated yet. Error: \`${st:-$cls}\`."
        [ "$cls" = MISMATCH ] && echo "Unminimised: a deletion can change the right answer, and the payload is the only oracle."
        echo "Found by \`${repro:-scripts/fuzz-vl.sh --seed $seed}$flags\`; the unminimised case is \`$(basename "$f")\` in \`$keep\`."
        echo "Family guess (open rows quoting the same sentence): ${guess:-none}."
      } > "$out"
      drafts=$((drafts + 1))
      echo "draft: $out ($cls${guess:+, guess $guess})"
    done
  done
done
echo "fuzz-draft-rows: $drafts draft(s)"
