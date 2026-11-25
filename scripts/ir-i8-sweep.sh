#!/usr/bin/env bash
# The I8 cutover as one re-runnable command (ir-i8-cutover-2026-11.md §5), in a throwaway tree:
#
#     scripts/ir-i8-sweep.sh <keep-list> [--grow] [--pops self,distilled,cases,probes,witnesses]
#                            [--out <dir>] [--max-iter N] [--check | --write-baseline]
#     scripts/ir-i8-sweep.sh <keep-list> --edges [--check | --write-baseline]
#
# (a) stub-reach.sh's stage B, minus <keep-list>: the 14 entry points and every emitter function
#     that calls an emptied one are emptied, each to `emitFail("i8 stub <name>")`
#     (scripts/ir-i8-census/stub-bodies.txt where that does not type); then every function
#     `dead-exports.vl --list` names, with compiler/entry.vl's exports as the only roots, is deleted.
# (b) A module `let` or `const` no remaining compiler/ text names is deleted, to a fixpoint.
# (c) The tree is built with the checkout's fixpoint seed, then refreshed by itself to a fixpoint
#     (the self-compile, first). Every population then runs `vl check --codegen` under that compiler
#     and under the seed. A program that fails only under the tree is newly failing, grouped by the
#     first stub it hits: its first IR need when it has one (a claim that falls back on, or refuses
#     inside, a stub or a re-entry, after which legacy's lowering fails too), else its first error.
# A kept function's (and the start and constant-cell writers') call of `emitExpr` or `emitWidened`
# is rewritten to a stub naming its caller (`i8 reentry <caller>`): those callers are the port list.
# A claim that falls back for a reason the seed's run of that program does not show is reported
# too, since a stubbed helper that returns a sentinel makes the IR decline with its own reason,
# beside the stubbed functions the IR files call by name (the static IR-to-stub edges).
# Every stub also records its name (`i8 hit <name>` rows), so a run sees every stub a program
# reaches, not only the first. The baseline side runs the census probe (probe-patch.sh), so a
# newly failing program with no function or start body the seed already leaves unclaimed is
# UNEXPLAINED: a re-entry or a stubbed helper the claim path needs. Its causes (the first stub or
# re-entry, and each fallback reason the seed lacks, `fallback: <reason>`) are the ratchet:
# --check exits 1 on a cause scripts/ir-i8-census/sweep-baseline.txt does not list, and
# --write-baseline only removes causes. Counts are printed, never graded, because coverage moves
# programs from explained to unexplained (coordinator ruling, 2026-11-25).
# --edges is the static half, in seconds and with no build: every call a kept function or an ir*.vl
# file makes of a stubbed function (`<caller>\t<stub>`), the latent paths from the claim path into
# stage B; the boundary writers scripts/ir-i8-census/boundary.txt names are marked. --check exits 1
# on an edge scripts/ir-i8-census/edges-baseline.txt does not hold.
# --grow appends each IR need that is a stub, not an entry point or a re-entry, to <keep-list>
# (reason `ir-tail`), and each stub a program reaches whose claim fell back for a reason the seed
# lacks (reason `ir-sentinel`), and runs again, until a run finds none or --max-iter (default 30) have passed.
# Writes <out>/report.txt (the summary and the stub table), <out>/failing.tsv (pop, program, stub),
# <out>/fell.tsv (pop, program, a fallback reason new under the sweep), <out>/ir-stub-edges.txt,
# <out>/needs.tsv (stub, programs), <out>/tree (the swept compiler/), <out>/compiler.wasm (built from it)
# and <out>/deleted.txt. Exit 0
# when no program newly fails, 1 when one does, 2 when the tree does not build. It deletes nothing
# in the checkout. Run from the checkout root after scripts/refresh-compiler.sh; $VL names the
# host, $JOBS the fan-out (default 4).
set -euo pipefail
KEEP=${1:?usage: scripts/ir-i8-sweep.sh <keep-list> [--grow] [--pops LIST] [--out DIR] [--max-iter N]}
shift
EDGES=0 GROW=0 POPS=self,distilled,cases,probes,witnesses OUT=build/ir-i8-sweep MAXIT=30 RATCHET=""
BASELINE_FILE=${IR_I8_SWEEP_BASELINE:-scripts/ir-i8-census/sweep-baseline.txt}
# Static edges, --edges: --write-baseline there rewrites edges-baseline.txt whole.
while [ $# -gt 0 ]; do
  case "$1" in
    --grow) GROW=1; shift ;;
    --pops) POPS=${2:?}; shift 2 ;;
    --out) OUT=${2:?}; shift 2 ;;
    --max-iter) MAXIT=${2:?}; shift 2 ;;
    --check|--write-baseline) RATCHET=$1; shift ;;
    --edges) EDGES=1; shift ;;
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
export VL_STD="${VL_STD:-$PWD/std}" VL_IR_STRICT=1 T

# Each population's program list, once.
lists() {
  ls scripts/silent-sweep/distilled/cells/*.vl scripts/silent-sweep/distilled/named/*.vl > "$T/distilled"
  find tests/cases -name '*.vl' | sort > "$T/cases"
  ls scripts/capability-probes/*.vl > "$T/probes"
  "$VL" run scripts/ir-i8-census/witnesses.vl -- "$T/wit" docs/internals/inventory docs/internals/inventory-2 > "$T/witnesses"
  # The baseline compiler: the census probe of this checkout, which also names what it leaves unclaimed.
  cp -r compiler "$T/probe"
  bash scripts/ir-i8-census/probe-patch.sh "$T/probe"
  "$VL" build "$T/probe/entry.vl" -o "$T/probe.wasm" --compiler "$SEED" > /dev/null
}

# `<file>\t<message>` for every error `vl check --codegen` under compiler $1 prints for the
# programs listed in $2, and `<file>\tNEED <stub>` for a claim that fell back on or refused inside
# a stub. An error's `at <file>:l:c` line follows its message.
scan() {
  cat > "$T/one.sh" <<'ONE'
VL_IR_SHADOW=5 "$VL" check --codegen --compiler "$C" "$@" 2>&1 > /dev/null | awk '
  /^\[ERROR\]: / { msg = $0; sub(/^\[ERROR\]: /, "", msg); next }
  msg != "" && /^  at [^ ]+:[0-9]+:[0-9]+/ { f = $2; sub(/:[0-9]+:[0-9]+$/, "", f); print f "\t" msg; fflush(); msg = ""; next }
  /^\[ir\] / && /i8 (stub|reentry) [A-Za-z0-9_]+/ && /(claim fell back|IR claim refused)/ {
    h = $0; sub(/^\[ir\] /, "", h); sub(/: [0-9]+\t.*/, "", h)
    match($0, /i8 (stub|reentry) [A-Za-z0-9_]+/); w = substr($0, RSTART + 3, RLENGTH - 3)
    sub(/^stub /, "", w); print h "\tNEED " w; fflush(); next
  }
  /^\[ir\] / && /\t(fnu |start uncovered )/ { h = $0; sub(/^\[ir\] /, "", h); sub(/: [0-9]+\t.*/, "", h); print h "\tUNC"; fflush(); next }
  /^\[ir\] / && /\ti8 hit / { h = $0; sub(/^\[ir\] /, "", h); sub(/: [0-9]+\t.*/, "", h); r = $0; sub(/.*\ti8 hit /, "", r); print h "\tHIT " r; fflush(); next }
  /^\[ir\] / && /\tclaim fell back: / {
    h = $0; sub(/^\[ir\] /, "", h); sub(/: [0-9]+\t.*/, "", h)
    r = $0; sub(/.*\tclaim fell back: /, "", r); print h "\tFELL " r; fflush()
  }'
ONE
  xargs -r -n 100 -P "$JOBS" env VL="$VL" C="$1" sh "$T/one.sh" < "$2" || true
}

# One run over keep-list $KEEP; sets RC.
run() {
  rm -rf "$T/tree" "$T/reach"
  STUB_KEEP="$KEEP" STUB_BODIES=scripts/ir-i8-census/stub-bodies.txt STUB_TREE="$T/tree" STUB_ONLY_B=1 \
    bash scripts/ir-i8-census/stub-reach.sh "$T/reach" | tee "$T/stage" >&2
  # Re-entry tags: inside each kept function and the start and constant-cell writers, a call of
  # emitExpr or emitWidened becomes emitExprRe/emitWidenedRe naming its caller.
  { awk '!/^#/ && NF { print $1 }' "$KEEP"; printf '%s\n' emitStartGlobalInit emitStartGlobalInitValue emitConstCellInit; } > "$T/tagged"
  for f in "$T"/tree/compiler/*.vl; do
    awk -v base="$(basename "$f")" 'FILENAME == ARGV[1] { tag[$1] = 1; next }
      function tagcall(l, name, re,   out, p, pre) {
        out = ""
        while ((p = index(l, name "(")) > 0) {
          pre = (p > 1) ? substr(l, p - 1, 1) : ""
          if (pre ~ /[A-Za-z0-9_.]/) { out = out substr(l, 1, p + length(name)); l = substr(l, p + length(name) + 1); continue }
          out = out substr(l, 1, p - 1) re "(\"" cur "\", "; l = substr(l, p + length(name) + 1); hit[re] = 1
        }
        return out l
      }
      /^(export )?function [A-Za-z0-9_]+[ (<]/ { cur = $0; sub(/^(export )?function /, "", cur); sub(/[ (<].*/, "", cur) }
      /^}/ { print; cur = ""; next }
      cur != "" && (cur in tag) && $0 !~ /^ *\/\// { l = tagcall($0, "emitExpr", "emitExprRe"); l = tagcall(l, "emitWidened", "emitWidenedRe"); print l; next }
      { print }
      END { for (k in hit) print k > (ENVIRON["T"] "/uses." base) }' "$T/tagged" "$f" > "$T/f.new"
    mv "$T/f.new" "$f"
  done
  cat >> "$T/tree/compiler/wasmEmit.vl" <<'VL'

// The sweep's re-entry tags: a kept function that still lowers an operand through legacy.
export function emitExprRe(caller: string, exprIx: i32, fnIx: i32): i32 {
  emitFail("i8 reentry " + caller)
  return 0
}

export function emitWidenedRe(caller: string, ix: i32, dst: i32, fnIx: i32): i32 {
  emitFail("i8 reentry " + caller)
  return 0
}
VL
  for u in "$T"/uses.*; do
    [ -e "$u" ] || continue
    b=${u##*/uses.}; [ "$b" = wasmEmit.vl ] && continue
    { echo "import { $(sort "$u" | paste -sd, | sed 's/,/, /g') } from \"./wasmEmit\""; cat "$T/tree/compiler/$b"; } > "$T/f.new"
    mv "$T/f.new" "$T/tree/compiler/$b"
  done
  rm -f "$T"/uses.*
  # Stub hits: each stub records its name before it fails, and the IR shadow's next row drains them.
  cat >> "$T/tree/compiler/emit_bytes.vl" <<'VL'

// The sweep's stub hits, drained into the IR shadow's rows as `i8 hit <name>`.
let i8HitList: string[] = []
let i8HitAt = 0
export function i8Hit(n: string) {
  i8HitList.push(n)
  return 0
}
export function i8HitReset() {
  i8HitList = []
  i8HitAt = 0
  return 0
}
export function i8HitTake(): string {
  if i8HitAt >= i8HitList.length { return "" }
  const h = i8HitList[i8HitAt]
  i8HitAt = i8HitAt + 1
  return h
}
VL
  for f in "$T"/tree/compiler/*.vl; do
    grep -qE '^  (return )?emitFail\("i8 stub ' "$f" || continue
    sed -i -E 's/^  (return )?emitFail\("i8 stub ([A-Za-z0-9_]+)"\)/  i8Hit("\2")\n&/' "$f"
    if [ "${f##*/}" != emit_bytes.vl ]; then { echo 'import { i8Hit } from "./emit_bytes"'; cat "$f"; } > "$T/f.new"; mv "$T/f.new" "$f"; fi
  done
  sed -i 's/^  emitFail("i8 reentry " + caller)$/  i8Hit("reentry " + caller)\n&/' "$T/tree/compiler/wasmEmit.vl"
  awk '/^export function irShadowBegin\(\) \{$/ { print; print "  i8HitReset()"; b = 1; next }
    /^function count\(key: string\) \{$/ { print; print "  let h = i8HitTake()"; print "  while h != \"\" {"; print "    count(\"i8 hit \" + h)"; print "    h = i8HitTake()"; print "  }"; c = 1; next }
    { print }
    END { if (!b || !c) { print "ir-i8-sweep: an i8 hit anchor in ir_build.vl was not found" > "/dev/stderr"; exit 1 } }' \
    "$T/tree/compiler/ir_build.vl" > "$T/f.new"
  { echo 'import { i8HitReset, i8HitTake } from "./emit_bytes"'; cat "$T/f.new"; } > "$T/tree/compiler/ir_build.vl"
  # The static IR-to-stub edges: stubbed functions an ir*.vl file calls by name.
  grep -ohE 'emitFail\("i8 stub [A-Za-z0-9_]+"\)' "$T"/tree/compiler/*.vl | sed -E 's/.*i8 stub ([A-Za-z0-9_]+).*/\1/' | sort -u > "$T/stubs"
  grep -ohE '[A-Za-z_][A-Za-z0-9_]*\(' "$T"/tree/compiler/ir*.vl | tr -d '(' | sort -u | comm -12 - "$T/stubs" > "$OUT/ir-stub-edges.txt"
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
      fix="self-compile fails at step $i: $(grep -oE 'i8 (stub|reentry) [A-Za-z0-9_]+' "$T/self.log" | sort | uniq -c | sort -rn | awk '{ printf "%s%s %s (%d)", (NR > 1 ? ", " : ""), $3, $4, $1 }' || true)"
      [ "$fix" != "self-compile fails at step $i: " ] || fix="$fix$(grep -m1 '^\[ERROR\]' "$T/self.log" || echo '?')"
      break
    fi
    if cmp -s "$c" "$T/b$i.wasm"; then fix="yes (step $i)"; break; fi
    c="$T/b$i.wasm"; i=$((i + 1))
  done
  cp "$c" "$OUT/compiler.wasm"
  # The populations: the self-compile's own result, then each list under both compilers.
  : > "$T/failing" ; : > "$T/needs" ; : > "$T/fell" ; : > "$T/unexplained" ; : > "$T/hits"
  grep -E '(claim fell back|IR claim refused).*i8 stub [A-Za-z0-9_]+' "$T/self.log" \
    | grep -oE 'i8 stub [A-Za-z0-9_]+' | sed 's/^i8 stub /self\tcompiler\/entry.vl\t/' >> "$T/needs" || true
  [ "$fix" != "${fix#self-compile fails}" ] && printf 'self\tcompiler/entry.vl\t%s\n' "$(grep -m1 -oE 'i8 (stub|reentry) [A-Za-z0-9_]+' "$T/self.log" | sed -E 's/i8 (stub )?//' || echo other)" >> "$T/failing"
  for pop in ${POPS//,/ }; do
    [ "$pop" = self ] && continue
    [ -s "$T/base.$pop" ] || scan "$T/probe.wasm" "$T/$pop" > "$T/base.$pop"
    scan "$c" "$T/$pop" > "$T/sweep.$pop"
    grep $'\tNEED ' "$T/sweep.$pop" | awk -F'\t' -v p="$pop" '{ sub(/^NEED /, "", $2); print p "\t" $1 "\t" $2 }' >> "$T/needs" || true
    awk -F'\t' -v p="$pop" 'FNR == 1 { fi++ }
      fi == 1 { if ($2 !~ /^(NEED|FELL|HIT) / && $2 != "UNC") bad[$1] = 1; next }
      fi == 2 { if ($2 ~ /^NEED / && !($1 in need)) { need[$1] = $2; sub(/^NEED /, "", need[$1]) }; next }
      $2 ~ /^(NEED|FELL|HIT) / || $2 == "UNC" || ($1 in bad) || ($1 in seen) { next }
      { seen[$1] = 1; s = "other"; if (match($2, /i8 (stub|reentry) [A-Za-z0-9_]+/)) { s = substr($2, RSTART + 3, RLENGTH - 3); sub(/^stub /, "", s) }
        if ($1 in need) s = need[$1]
        print p "\t" $1 "\t" s }' \
      "$T/base.$pop" "$T/sweep.$pop" "$T/sweep.$pop" >> "$T/failing"
    # Unexplained: newly failing with nothing the seed leaves unclaimed. And every stub each program reaches.
    # Explained: the seed leaves a function or start unclaimed, or a claim falls back under the seed
    # too; a module case's rows print under whichever of its files the batch built, so they explain
    # every file of its directory. An error located in std names no program.
    awk -F'\t' -v p="$pop" 'function dir(f) { if (f !~ /^tests\/cases\/modules\//) return ""; sub(/\/[^\/]*$/, "", f); return f }
      FILENAME == ARGV[1] { if ($2 == "UNC" || $2 ~ /^FELL /) { unc[$1] = 1; d = dir($1); if (d != "") udir[d] = 1 }; next }
      $1 == p && $2 !~ /^std:/ && !($2 in unc) && !(dir($2) != "" && (dir($2) in udir)) { print p "\t" $2 "\t" $3 }' "$T/base.$pop" "$T/failing" >> "$T/unexplained"
    grep $'\tHIT ' "$T/sweep.$pop" | awk -F'\t' -v p="$pop" '{ sub(/^HIT /, "", $2); print p "\t" $1 "\t" $2 }' >> "$T/hits" || true
    # A fallback reason the seed's run of the same program does not show.
    awk -F'\t' -v p="$pop" 'FILENAME == ARGV[1] { if ($2 ~ /^FELL /) had[$1 "\t" $2] = 1; next }
      $2 ~ /^FELL / && !(($1 "\t" $2) in had) && $2 !~ /i8 (stub|reentry)/ { sub(/^FELL /, "", $2); print p "\t" $1 "\t" $2 }' \
      "$T/base.$pop" "$T/sweep.$pop" >> "$T/fell"
  done
  cp "$T/failing" "$OUT/failing.tsv"; sort -u "$T/fell" > "$OUT/fell.tsv"
  sort -u "$T/unexplained" > "$OUT/unexplained.tsv"; sort -u "$T/hits" > "$OUT/hits.tsv"
  # The self-compile has no seed-unclaimed function, so its failure is unexplained too.
  awk -F'\t' '$1 == "self"' "$T/failing" >> "$OUT/unexplained.tsv"
  UNEXPLAINED=$(wc -l < "$OUT/unexplained.tsv")
  # The causes the ratchet holds: each unexplained program's cause, and each new fallback reason.
  { cut -f3 "$OUT/unexplained.tsv"; cut -f3 "$OUT/fell.tsv" | sed 's/^/fallback: /'; } | sort -u > "$OUT/causes.txt"
  sort -u "$T/needs" | awk -F'\t' '{ n[$3]++ } END { for (k in n) print k "\t" n[k] }' | sort -t$'\t' -k2,2nr > "$OUT/needs.tsv"
  {
    cat "$T/stage"
    echo "deleted: $(grep -vc '	let ' "$OUT/deleted.txt") functions, $lets lets; keep-list $(grep -v '^#' "$KEEP" | awk 'NF' | wc -l) names"
    echo "self-compile fixpoint: $fix"
    for pop in ${POPS//,/ }; do
      [ "$pop" = self ] && continue
      echo "$pop: $(wc -l < "$T/$pop") programs, $(awk -F'\t' -v p="$pop" '$1 == p' "$T/failing" | wc -l) newly failing"
    done
    echo "unexplained (newly failing, nothing the seed leaves unclaimed): $UNEXPLAINED programs"
    cut -f3 "$OUT/unexplained.tsv" | sort | uniq -c | sort -rn | awk '{ n = $1; $1 = ""; printf "  %6d %s\n", n, $0 }'
    echo "newly failing, by the first stub hit (programs):"
    cut -f3 "$T/failing" | sort | uniq -c | sort -rn | awk '{ n = $1; $1 = ""; printf "  %6d %s\n", n, $0 }'
    echo "IR needs (claims that fell back on or refused inside a stub or a re-entry; programs):"
    awk -F'\t' '{ printf "  %6d  %s\n", $2, $1 }' "$OUT/needs.tsv"
    echo "IR fallbacks the seed does not show, by reason (programs; trace each to a stub below):"
    sort -u "$T/fell" | cut -f3 | sort | uniq -c | sort -rn | awk '{ n = $1; $1 = ""; printf "  %6d %s\n", n, $0 }'
    echo "every stub reached (programs reaching it, all populations):"
    cut -f2,3 "$OUT/hits.tsv" | sort -u | cut -f2 | sort | uniq -c | sort -rn | head -40 | awk '{ n = $1; $1 = ""; printf "  %6d %s\n", n, $0 }'
    echo "static IR-to-stub edges (stubbed functions an ir*.vl file calls by name): $(wc -l < "$OUT/ir-stub-edges.txt")"
    sed 's/^/  /' "$OUT/ir-stub-edges.txt"
  } > "$OUT/report.txt"
  if [ -s "$T/failing" ]; then RC=1; else RC=0; fi
}

# The static edges into stage B: a call of a stubbed function from a kept function or an ir*.vl file.
if [ "$EDGES" = 1 ]; then
  STUB_KEEP="$KEEP" STUB_BODIES=scripts/ir-i8-census/stub-bodies.txt STUB_TREE="$T/tree" STUB_ONLY_B=1 \
    bash scripts/ir-i8-census/stub-reach.sh "$T/reach" >&2
  grep -ohE 'emitFail\("i8 stub [A-Za-z0-9_]+"\)' "$T"/tree/compiler/*.vl | sed -E 's/.*i8 stub ([A-Za-z0-9_]+).*/\1/' | sort -u > "$T/stubs"
  awk '!/^#/ && NF { print $1 }' "$KEEP" > "$T/kept"
  awk 'FILENAME == ARGV[1] { stub[$1] = 1; next } FILENAME == ARGV[2] { kept[$1] = 1; next }
    FNR == 1 { ir = (FILENAME ~ /\/ir[^\/]*\.vl$/); cur = "" }
    match($0, /^(export )?function [A-Za-z0-9_]+[ (<]/) { cur = $0; sub(/^(export )?function /, "", cur); sub(/[ (<].*/, "", cur); next }
    /^}/ { cur = ""; next }
    cur != "" && (ir || (cur in kept)) && $0 !~ /^ *\/\// {
      l = $0
      while (match(l, /[A-Za-z_][A-Za-z0-9_]*\(/)) {
        n = substr(l, RSTART, RLENGTH - 1); pre = (RSTART > 1) ? substr(l, RSTART - 1, 1) : ""
        if (pre != "." && (n in stub) && n != cur) print cur "\t" n
        l = substr(l, RSTART + RLENGTH)
      }
    }' "$T/stubs" "$T/kept" "$T"/tree/compiler/*.vl | sort -u > "$OUT/edges.txt"
  B=scripts/ir-i8-census/boundary.txt
  echo "static edges into stage B (a kept function or an ir*.vl file calling a stubbed one): $(wc -l < "$OUT/edges.txt")"
  awk -F'\t' 'FILENAME == ARGV[1] { if ($0 !~ /^#/ && NF) w[$1] = 1; next } { print "  " $1 " -> " $2 (($2 in w) ? "   [boundary writer]" : "") }' "$B" "$OUT/edges.txt"
  [ -n "$RATCHET" ] || exit 0
  EB=scripts/ir-i8-census/edges-baseline.txt
  if [ "$RATCHET" = --write-baseline ]; then cp "$OUT/edges.txt" "$EB"; echo "ir-i8-sweep: wrote $(wc -l < "$EB") edges to $EB"; exit 0; fi
  new=$(comm -23 "$OUT/edges.txt" <(sort -u "$EB"))
  gone=$(comm -13 "$OUT/edges.txt" <(sort -u "$EB"))
  [ -z "$gone" ] || { echo "ir-i8-sweep: edges gone (run --edges --write-baseline in this PR):"; sed 's/^/  /' <<< "$gone"; }
  if [ -n "$new" ]; then echo "ir-i8-sweep: NEW edges into stage B (a kept tail now calls a stubbed writer):"; sed 's/^/  /' <<< "$new"; exit 1; fi
  echo "ir-i8-sweep: edges $(wc -l < "$OUT/edges.txt"), none new: ok"; exit 0
fi

lists
it=1
while :; do
  run
  echo "== run $it: $(grep -c . "$OUT/failing.tsv" 2>/dev/null || echo 0) newly failing, $(grep -c . "$OUT/needs.tsv" 2>/dev/null || echo 0) IR needs" >&2
  [ "$GROW" = 1 ] && [ "$RC" != 2 ] || break
  kept() { awk '!/^#/ && NF { print $1 }' "$KEEP"; tr ' ' '\n' <<< "$ENTRY"; }
  new=$(cut -f1 "$OUT/needs.tsv" | grep -v '^reentry ' | grep -vxF -f <(kept) || true)
  # A sentinel need: a stub reached by a program whose claim fell back for a reason the seed lacks.
  sent=$(awk -F'\t' 'FILENAME == ARGV[1] { fell[$2] = 1; next } ($2 in fell) && $3 !~ /^reentry / { print $3 }' \
    "$OUT/fell.tsv" "$OUT/hits.tsv" | sort -u | grep -vxF -f <(kept) | grep -vxF -f <(printf '%s\n' $new) || true)
  [ -n "$new$sent" ] || break
  for n in $new; do echo "$n ir-tail" >> "$KEEP"; done
  for n in $sent; do echo "$n ir-sentinel" >> "$KEEP"; done
  echo "== grew the keep-list by $(wc -w <<< "$new $sent"): $(tr '\n' ' ' <<< "$new $sent")" >&2
  it=$((it + 1)); [ $it -le "$MAXIT" ] || { echo "ir-i8-sweep: --max-iter $MAXIT reached" >&2; break; }
done
cat "$OUT/report.txt"
if [ "$RC" != 2 ] && [ -n "$RATCHET" ]; then
  # The cause list, one per line (`#` comments allowed); a missing baseline is written whole once.
  [ -f "$BASELINE_FILE" ] || { cp "$OUT/causes.txt" "$BASELINE_FILE"; echo "ir-i8-sweep: started $BASELINE_FILE with $(wc -l < "$BASELINE_FILE") causes"; exit 0; }
  grep -v '^#' "$BASELINE_FILE" | awk 'NF' | sort -u > "$T/base.causes"
  new=$(comm -23 "$OUT/causes.txt" "$T/base.causes")
  gone=$(comm -13 "$OUT/causes.txt" "$T/base.causes")
  if [ -n "$new" ]; then
    echo "ir-i8-sweep: NEW causes (a claim now reaches a legacy tail or stub; see $OUT/unexplained.tsv):"; sed 's/^/  /' <<< "$new"
    [ "$RATCHET" = --write-baseline ] && echo "ir-i8-sweep: --write-baseline only removes causes; it refuses a new one"
    exit 1
  fi
  if [ -n "$gone" ]; then
    echo "ir-i8-sweep: causes gone:"; sed 's/^/  /' <<< "$gone"
    if [ "$RATCHET" = --write-baseline ]; then
      { grep '^#' "$BASELINE_FILE" || true; cat "$OUT/causes.txt"; } > "$T/nb"; mv "$T/nb" "$BASELINE_FILE"
      echo "ir-i8-sweep: removed them from $BASELINE_FILE"; exit 0
    fi
    echo "ir-i8-sweep: run --write-baseline in this PR to drop them"
  fi
  echo "ir-i8-sweep: $(wc -l < "$OUT/causes.txt") causes ($UNEXPLAINED unexplained programs, not graded), none new: ok"; exit 0
fi
exit "$RC"
