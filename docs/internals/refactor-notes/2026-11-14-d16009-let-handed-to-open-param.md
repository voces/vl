# D16009: a re-pointed `let` handed to an open parameter dispatches

**Change.** `holeLetJudge` (`check_relate_core.vl`) leaves a widened binding handed on to the tag
decision instead of refusing at the callee's pin. If the decision tags the set, the callee's
instance dispatches on the member, and D16091's join gives the caller `i32 | string`. If it leaves
the set a closure, `fnTagEtaAgain` vetoes the binding and the program is re-checked at the
initialiser's type, where the judge still refuses. So no untagged set reaches a call at two result
types. A member returning nothing is still refused outright (owner ruling B2).

**Matrix** (base → candidate):

| program | base | now |
| --- | --- | --- |
| `let f` handed, `ap(f, 3)`, both branches | refused | `s 4` |
| handed through `ap2` | refused | `s 4` |
| members agree (`inc`, `dbl`) | `6 4` | `6 4` |
| `ap(f, 3) + 1` | refused | refused, naming `i32 \| string` |
| handed to a closed `(a: i32) => i32` parameter | refused | refused |
| void member (B2) | refused | refused, same message |
| returned then handed, `ap(sel(true), 3)` (D13966) | refused | refused — D16094 |
| a choice handed on (`if`/`match` value, two `return`s) | refused | refused — D16094 |
