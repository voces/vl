# `monoHoleBinding` is deleted (2026-11-08)

Step 2, after [the slot write and the generic hand](2026-11-08-listed-generic-slot-write-generic-hand.md)
(#6875). Base is master `b7ffffb9`, and both seeds are fixpoints.

## Its last reader

`monoMakeInstanceGo` called `monoHoleBinding` only where neither the call key
(`elabCallKeyBinding`) nor a specialization (`elabSpecHoleBind`) bound the instance's holes. On the
base fixpoint, the `ckey` shadow (`scripts/id-shadow/run.sh --rows`, 23,711 programs) puts that at
**12 builds over 7 programs**:

| builds | program | class |
|---|---|---|
| 1 | D12880 | root lambda, value build |
| 2 | D12940 | root lambda, value build |
| 3 | `hole-fn-into-pushed-lambda-bound-by-every-call` | root lambda, value build |
| 1 | `hole-fn-list-capturing-lambda-member-at-handed-result` | root lambda, value build |
| 3 | `hole-lambda-on-hole-fn-list-capturing-hole-param` | root lambda, value build |
| 1 | `lambda-bundle-through-hole-param-at-several-signatures` | root lambda, value build |
| 1 | D15331 | root named, call build (a loud emit reject either way) |

With the call removed, the six programs that run **build byte-identical**, and D15331 refuses with
the same message. Nothing that reaches the module read the binding. In each of the six, the
lambda's hole takes a function value, and its pin is a bundle.

## Measured

| | base | candidate |
|---|---|---|
| `hole-mono` builds | 12 | **0** (the 12 read `hole-none`: 155 → 167) |
| sweep, 23,711 programs | | 23,711 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 new traps |
| D15010, `listed-hole-fn-escaping-list` | runs | runs |
| `generic-fn-listed-{pushed,slot-written}-handed-hole-param` | 19 / 19 of 23 | 19 / 19 |
| `hole-lambda-listed-{pushed,slot-written}-handed-hole-param` | 12 / 12 of 23 | 12 / 12 |
| seed (fixpoint) | 6,576,792 | 6,576,037 (−755) |
| pin-helper budget (`emit_mono.vl`) | 927 | 926 |

## What stands

* **`classifier-census --callers` reads `pre-only 0 · both 5`, not 0.** All five go through one
  rung: `monoArgTyNameCascade`'s function-value read calls `fnSigKeyOf` during mono (19 calls),
  and `cloRetKindOf`, `cloRetValKind`, `blockTailIsClosure` and `exprIsClosureNoLocal` are its
  callees. The pin's callers fall to that rung where the call key leaves the argument open
  ([earlier note](2026-11-08-call-key-pin-matched-instance.md), item 3). So the hole binding is
  the elaboration's alone, but the pin cascade still classifies before mono finishes.
* D15568 (`xs[0] = b`): `elabListParamSource` keeps a list as ONE parameter's holder, and the tag
  plan types the slots with that parameter's set. Admitting a second parameter's write needs the
  holder typed at the union of both sets, not a widening of the syntactic test. A write of `b` with
  a set other than `a`'s would otherwise build at `a`'s set alone.
* A lambda handed to a generic callee (`take((x) => x)` with `use<T>(ys: T[])`) refuses with
  `cannot infer a type for parameter x` in `pinHoleLambdaVals` (check_calls): the lambda is called
  at two types, and `genFnHoleCallInsts` returns fewer than two instances once the list goes
  through `T[]`. That decision is the `genFnHole*` family's per-call binding.
* `const xs = [a, b]` with both called is a check reject: `called value is not a function (_ | _)`.
* D15011, D14843, D15105, D15331 and the matrices' other cells are unchanged.
