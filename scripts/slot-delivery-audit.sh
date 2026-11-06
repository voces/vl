#!/usr/bin/env bash
# The slot-delivery audit: how many programs the elaboration's slot reader (`elabSlotDeliveries`)
# and the flow table's pins (its `ffDeclPathPinKeys` walk) disagree in, over `tests/cases` and the
# distilled corpus. A delivery writer's PR reports this count before and after.
#
#   scripts/slot-delivery-audit.sh <commit> [jobs]
#
# Builds <commit> into a scratch tree with `monoDeclPathKeysIn` patched to compare the two answers
# (a disagreement fails the program with a `SIGDIFF` line), runs every program, prints the count,
# and leaves the per-program lines in $TMPDIR/slot-delivery-audit.txt, the programs whose audit build
# traps in $TMPDIR/slot-delivery-audit-trapped.txt. Run from the checkout root.
set -euo pipefail
commit=${1:?usage: slot-delivery-audit.sh <commit> [jobs]}
jobs=${2:-6}
root=$(pwd)
vl="$root/scripts/vl-host/target/release/vl"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/sda.XXXXXX")
out="${TMPDIR:-/tmp}/slot-delivery-audit.txt"
trap 'git -C "$root" worktree remove --force "$tmp/tree" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
git -C "$root" worktree add -q --detach "$tmp/tree" "$commit"
deno eval '
const t = Deno.args[0];
const fp = t + "/compiler/fn_flow_shadow.vl";
let f = Deno.readTextFileSync(fp);
if (!f.includes("function ffDeclPathPinKeys(")) throw new Error("ffDeclPathPinKeys is gone: update the audit");
f += `
export function zzTablePins(d: i32, path: string[], inst: i32, tmpl: i32): string[] {
  ffDeclPathPinKeys(d, path, inst, tmpl, false)
}
`;
Deno.writeTextFileSync(fp, f);
const p = t + "/compiler/emit_mono.vl";
let s = Deno.readTextFileSync(p);
const head = s.indexOf("function monoDeclPathKeysIn(");
const tail = "  }\n  out\n}";
const at = s.indexOf(tail, head);
if (head < 0 || at < 0) throw new Error("monoDeclPathKeysIn changed shape: update the audit");
s = s.slice(0, at) + "  }\n  zzPins(zzTablePins(d, path, inst, tmpl), out, path)\n}" + s.slice(at + tail.length);
s = s.replace(
  "import { emitFail, emitFailAt } from \"./emit_bytes\"",
  "import { emitFail, emitFailAt } from \"./emit_bytes\"\nimport { zzTablePins } from \"./fn_flow_shadow\"",
);
s += `
function zzPins(a: string[], b: string[], path: string[]): string[] {
  if a.length == 1 && a[0] == FF_PIN_DECLINE { return b }
  let onlyTbl = ""
  for x in a { if !strListHas(b, x) { onlyTbl = onlyTbl + x + "|" } }
  let onlyNew = ""
  for x in b { if !strListHas(a, x) { onlyNew = onlyNew + x + "|" } }
  if onlyTbl != "" || onlyNew != "" {
    let ps = ""
    for k in path { ps = ps + k + "/" }
    const dir = if onlyNew == "" { "tbl" } else if onlyTbl == "" { "new" } else { "both" }
    emitFail("SIGDIFF class=" + dir + " p=" + ps + " onlyTbl=[" + onlyTbl + "] onlyNew=[" + onlyNew + "]")
  }
  b
}
`;
Deno.writeTextFileSync(p, s);
' "$tmp/tree"
(cd "$tmp/tree" && VL_STD="$tmp/tree/std" timeout 300 "$vl" build compiler/entry.vl \
  --compiler "$root/build/vl-compiler.wasm" -o "$tmp/audit.wasm" >/dev/null)
{ find tests/cases -name '*.vl'; find scripts/silent-sweep/distilled/cells scripts/silent-sweep/distilled/named -name '*.vl'; } |
  sort | xargs -P "$jobs" -I{} sh -c \
    'o=$(VL_STD="'"$root"'/std" timeout 120 "'"$vl"'" run "{}" --compiler "'"$tmp"'/audit.wasm" 2>&1 </dev/null | grep -oE "SIGDIFF.*|compiler itself trapped" | head -1); [ -n "$o" ] && echo "{} $o"; true' |
  sort > "$tmp/all.txt"
grep "SIGDIFF" "$tmp/all.txt" > "$out" || true
grep -v "SIGDIFF" "$tmp/all.txt" > "${out%.txt}-trapped.txt" || true
echo "slot-delivery audit at $(git -C "$root" rev-parse --short "$commit"): $(wc -l < "$out") programs disagree ($out)"
grep -o "class=[a-z]*" "$out" | sort | uniq -c | sort -rn
# A program whose audit build traps compares nothing, so it is counted apart rather than as agreeing.
echo "$(wc -l < "${out%.txt}-trapped.txt") programs trap the audit build (${out%.txt}-trapped.txt)"
