# IR coverage step: a short-circuit push onto a held list, 2026-11-20

Lane F2, the second of the push family, stacked on #9221. Measured on fixpoint seeds of this branch
and master `47e3dc38c` plus #9221.

## Why this class

`push short-circuit operand` held 41 self-compile functions on its own. These are pushes such as
`out.push(p && q)` whose value is a valued `if`.

- **Why it was refused.** The builder refused every such push with `ifBelowLead`, because a staged
  receiver is written ahead of the value.
- **Why most need no refusal.** A receiver held in its own local is never written ahead of the
  value. Legacy and `lowerPush` both read it by index after the value (`listOpRecvHeld` ≥ 0, then
  `irLSkip`, then `pushAppendTail`'s `local.get`).

## What landed

- **The pure plan (legacy, byte-identical).** `listOpRecvHeld` is split.
  - `listOpRecvHeldPlan` returns ≥0 for held, -1 for staged, -3 for the fit or capture stand-in
    refusal, and -4 for not a list local. It writes nothing and records no failure.
  - `listOpRecvHeld` raises the same two messages at -3 and -4, at the same point: right after the
    plan returns, with nothing written ahead of them.
  - Neither message is reached by any test today. `LIST_FIT_PUSH_MSG`'s witnesses (D4934, D4961)
    are closed, and the not-a-list-local row (D1965) has no live repro. The order argument rests on
    the plan writing nothing.
- **The builder's contract.** `pushRecvHeldAtRest` takes a receiver as held only where no input of
  the plan is emit-time state:

  | guard | what it excludes |
  | --- | --- |
  | a declared local or a parameter | the scope stack and a lifted closure's write slots |
  | an unnarrowed read | the `is K[]` fit regions and the narrowed union |
  | an uncaptured name | the capture stand-in |

  A held receiver skips the `ifBelowLead` refusal. Every other receiver keeps it.
- **The lead node is deferred.** A staged receiver (a global or a captured list) still misses
  `push short-circuit operand`. That leaves 2 functions in the self-compile and none in the corpus,
  where the blocker census lists no function the class holds. The lead node waits for a population
  that justifies it.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered | 17,412 | 17,454 |
| corpus functions covered (45,678) | 39,266 | 39,266 |

- **Shadow mode 1:** everything covered is verified and matched.
- **Mode-3 self-compile:** byte-identical.
- **Legacy bytes:**
  - `ir-identity.sh --names` against #9221's seed: identical 9,037, differ 0, self-compile
    identical.
  - `--cases`: differ 0.
  - Per-file `tests/cases` A/B against master's seed: same 7,231, fail under both 67, differ 0.
- **Witnesses, in `vl_ir_shadow_test`:**
  - `out.push(p && q)` and `out.push(p && (q || r))` on a parameter list are covered and matched.
  - The same push onto a global is a named miss.
  - `xs.push(p && (xs = other).length == 0)` on a held local is covered and matched, and prints 11:
    the push lands on the reassigned list, as legacy's does.
