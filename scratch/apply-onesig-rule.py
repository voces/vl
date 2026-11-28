import sys
f=sys.argv[1]+'/compiler/check_fn_tag.vl'
t=open(f).read()
old='''function ftTryWith(rootIx: i32, s: i32, calls: i32[], mint: i32[]) {
  if fnTagSetIsTagged(s) { return 0 }
'''
assert old in t
if 'ftOneSigScratch' not in t:
    t=t.replace(old,old+'''  if ftOneSigScratch(s, calls, mint) { return 0 }
''',1)
    t+='''
function ftOneSigScratch(s: i32, calls: i32[], mint: i32[]): boolean {
  if fnTagMembers(s).length != 1 { return false }
  for r in mint {
    if mintFactSetOf(r) == s { return false }
  }
  let sig = ""
  let seen = false
  for c in calls {
    if fnTagCallSetOf(c) == s {
      const cn = nodeAt(c)
      if !(cn is Call) { return false }
      let k = ""
      for a in cn.callArgs {
        const at = nodeTyIxOf(a)
        if at < 0 || tyHasTyVar(at) || tyHoldsHole(at) { return false }
        k = k + "," + i32ToStr(at)
      }
      if seen && k != sig { return false }
      sig = k
      seen = true
    }
  }
  return seen
}
'''
    if 'import { i32ToStr } from "./ast"' not in t:
        t='import { i32ToStr } from "./ast"\n'+t
open(f,'w').write(t)
print("rule applied")
