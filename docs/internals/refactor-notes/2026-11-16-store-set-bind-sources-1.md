# One storage decider: set-binding sources, round 1, 2026-11-16

Lane STORE. This builds on the shadow (`2026-11-16-store-set-bind-shadow.md`). The producer in
`check_set_bind.vl` gains the delivery shapes the shadow's diff named. It is still a shadow: no
decision reads it, and no program's wasm moves.

## The record, settled

The coordinator decided this on 2026-11-16 (recorded in `l2-inferred-interfaces-design.md` §4.3).
L2-S2 did not answer the shape question.
- **HandBack is a `Bound` kind, `BND_HANDBACK`, in the owner's `Iface`.** `on` is the parameter's
  type, `a` its position, `site` the body.
- **SetBind is call-keyed solver output beside `InstReq`, never in an `Iface`.** It has one row per
  set: `on`, `a` the position, `b` the set, `c` the forwarded-from parameter, `site` the call, `fn`
  the callee.
  - The shadow's `fromFn` is gone: it is the declaration enclosing `site`.
  - An `Iface` must not depend on its callers.
- The producer still holds private arrays. It moves to these records in the first PR that switches
  a decision class.

## Sources added

| source | what it adds |
|---|---|
| calls through a `const` list literal's element, `fs[i](…)` | each element declaration's parameters take the call's arguments |
| the same through `for f in fs { f(…) }` over a list literal or a `const` of one | as above |
| a callee read through a path from a parameter: `[i]`, `.f`, a local `const` alias | the set at the end of the path, in each argument type handed to that parameter (types are closed beside sets) |
| a call through a parameter | its arguments go to each member of each set reaching the parameter (a dynamic edge in the fixpoint) |
| a call of a local `const` bound to a lambda | the lambda's parameters take the call's arguments |
| hand-backs: the elaboration's own syntactic test, moved to `check_hand_back.vl` | a declaration's handed-back parameter, where some call binds it to a function |
| list methods with an element callback (`map`, `filter`, `forEach`, `find`, `findIndex`, `some`, `every`) | the callback's first parameter takes the receiver's element set, from its own type or a parameter path's argument types |

## Measured

The population is 6,477 `@run` programs. Each cell is facts / programs with any. Each row is the
diff after that source was added, cumulative.

| after | both | check only | elaboration only |
|---|---|---|---|
| shadow (#8507) | 907 / 289 | 28 / 17 | 1,091 / 340 |
| list-element calls | 973 / 318 | 28 / 17 | 1,025 / 318 |
| `for` variables | 1,156 / 375 | 28 / 17 | 842 / 266 |
| path callees | 1,397 / 451 | 48 / 27 | 601 / 206 |
| calls into members | 1,427 / 451 | 48 / 27 | 571 / 196 |
| `const` lambdas, callbacks | 1,537 / 467 | 76 / 38 | 461 / 182 |
| lambda test fixed (`fnNameIsLambda`) | 1,570 / 477 | 76 / 38 | 428 / 173 |
| check-minted `$` parameters excluded | 1,570 / 477 | 63 / 34 | 428 / 173 |

**Hand-backs.** These are now exact: 64 agree, 0 check only, 0 elaboration only. They were 45 / 53 / 19
at the shadow.
- The test is the elaboration's own. `handBackIx`, `handBackHoleIx`, `handBackShared` and their
  helpers moved from `emit_elab.vl` to `check_hand_back.vl` unchanged. The elaboration imports them
  from there, so one test serves both.
- The producer adds the per-call condition: some call binds the parameter to a function, either a
  set reaching it or an argument of function type.
- An inline lambda handed to a list method is excluded. It runs inside the method's loop, no
  instance of it exists, and no call takes its value back.

**Check-only facts.** These are where the producer over-approximates. Before a call class switches
the decision, each one is named and either removed or shown harmless (the coordinator's bar). Two
causes are already removed:
- **Minted adapter parameters.** A `$`-named parameter (`$fv`, `$e…`) belongs to an adapter the
  check built (`fvaAdapt`, a list copy's element map). It holds the source's closure, not a set.
  This removed 13 facts in 4 programs and lost no agreeing fact.
- **Inline callback hand-backs** (the hand-back side, above).

The 63 that remain, by family (`$VL_IFACES` with a scratch key printer):

| family | facts | programs | example |
|---|---|---|---|
| an inline list-method callback over a list written after its literal, or whose members' results differ | 15 | 7 | `closures/hole-fn-list-written-then-called.vl` (one of the four census drops) |
| a named function whose parameter a set of generic members reaches, at a shared or seeded type parameter | 29 | 18 | `closures/shared-type-param-handed-generic-and-hole-function.vl`, `generics/nested-capture-argument-hop.vl` |
| a record field or alias path the elaboration does not instance | 19 | 9 | `functions/named-function-record-beside-hole-handed-two-functions.vl` |

What the three share: the elaboration notes a fact only where the instance types the callee at the
set (`elabMintFactAt`: `fnTagSetOfTy` of the instance's node type, closed arguments, each member's
result found). A write that widens the holder, a type parameter the instance binds to a closure,
and a record rep built at a closure all leave the instance without the set. The producer reads the
call-site set and so misses all three. The next round reads them: holder writes (`cwBindingWrittenValues`), and the
type-parameter binding at the call (`callBind` rows).

**What is left elaboration-only**, by callee shape (scratch classifier):

| shape | facts | programs |
|---|---|---|
| a declared function as callee (nested or per-instance) | 74 | 32 |
| an element callee off a non-parameter root | 67 | 34 |
| a named function's hole parameter with no checked reference (minted copy) | 54 | 18 |
| a field callee off a non-parameter root | 45 | 22 |
| a local alias of a non-parameter | 42 | 17 |
| a hole parameter referenced otherwise (`o`, `co`, `cl`, `lo`) | ~110 | ~45 |
| an annotated parameter | 31 | 15 |
| the parameter known, a different set id | 25 | 16 |

## Gates

- wasm and output byte-identical on all 6,477 programs against the shadow's seed.
- The refreshed seed is a fixpoint.
