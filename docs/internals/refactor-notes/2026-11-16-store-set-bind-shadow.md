# One storage decider: the check-time set-binding shadow, 2026-11-16

Lane STORE. This follows step 1 (`2026-11-16-store-fntag-redecide-step1.md`). The coordinator ruled
that `fnTagRedecide` goes before L2 S3, by having the check produce the per-call set-binding fact
the elaboration's mint notes give today, built as the first slice of S3's solver. This PR is the
shadow: the producer, and a diff against the elaboration. No decision reads it, and no program's
wasm moves.

## The record

Proposed to lane L2-S2 so S3 can adopt it unchanged.

```vl
// Per (call, un-annotated parameter of a declared callee) a function set reaches: the call's
// instantiation of that parameter's BK_ARROW bounds, storage-free.
SetBind = { call, fn, param, sets: i32[], fromFn, fromParam }
// A declaration hands back its parameter: every value it returns reads it.
HandBack = { fn, param }
```

- `fromFn`/`fromParam` name the caller's parameter that a handed-on argument reads. That is S3's
  `BK_INST`. They are -1 when the argument carries its set itself.
- A call through a set inside a body is not stored. It is the join of a `SetBind` with the
  `BK_ARROW` sites on that parameter.
- Storage, member result types and instance keys are out of the record.

## Producer, v1

`check_set_bind.vl`, `setBindBuild`:
- reads the check's hand rows (`fnParamHandNote`: callee, parameter, the argument's set, the
  enclosing declaration, the argument node);
- closes the handed-on rows to a fixpoint;
- notes a hand-back where every returned value reads one parameter that a set reaches.

It runs once per program, from the `$VL_IFACES` dump, and is on the scan allow-list
(`compiler/lint.vl`).

## The diff

`$VL_IFACES` prints `setbind calls both/check/elab handback both/check/elab rows N`.
- Calls are keyed `(original declaration, parameter, set)` for a call through a parameter, else
  `(call, set)`.
- A minted node is mapped to its checked source through `nodeSrc` and `declOrigOf`.

Population: 6,477 `@run` programs at master `05297d75`. 603 programs print a line.

| table | both | check only | elaboration only |
|---|---|---|---|
| calls through a set (facts) | 907 | 28 | 1,091 |
| calls (programs with any) | 289 | 17 | 340 |
| hand-backs (facts) | 45 | 53 | 19 |
| hand-backs (programs) | 29 | 48 | 12 |

The elaboration-only call facts, by the callee shape of the call (scratch classifier, not shipped):

| shape | facts | programs |
|---|---|---|
| a named function's hole parameter, the function referenced from a list literal (called through an element) | ~290 | ~100 |
| a named function's hole parameter, no checked reference (a minted copy `nodeSrc` does not map) | 169 | 41 |
| an element callee (`xs[i](…)`) | 184 | 79 |
| a field callee (`r.f(…)`) | 109 | 41 |
| a local binding callee (alias) | 102 | 32 |
| a declared function callee | 74 | 32 |
| an annotated parameter | 31 | 15 |
| a named function's hole parameter, referenced as a method's callback or otherwise | ~110 | ~40 |

These are the sources the producer gains, one per PR, before the decision switches class by class.
- The hand-back side over-approximates (53 check-only), because v1 does not require an instance
  to bind the parameter to a function.
- The 28 check-only call facts are sets the hand rows name that no instance calls through. Each is
  examined before the call class switches.

## Gates

- wasm and output byte-identical on all 6,477 programs against a same-commit fixpoint master seed.
- The refreshed seed is a fixpoint.
