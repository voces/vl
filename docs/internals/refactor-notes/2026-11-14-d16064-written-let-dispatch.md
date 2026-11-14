# D16064: a call through a written `let` of functions whose results differ dispatches

**Change.** Three pieces, all in the checker; the emitter's tag dispatch already handled a
written binding as a callee.

* `holeLetJudge` and `holeChoiceJudge` (`check_relate_core.vl`) record their refusal for the tag
  decision (`fnTagCallRefusal`) when the call goes through a set, as `holeSetJudge` already did.
  The decision raises it only if the set stays a closure. The void-seed order (owner ruling B2)
  is still refused outright.
* `ftPlan` (`check_fn_tag.vl`) no longer leaves a written `let`'s set untagged when a call's
  members split. That exit encoded D9003's refusal, which was a clause-1 close, not a contract.
* A call through a set keeps the members' join as its type (`check_calls.vl`); before,
  `directHoleBodyRet` re-typed it from the initialiser's body, so the emitter read `i32` for an
  `i32 | string` result and built an invalid module.

**Position matrix** (base → candidate):

| program | base | candidate |
| --- | --- | --- |
| witness, `run(true)` / `run(false)` | refused | `s` / `4` |
| `sel` returns the `let`, `sel(true)(3)` | refused | `s 4` |
| three members | refused | `4 s 6` |
| loop re-pointing the binding | refused | `1 s s` |
| closure capturing the binding | refused | `s 4` |
| `is` narrowing of the result | refused | `s! 5` |
| generic members (`idg`, `one`) | refused | `s 1` |
| `const g = if c { str } else { inc }` | refused | `s 4` |
| D9003 / D9008 (`inc0`, `half`) | refused | `1.5` |
| members agree, list element, `sel` returns an `if` | runs | unchanged |
| `f(3) + 1`; `const r: i32 = f(3)` | refused | refused, naming `i32 \| string` |
| value seed later written with a void function (B2) | refused | refused |
| handed to an open parameter (D13966's witness) | refused | refused — D16009 |
| lambdas | refused | refused — D16090 |
| list element handed to an open parameter | invalid module | invalid module — D16091, filed |

**Fixtures.** Six error cells that pinned the refusal now run and are renamed without `error-`. The
two lambda cells keep their remaining refusal, and the generic cell drops its direct-call line.
`written-let-of-hole-fns-results-differ-dispatches.vl` and `…-join-misused.vl` are new.
