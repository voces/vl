#!/usr/bin/env bash
# The I8 cutover as one re-runnable command (ir-i8-cutover-2026-11.md §5), in a throwaway tree:
#
#     scripts/ir-i8-sweep.sh <keep-list> [--grow] [--pops self,distilled,cases,probes,witnesses]
#                            [--out <dir>] [--max-iter N]
#
# (a) stub-reach.sh's stage B, minus <keep-list>: the 14 entry points and every emitter function
#     that calls an emptied one are emptied, each to `emitFail("i8 stub <name>")`
#     (scripts/ir-i8-census/stub-bodies.txt where that does not type); then every function
#     `dead-exports.vl --list` names, with compiler/entry.vl's exports as the only roots, is deleted.
# (b) A module `let` or `const` no remaining compiler/ text names is deleted, to a fixpoint.
# (c) The tree is built with the checkout's fixpoint seed, then refreshed by itself to a fixpoint
#     (the self-compile, first). Every population then runs `vl check --codegen` under that compiler
#     and under the seed. A program that fails only under the tree is newly failing, grouped by the
#     first stub it hits. A claim that falls back on, or refuses inside, a stub is an IR need.
# --grow appends each IR need that is not an entry point to <keep-list> (reason `ir-tail`) and runs
# again, until a run finds none or --max-iter (default 30) runs have passed.
# Writes <out>/report.txt (the summary and the stub table), <out>/failing.tsv (pop, program, stub),
# <out>/needs.tsv (stub, programs), <out>/tree (the swept compiler/), <out>/compiler.wasm (built from it)
# and <out>/deleted.txt. Exit 0
# when no program newly fails, 1 when one does, 2 when the tree does not build. It deletes nothing
# in the checkout. Run from the checkout root after scripts/refresh-compiler.sh; $VL names the
# host, $JOBS the fan-out (default 4).
set -euo pipefail
KEEP=${1:?usage: scripts/ir-i8-sweep.sh <keep-list> [--grow] [--pops LIST] [--out DIR] [--max-iter N]}
shift
GROW=0 POPS=self,distilled,cases,probes,witnesses OUT=build/ir-i8-sweep MAXIT=30
while [ $# -gt 0 ]; do
  case "$1" in
    --grow) GROW=1; shift ;;
    --pops) POPS=${2:?}; shift 2 ;;
    --out) OUT=${2:?}; shift 2 ;;
    --max-iter) MAXIT=${2:?}; shift 2 ;;
    *) echo "ir-i8-sweep: unknown argument $1" >&2; exit 2 ;;
  esac
done
[ -f "$KEEP" ] || { echo "ir-i8-sweep: no keep-list at $KEEP" >&2; exit 2; }
VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
JOBS=${JOBS:-4}
SEED=build/vl-compiler.wasm
[ -f "$SEED" ] || { echo "ir-i8-sweep: no $SEED; run scripts/refresh-compiler.sh" >&2; exit 2; }
ENTRY="emitBlockValueAs emitBlockValueAsGo emitExpr emitExprAsElem emitExprAsKind emitExprRaw emitFuncBody emitStmt emitStmtGo emitStmtIn emitStmtTail emitStmts emitStmtsTail emitWidened"
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT
mkdir -p "$OUT"
export VL_STD="${VL_STD:-$PWD/std}" VL_IR_STRICT=1

# Each population's program list, once.
lists() {
  ls scripts/silent-sweep/distilled/cells/*.vl scripts/silent-sweep/distilled/named/*.vl > "$T/distilled"
  find tests/cases -name '*.vl' | sort > "$T/cases"
  ls scripts/capability-probes/*.vl > "$T/probes"
  "$VL" run scripts/ir-i8-census/witnesses.vl -- "$T/wit" docs/internals/inventory docs/internals/inventory-2 > "$T/witnesses"
}

# `<file>\t<message>` for every error `vl check --codegen` under compiler $1 prints for the
# programs listed in $2, and `<file>\tNEED <stub>` for a claim that fell back on or refused inside
# a stub. An error's `at <file>:l:c` line follows its message.
scan() {
  cat > "$T/one.sh" <<'ONE'
VL_IR_SHADOW=5 "$VL" check --codegen --compiler "$C" "$@" 2>&1 > /dev/null | awk '
  /^\[ERROR\]: / { msg = $0; sub(/^\[ERROR\]: /, "", msg); next }
  msg != "" && /^  at [^ ]+:[0-9]+:[0-9]+/ { f = $2; sub(/:[0-9]+:[0-9]+$/, "", f); print f "\t" msg; fflush(); msg = ""; next }
  /^\[ir\] / && /i8 stub [A-Za-z0-9_]+/ && /(claim fell back|IR claim refused)/ {
    h = $0; sub(/^\[ir\] /, "", h); sub(/: [0-9]+\t.*/, "", h)
    match($0, /i8 stub [A-Za-z0-9_]+/); print h "\tNEED " substr($0, RSTART + 8, RLENGTH - 8); fflush()
  }'
ONE
  xargs -r -n 100 -P "$JOBS" env VL="$VL" C="$1" sh "$T/one.sh" < "$2" || true
}

# One run over keep-list $KEEP; sets RC.
run() {
  rm -rf "$T/tree" "$T/reach"
  STUB_KEEP="$KEEP" STUB_BODIES=scripts/ir-i8-census/stub-bodies.txt STUB_TREE="$T/tree" STUB_ONLY_B=1 \
    bash scripts/ir-i8-census/stub-reach.sh "$T/reach" | tee "$T/stage" >&2
  # (a) Delete what nothing reaches: each listed function from its header through its closing `}`,
  # with the comment block directly above it.
  "$VL" run scripts/dead-exports.vl -- --list --root "$T/tree" > "$T/dead"
  awk '{ split($1, a, ":"); print a[1] "\t" a[2] "\t" $3 }' "$T/dead" | sort -t$'\t' -k1,1 -k2,2nr > "$T/dead.sorted"
  cut -f1 "$T/dead.sorted" | sort -u | while read -r f; do
    awk -F'\t' -v f="$f" '$1 == f { print $2 }' "$T/dead.sorted" > "$T/at"
    awk 'FILENAME == ARGV[1] { del[$1] = 1; next }
      { line[FNR] = $0 }
      END {
        n = FNR
        for (i = 1; i <= n; i++) if (i in del) {
          j = i; while (j <= n && !(j > i && line[j] ~ /^}/)) { gone[j] = 1; j++ } ; gone[j] = 1
          k = i - 1; while (k >= 1 && line[k] ~ /^\/\//) { gone[k] = 1; k-- }
        }
        for (i = 1; i <= n; i++) if (!(i in gone)) print line[i]
      }' "$T/at" "$T/tree/$f" > "$T/f.new"
    mv "$T/f.new" "$T/tree/$f"
  done
  cut -f1,3 "$T/dead.sorted" > "$OUT/deleted.txt"
  # (b) Delete a module let or const no remaining compiler/ text names, to a fixpoint. A
  # declaration that spans lines runs to the line that balances its brackets.
  local lets=0 n=1
  while [ "$n" -gt 0 ]; do
    # Every identifier's count over the tree's non-comment text, then the unread declarations.
    awk '!/^ *\/\// { l = $0; while (match(l, /[A-Za-z_][A-Za-z0-9_]*/)) { c[substr(l, RSTART, RLENGTH)]++; l = substr(l, RSTART + RLENGTH) } }
      END { for (k in c) print k "\t" c[k] }' "$T"/tree/compiler/*.vl > "$T/counts"
    grep -nE '^(export )?(let|const) [A-Za-z_][A-Za-z0-9_]*' "$T"/tree/compiler/*.vl \
      | sed -E 's/^([^:]+):([0-9]+):(export )?(let|const) ([A-Za-z_][A-Za-z0-9_]*).*/\1\t\2\t\5/' > "$T/decls" || true
    awk -F'\t' 'FILENAME == ARGV[1] { c[$1] = $2; next } FILENAME == ARGV[2] { root[$1] = 1; next }
      c[$3] <= 1 && !($3 in root)' "$T/counts" "$T/tree/scripts/roots.txt" "$T/decls" > "$T/unread"
    n=$(wc -l < "$T/unread")
    cut -f1 "$T/unread" | sort -u | while read -r f; do
      awk -F'\t' -v f="$f" '$1 == f { print $2 }' "$T/unread" > "$T/at"
      awk 'FILENAME == ARGV[1] { del[$1] = 1; next }
        (FNR in del) { d = 0; on = 1 }
        on { t = $0; o = gsub(/[\[\{\(]/, "", t); cl = gsub(/[\]\}\)]/, "", t); d += o - cl; if (d <= 0) on = 0; next }
        { print }' "$T/at" "$f" > "$T/f.new"
      mv "$T/f.new" "$f"
    done
    awk -F'\t' -v r="$T/tree/" '{ sub(r, "", $1); print $1 "\tlet " $3 }' "$T/unread" >> "$OUT/deleted.txt"
    lets=$((lets + n))
  done
  # Drop every deleted name from the import lists that still name it; an emptied import goes.
  cut -f2 "$OUT/deleted.txt" | sed 's/^let //' | sort -u > "$T/gone"
  for f in "$T"/tree/compiler/*.vl; do
    awk 'FILENAME == ARGV[1] { gone[$1] = 1; next }
      function flush(   i, n, it, nm, out, k) {
        n = split(body, it, ",")
        out = ""; k = 0
        for (i = 1; i <= n; i++) {
          nm = it[i]; gsub(/^[ \t\n]+|[ \t\n]+$/, "", nm); if (nm == "") continue
          split(nm, w, /[ \t]+/); key = (w[1] == "type") ? w[2] : w[1]
          if (key in gone) continue
          out = out "  " nm ",\n"; k++
        }
        if (k > 0) printf "import {\n%s} %s\n", out, tail
      }
      !inb && /^import \{/ {
        line = $0
        if (line ~ /\} from /) { body = line; sub(/^import \{/, "", body); tail = body; sub(/\}.*/, "", body); sub(/^[^}]*\} /, "", tail); flush(); next }
        inb = 1; body = line; sub(/^import \{/, "", body); next
      }
      inb && /^\} from / { tail = $0; sub(/^\} /, "", tail); inb = 0; flush(); next }
      inb { body = body "," $0; next }
      { print }' "$T/gone" "$f" > "$T/f.new"
    mv "$T/f.new" "$f"
  done
  rm -rf "$OUT/tree"; cp -r "$T/tree/compiler" "$OUT/tree"
  # (c) Build, then the self-compile to a fixpoint.
  if ! "$VL" build "$T/tree/compiler/entry.vl" -o "$T/b1.wasm" --compiler "$SEED" > "$T/build.log" 2>&1; then
    { cat "$T/stage"; echo "deleted: $(grep -vc '	let ' "$OUT/deleted.txt") functions, $lets lets"
      echo "BUILD FAILED: the swept tree does not build under $SEED (a stub that does not type goes in stub-bodies.txt):"
      { grep -E '^\[ERROR\]|^  at ' "$T/build.log" || tail -20 "$T/build.log"; } | head -40; } > "$OUT/report.txt"
    RC=2; return
  fi
  local fix="no" c="$T/b1.wasm" i=2
  while [ $i -le 4 ]; do
    if ! VL_IR_SHADOW=5 "$VL" build "$T/tree/compiler/entry.vl" -o "$T/b$i.wasm" --compiler "$c" > "$T/self.log" 2>&1; then
      fix="self-compile fails at step $i: $(grep -m1 -oE 'i8 stub [A-Za-z0-9_]+' "$T/self.log" || grep -m1 '^\[ERROR\]' "$T/self.log" || echo '?')"
      break
    fi
    if cmp -s "$c" "$T/b$i.wasm"; then fix="yes (step $i)"; break; fi
    c="$T/b$i.wasm"; i=$((i + 1))
  done
  cp "$c" "$OUT/compiler.wasm"
  # The populations: the self-compile's own result, then each list under both compilers.
  : > "$T/failing" ; : > "$T/needs"
  grep -E '(claim fell back|IR claim refused).*i8 stub [A-Za-z0-9_]+' "$T/self.log" \
    | grep -oE 'i8 stub [A-Za-z0-9_]+' | sed 's/^i8 stub /self\tcompiler\/entry.vl\t/' >> "$T/needs" || true
  [ "$fix" != "${fix#self-compile fails}" ] && printf 'self\tcompiler/entry.vl\t%s\n' "$(grep -m1 -oE 'i8 stub [A-Za-z0-9_]+' "$T/self.log" | sed 's/i8 stub //' || echo other)" >> "$T/failing"
  for pop in ${POPS//,/ }; do
    [ "$pop" = self ] && continue
    [ -s "$T/base.$pop" ] || scan "$SEED" "$T/$pop" > "$T/base.$pop"
    scan "$c" "$T/$pop" > "$T/sweep.$pop"
    grep $'\tNEED ' "$T/sweep.$pop" | awk -F'\t' -v p="$pop" '{ sub(/^NEED /, "", $2); print p "\t" $1 "\t" $2 }' >> "$T/needs" || true
    awk -F'\t' -v p="$pop" 'FILENAME == ARGV[1] { if ($2 !~ /^NEED /) bad[$1] = 1; next }
      $2 ~ /^NEED / || ($1 in bad) || ($1 in seen) { next }
      { seen[$1] = 1; s = "other"; if (match($2, /i8 stub [A-Za-z0-9_]+/)) s = substr($2, RSTART + 8, RLENGTH - 8); print p "\t" $1 "\t" s }' \
      "$T/base.$pop" "$T/sweep.$pop" >> "$T/failing"
  done
  cp "$T/failing" "$OUT/failing.tsv"
  sort -u "$T/needs" | awk -F'\t' '{ n[$3]++ } END { for (k in n) print k "\t" n[k] }' | sort -t$'\t' -k2,2nr > "$OUT/needs.tsv"
  {
    cat "$T/stage"
    echo "deleted: $(grep -vc '	let ' "$OUT/deleted.txt") functions, $lets lets; keep-list $(grep -v '^#' "$KEEP" | awk 'NF' | wc -l) names"
    echo "self-compile fixpoint: $fix"
    for pop in ${POPS//,/ }; do
      [ "$pop" = self ] && continue
      echo "$pop: $(wc -l < "$T/$pop") programs, $(awk -F'\t' -v p="$pop" '$1 == p' "$T/failing" | wc -l) newly failing"
    done
    echo "newly failing, by the first stub hit (programs):"
    cut -f3 "$T/failing" | sort | uniq -c | sort -rn | awk '{ printf "  %6d  %s\n", $1, $2 }'
    echo "IR needs (claims that fell back on or refused inside a stub; programs):"
    awk -F'\t' '{ printf "  %6d  %s\n", $2, $1 }' "$OUT/needs.tsv"
  } > "$OUT/report.txt"
  if [ -s "$T/failing" ]; then RC=1; else RC=0; fi
}

lists
it=1
while :; do
  run
  echo "== run $it: $(grep -c . "$OUT/failing.tsv" 2>/dev/null || echo 0) newly failing, $(grep -c . "$OUT/needs.tsv" 2>/dev/null || echo 0) IR needs" >&2
  [ "$GROW" = 1 ] && [ "$RC" != 2 ] || break
  new=$(cut -f1 "$OUT/needs.tsv" | grep -vxF -f <(tr ' ' '\n' <<< "$ENTRY") | grep -vxF -f <(awk '!/^#/ && NF { print $1 }' "$KEEP") || true)
  [ -n "$new" ] || break
  for n in $new; do echo "$n ir-tail" >> "$KEEP"; done
  echo "== grew the keep-list by $(wc -w <<< "$new"): $(tr '\n' ' ' <<< "$new")" >&2
  it=$((it + 1)); [ $it -le "$MAXIT" ] || { echo "ir-i8-sweep: --max-iter $MAXIT reached" >&2; break; }
done
cat "$OUT/report.txt"
exit "$RC"
