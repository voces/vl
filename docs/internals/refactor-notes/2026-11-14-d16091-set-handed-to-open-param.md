# D16091: a set of functions handed to an open parameter gives the caller its join

**Defect (clause 1).** `ap(fs[0], 3)`, with `fs` holding `inc` and `str`, built an invalid module.
`ap`'s instance dispatched correctly and returned the boxed `i32 | string`, but the caller typed the
call as `i32`, the first member's result, and read the box as an `i32`.

**Mechanism found.** At the call, the hole parameter `g` is bound to the element's set-carrying type
`(_) => _`. `instGenFnHolePins` (`check_demands.vl`) then instances that binding into a closed
`(i32) => i32` that carried no set. So the call's deferred result (`HD_RET` of `g`) fell through to
that signature's `fnRet`. `directHoleBodyRet` then re-typed the call from `ap`'s body, likewise at
one member.

**Change.**

* An instance of a hole-generic binding keeps a set whose members' results differ at its
  parameters (`instKeepsSplitSet` in `instGenFnHolePins`, via `elabFnSetTyMint`). A set whose
  members agree is left as it was: keeping it there re-routed a later plain-function call to the
  set's id-taking instance, which the first sweep's oracle caught
  (`closures/written-let-of-hole-fns-results-agree-delivered.vl`).
* `substHoleTy`'s `HD_RET` arm answers a pinned set with the members' join at the call's own
  arguments (`holeSetPinRetAt`). It falls back to the pinned signature's parameters when the call
  is forwarded through another function's holes (`ap2(g, x) { ap(g, x) }`).
* A call handed a set of several skips `directHoleBodyRet` (`argsCarrySet`).

**Matrix** (master → now):

| program | master | now |
| --- | --- | --- |
| `ap(fs[0], 3)`, both branches | invalid module | `s 4` |
| `ap2` forwarding to `ap` | invalid module | `s 4` |
| literal `[inc, str, dbl]`, `ap(fs[n], 3)` | invalid module | `4 s 6` |
| loop element `for f in [inc, str]` | invalid module | `4 s` |
| result narrowed with `is string` | refused (`is` never matches `i32`) | `s! 5` |
| members agree (`inc`, `dbl`) | `6 4` | `6 4` |
| `ap(fs[0], 3) + 1` | invalid module | refused, `i32 \| string` |
| generic `app<T, R>(g: (x: T) => R, v: T)` | emit reject | unchanged — D16093, filed |
