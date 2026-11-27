#!/bin/bash
# instr.sh: instrument ftPlan/ftScan/ftCtxOk/ftHoldCtxOk refusals in the msr worktree at origin/master
set -e
cd /home/user/vl/.claude/worktrees/msr
git checkout -q -- . && git fetch -q origin master && git checkout -q --detach origin/master
f=compiler/check_fn_tag.vl
r() { s=$(grep -n "^function $1(" $f | cut -d: -f1); e=$(awk -v s=$s 'NR>s && /^}/ {print NR; exit}' $f); echo "$s $e"; }
P=$(r ftPlan); S=$(r ftScan); C=$(r ftCtxOk); H=$(r ftHoldCtxOk); N=$(r ftNodeOk)
awk -v p1=${P% *} -v p2=${P#* } -v s1=${S% *} -v s2=${S#* } -v c1=${C% *} -v c2=${C#* } -v h1=${H% *} -v h2=${H#* } -v n1=${N% *} -v n2=${N#* } '
function inr(){ return (NR>=p1&&NR<=p2)||(NR>=s1&&NR<=s2)||(NR>=c1&&NR<=c2)||(NR>=h1&&NR<=h2)||(NR>=n1&&NR<=n2) }
inr() { xv = (NR<=p2 && NR>=p1) ? "-1" : "x"; while (match($0, /\{ return false \}/)) { $0 = substr($0,1,RSTART-1) "{ return ftMsrF(" NR ", " xv ") }" substr($0,RSTART+RLENGTH) }
  if ($0 ~ /^ *return false$/) sub(/return false/, "return ftMsrF(" NR ", " xv ")") }
{print}' $f > /tmp/claude-0/-home-user-vl/7fa865fe-c7b3-5acf-8a08-0ee5d968f84b/scratchpad/t.vl
mv /tmp/claude-0/-home-user-vl/7fa865fe-c7b3-5acf-8a08-0ee5d968f84b/scratchpad/t.vl $f
cat >> $f <<'EOF'

export let msrRows: string[] = []
function ftMsrF(l: i32, x: i32): boolean {
  msrRows.push("msr L" + i32ToStr(l) + " at " + i32ToStr(nodeLineOf(x)))
  return false
}
EOF
sed -i '16a import { nodeLineOf } from "./check_capture_loss"\nimport { i32ToStr } from "./ast"' $f
python3 - <<'EOF'
f='compiler/emit_elab.vl'
t=open(f).read()
t=t.replace('  for r in fnTagLateRows() { elabLateList.push(r) }','  for r in fnTagLateRows() { elabLateList.push(r) }\n  for r in msrRows { elabLateList.push(r) }',1)
t=t.replace('  fnTagLateRows,\n','  fnTagLateRows,\n  msrRows,\n',1)
open(f,'w').write(t)
EOF
VL_STD=$PWD/std PATH=/home/user/vl/scripts/vl-host/target/release:$PATH scripts/refresh-compiler.sh 2>&1 | grep -i "error\|refreshed\|:[0-9]*:[0-9]*:" | head -4
git log --oneline -1
cd /home/user/vl/.claude/worktrees/msr
cat >> compiler/check_elab_cap.vl <<'EOF'

export function msrSetRows(): string[] {
  const out: string[] = []
  let s = 0
  while s < fnSets.length {
    let m = ""
    for d in fnSets[s] { m = m + i32ToStr(nodeLineOfMsr(d)) + "," }
    out.push("msr set " + i32ToStr(s) + " [" + m + "] " + fnSetRep(s))
    s = s + 1
  }
  return out
}
function nodeLineOfMsr(at: i32): i32 {
  if at >= 0 && at < nodeToks.length {
    const tk = nodeToks[at]
    if tk >= 0 && tk < P.toks.length { return P.toks[tk].line }
  }
  return 0
}
EOF
sed -i '1i import { nodeToks } from "./ast"' compiler/check_elab_cap.vl
python3 - <<'EOF'
f='compiler/emit_elab.vl'
t=open(f).read()
t=t.replace('  for r in msrRows { elabLateList.push(r) }','  for r in msrRows { elabLateList.push(r) }\n  for r in msrSetRows() { elabLateList.push(r) }',1)
t='import { msrSetRows } from "./check_elab_cap"\n'+t
open(f,'w').write(t)
EOF
VL_STD=$PWD/std PATH=/home/user/vl/scripts/vl-host/target/release:$PATH scripts/refresh-compiler.sh 2>&1 | grep -i "error\|refreshed\|:[0-9]*:[0-9]*:" | head -4
