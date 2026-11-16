# One storage decider: set-binding sources, round 1, 2026-11-16

Lane STORE. This builds on the shadow (`2026-11-16-store-set-bind-shadow.md`). The producer in
`check_set_bind.vl` gains the delivery shapes the shadow's diff named. It is still a shadow: no
decision reads it, and no program's wasm moves.

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
the decision, each one is named and either removed or shown harmless. Two families account for the
rise:
- **Holders written after their literal.** In `closures/hole-fn-list-written-then-called.vl` and
  `closures/generic-fn-list-written-then-called.vl`, `a[0] = dbl` or `put(a)` widens the list. The
  producer reads the literal's set and ignores the write. These are two of the four programs whose
  check tag the late decision drops (#8472), so the census already points at the writes.
- **Record and alias paths whose instance the elaboration does not note.** For example,
  `functions/named-function-in-record-beside-hole-record.vl`: `call0({ f: g }, 2.5)` beside
  `call0({ f: dbl }, 4)`.

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
