#!/usr/bin/env bash
# The slot-delivery audit: how many programs the elaboration's slot reader (`elabSlotDeliveries`)
# and the flow table's pins (`fnFlowDeclPathPinSigs`) disagree in, over `tests/cases` and the
# distilled corpus. A delivery writer's PR reports this count before and after.
#
#   scripts/slot-delivery-audit.sh <commit> [jobs]
#
# Builds <commit> into a scratch tree with `monoDeclPathKeysIn` patched to compare the two answers
# (a disagreement fails the program with a `SIGDIFF` line), runs every program, prints the count,
# and leaves the per-program lines in $TMPDIR/slot-delivery-audit.txt. Run from the checkout root.
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
const p = Deno.args[0] + "/compiler/emit_mono.vl";
let s = Deno.readTextFileSync(p);
const old = "  fnFlowDeclPathPinSigs(d, path, inst, tmpl, dead)\n}";
if (!s.includes(old)) throw new Error("monoDeclPathKeysIn changed shape: update the audit");
s = s.replace(old, "  zzPins(fnFlowDeclPathPinSigs(d, path, inst, tmpl, dead), d, path)\n}");
s = s.replace(
  "import { emitFail, emitFailAt } from \"./emit_bytes\"",
  "import { emitFail, emitFailAt } from \"./emit_bytes\"\nimport { elabSlotDeliveries as zzDeliv } from \"./emit_elab\"",
);
s += `
function zzPins(a: string[], d: i32, path: string[]): string[] {
  if a.length == 1 && a[0] == FF_PIN_DECLINE { return a }
  const b: string[] = []
  for t in zzDeliv(d, path) {
    const ft = tyAt(t)
    if ft is TyFunc {
      const sg = fnFlowPinSigOf(ft.fnParamTypes)
      if !strListHas(b, sg) { b.push(sg) }
    }
  }
  let onlyTbl = ""
  for x in a { if !strListHas(b, x) { onlyTbl = onlyTbl + x + "|" } }
  let onlyNew = ""
  for x in b { if !strListHas(a, x) { onlyNew = onlyNew + x + "|" } }
  if onlyTbl != "" || onlyNew != "" {
    let ps = ""
    for k in path { ps = ps + k + "/" }
    const dn = nodeAt(d)
    const kind = if dn is LetDecl { "let" } else if dn is Param { "param" } else if dn is ArrayLit { "arr" } else if dn is ObjLit { "obj" } else if dn is Ident { "ident" } else { "other" }
    const dir = if onlyNew == "" { "tbl" } else if onlyTbl == "" { "new" } else { "both" }
    emitFail("SIGDIFF class=" + kind + "-" + dir + " p=" + ps + " onlyTbl=[" + onlyTbl + "] onlyNew=[" + onlyNew + "]")
  }
  a
}
`;
Deno.writeTextFileSync(p, s);
' "$tmp/tree"
(cd "$tmp/tree" && VL_STD="$tmp/tree/std" timeout 300 "$vl" build compiler/entry.vl \
  --compiler "$root/build/vl-compiler.wasm" -o "$tmp/audit.wasm" >/dev/null)
{ find tests/cases -name '*.vl'; find scripts/silent-sweep/distilled/cells scripts/silent-sweep/distilled/named -name '*.vl'; } |
  sort | xargs -P "$jobs" -I{} sh -c \
    'o=$(VL_STD="'"$root"'/std" timeout 120 "'"$vl"'" run "{}" --compiler "'"$tmp"'/audit.wasm" 2>&1 </dev/null | grep -o "SIGDIFF.*" | head -1); [ -n "$o" ] && echo "{} $o"; true' |
  sort > "$out"
echo "slot-delivery audit at $(git -C "$root" rev-parse --short "$commit"): $(wc -l < "$out") programs disagree ($out)"
grep -o "class=[a-z]*-[a-z]*" "$out" | sort | uniq -c | sort -rn
