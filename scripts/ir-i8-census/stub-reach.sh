#!/usr/bin/env bash
# What I8 deletes, read statically: the compiler/ functions no root reaches once legacy's
# expression emitter is gone (ir-design-2026-11.md §10.3; the I8 cutover plan).
#
#     scripts/ir-i8-census/stub-reach.sh [out-dir]
#
# Copies of compiler/ have function bodies emptied, and `dead-exports.vl --list` reads each with
# compiler/entry.vl's exports as the only outside roots. Stage A empties the 14 entry points
# (`emitExpr` and kin, `emitStmt` and kin, `emitFuncBody`, `emitWidened`). B also empties every
# wasmEmit.vl/emit_*.vl function that calls an emptied one, to a fixpoint stopped at the module
# drivers (`$BAR`): the writers of a subexpression. C also empties every ir*.vl function, so what
# B keeps and C does not is what the IR alone holds. The graph is name-level, so it overstates
# edges and understates deletions. Run from the checkout root; $VL names the host.
# A stub returns `emitFail("i8 stub <name>")`, so a build that reaches it names it. For
# `scripts/ir-i8-sweep.sh`: $STUB_KEEP names a file whose first column joins `$BAR` (a kept name is
# neither emptied nor propagated through); $STUB_BODIES a file of `<name>\t<body>` lines, the body a
# stub returns where `emitFail`'s i32 does not type (`\n` splits lines); $STUB_TREE a dir that gets
# stage B's compiler/ and roots; $STUB_ONLY_B=1 skips stage C.
set -euo pipefail
OUT=${1:-}
VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
SEED_SET="emitBlockValueAs emitBlockValueAsGo emitExpr emitExprAsElem emitExprAsKind emitExprRaw emitFuncBody emitStmt emitStmtGo emitStmtIn emitStmtTail emitStmts emitStmtsTail emitWidened"
BAR=${BAR:-emitFuncCode emitStartBodyCode emitStartGlobalInit emitStartGlobalInitValue emitConstCellInit buildCodePayload emitModule emitProgram emitProgramRun}
if [ -n "${STUB_KEEP:-}" ]; then BAR="$BAR $(grep -v '^#' "$STUB_KEEP" | awk 'NF { print $1 }' | tr '\n' ' ')"; fi
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT

# The names compiler/entry.vl exports: the host's surface, so the only outside roots.
awk '
  /^export \{ [A-Za-z0-9_, ]+ \} from/ { s = $0; sub(/^export \{ /, "", s); sub(/ \}.*/, "", s); gsub(/,/, " ", s); print s; next }
  /^export \{$/ { inb = 1; next }
  inb && /^\}/ { inb = 0; next }
  inb { s = $0; gsub(/[ ,]/, "", s); print s }
  /^export function/ { s = $0; sub(/^export function /, "", s); sub(/[ (<].*/, "", s); print s }
' compiler/entry.vl | tr ' ' '\n' | grep -v '^$' | sort -u > "$T/roots"

# Empties the body of every function named in STUB, keeping its header.
cat > "$T/stub.awk" <<'AWK'
BEGIN {
  n = split(STUB, a, " "); for (i = 1; i <= n; i++) want[a[i]] = 1
  if (BODIES != "") while ((getline l < BODIES) > 0) {
    if (l ~ /^#/ || l !~ /\t/) continue
    t = index(l, "\t"); k = substr(l, 1, t - 1); b = substr(l, t + 1); gsub(/\\n/, "\n  ", b); body[k] = "  " b
  }
}
function stub(name) { return (name in body) ? body[name] : "  return emitFail(\"i8 stub " name "\")" }
{
  if (!skip && !pend && match($0, /^(export )?function [A-Za-z0-9_]+[ (<]/)) {
    s = $0; sub(/^(export )?function /, "", s); sub(/[ (<].*/, "", s)
    if (s in want) {
      cur = s
      if ($0 ~ /\{$/) { print; print stub(cur); skip = 1; next }
      pend = 1; print; next
    }
  }
  if (pend) { print; if ($0 ~ /\{$/) { print stub(cur); pend = 0; skip = 1 }; next }
  if (skip) { if ($0 ~ /^}/) { print; skip = 0 }; next }
  print
}
AWK

# One stage: `$1` names it, `$2` the emptied names, `$3` the files they are emptied in.
stage() {
  local name=$1 set=$2 files=$3 root="$T/$1"
  mkdir -p "$root/scripts"
  cp -r compiler "$root/"
  cp "$T/roots" "$root/scripts/roots.txt"
  for f in $files; do awk -v STUB="$set" -v BODIES="${STUB_BODIES:-}" -f "$T/stub.awk" "$f" > "$root/$f"; done
  "$VL" run scripts/dead-exports.vl -- --list --root "$root" > "$T/$name.dead"
  local emptied
  emptied=$(( $(ls compiler/*.vl | grep -v '/ir' | xargs cat | wc -l) - $(ls "$root"/compiler/*.vl | grep -v '/ir' | xargs cat | wc -l) ))
  while read -r loc _ fn; do
    f=${loc%%:*}; l=${loc#*:}
    n=$(awk -v s="$l" 'NR >= s { c++; if (NR > s && $0 ~ /^}/) { print c; exit } }' "$root/$f")
    printf '%s\t%s\t%s\n' "${n:-1}" "$f" "$fn"
  done < "$T/$name.dead" > "$T/$name.lines"
  awk -F'\t' -v name="$name" -v e="$emptied" -v k="$(echo "$set" | wc -w)" '
    $2 !~ /compiler\/ir/ { s += $1; n++ }
    END { printf "%s: %d functions emptied (%d lines outside ir*.vl), %d more unreached outside ir*.vl (%d lines): %d lines\n", name, k, e, n, s, e + s }
  ' "$T/$name.lines"
  [ -z "$OUT" ] || { mkdir -p "$OUT"; cp "$T/$name.lines" "$OUT/$name.lines"; }
}

EMIT="compiler/wasmEmit.vl $(ls compiler/emit_*.vl | tr '\n' ' ')"
stage A "$SEED_SET" compiler/wasmEmit.vl

# The writers of a subexpression: a caller of an emptied name, to a fixpoint, never a module driver.
awk '
  FNR == 1 { cur = "" }
  match($0, /^(export )?function [A-Za-z0-9_]+[ (<]/) { s = $0; sub(/^(export )?function /, "", s); sub(/[ (<].*/, "", s); cur = s; print "D\t" cur; next }
  /^}/ { cur = ""; next }
  cur != "" && $0 !~ /^ *\/\// {
    l = $0
    while (match(l, /[A-Za-z_][A-Za-z0-9_]*\(/)) {
      pre = (RSTART > 1) ? substr(l, RSTART - 1, 1) : ""
      if (pre != ".") print "E\t" cur "\t" substr(l, RSTART, RLENGTH - 1)
      l = substr(l, RSTART + RLENGTH)
    }
  }' $EMIT | sort -u > "$T/edges"
WRITERS=$(awk -F'\t' -v seed="$SEED_SET" -v bar="$BAR" '
  BEGIN { n = split(seed, a, " "); for (i = 1; i <= n; i++) s[a[i]] = 1; m = split(bar, b, " "); for (i = 1; i <= m; i++) no[b[i]] = 1 }
  $1 == "D" { def[$2] = 1; next }
  $1 == "E" { e++; from[e] = $2; to[e] = $3 }
  END {
    do { ch = 0; for (i = 1; i <= e; i++) if ((to[i] in s) && !(from[i] in s) && (from[i] in def) && !(from[i] in no)) { s[from[i]] = 1; ch = 1 } } while (ch)
    for (k in s) printf "%s ", k
  }' "$T/edges")
stage B "$WRITERS" "$EMIT"
if [ -n "${STUB_TREE:-}" ]; then mkdir -p "$STUB_TREE"; cp -r "$T/B/compiler" "$T/B/scripts" "$STUB_TREE/"; fi
[ "${STUB_ONLY_B:-0}" = 1 ] && exit 0
IR_ALL=$(grep -ohE '^(export )?function [A-Za-z0-9_]+' compiler/ir*.vl | sed -E 's/^(export )?function //' | tr '\n' ' ')
stage C "$WRITERS $IR_ALL" "$EMIT $(ls compiler/ir*.vl | tr '\n' ' ')"
