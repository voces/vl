# IR coverage: capture recover, capture list test, closure env capture, and a narrowed read seated at its cell (2026-11-23, lane IR-N7)

| Mechanism | Change | blocker class, functions (alone), before → after |
|---|---|---|
| narrowed read | a `print` on its atom or `K \| null` arm, and a `??` whose arm writes its left operand alone (`pinNonNull`, `retypedDead`, `fieldFlat`, `popElem`), take their operand at its cell (`exprAt`'s `cell`), as legacy streams the id the operand is held at (`emitStashAtomId`) and writes the `??` as `emitExpr(lhsIx)` | corpus 8 → 1; tests/cases 19 → 18 (+1 `narrowed read + string atom part route` moves on to `string atom part route`) |
| capture list test | an `is K[]`-tested capture misses only where legacy's own read stands in an empty `K[]` (`listFitCaptureStandIn`, now exported), and otherwise reads as any capture does | tests/cases 13 → 0; corpus 3 → 0 |
| capture recover | a `string \| null` capture read whose type bears no null is its slot at the plain string: the env field, whose read `emitCapturedRead` already ends with `ref.as_non_null`, or a lifted function's own parameter, recovered once (`RRecover`) | tests/cases 7 → 0; corpus 6 → 0 |
| closure env capture | an environment capture whose binding holds the closure apart from the slot's rep only in its holes (`holeRetagNoted`) is that struct, retagged (`RRetag`) | tests/cases 5 → 2; corpus 6 → 0 |

A general decode of an atom cell read at a string (`atomToStr` at the read) was tried and
dropped: the one function it covered mismatched, its consumer not decoding there.

## Measured

Fixpoint seeds: master fa7f0009e and the batch head 31b8dcb56.
- tests/cases functions with no blocker: 79,349 → 79,373; covered = verified = matched.
- Corpus functions with no blocker: 45,487 → 45,509; covered = verified = matched.
- `ir-only-census`: programs fully IR-only, 5,900 of 7,161 on both sides (each cleared function's
  program misses another).
- Self-compile 20,402, unchanged and identical under `--names`. L2 fuel +0.02% per PR; late demands
  9 / 9, late tag rows 307 / 307.
- A/B over tests/cases: same 7,460, differ 0. `--cases` differ 0; claimless differ 0.

Left: `closure env capture` 2 (a capture with no rep, a captured `i32` with no binding variable);
`narrowed read` 18 on tests/cases (a box read narrowed to `T | null` under `??`, D3172; record and
list reads seated at another row; a closure read at `i32`; a string read at an atom).

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `printArmOf` (shared) | `emitCallCorePrint`'s `atom` and `nulAtom` arms |
| `coalArmOf` (shared) | `emitCoalesceGo`'s left-operand-alone arms |
| `listFitCaptureStandIn` (shared, exported) | `emitIdentNode`'s capture stand-in |
| `captureValKind`, `nulStrReadRecovers` (shared) | `emitCapturedReadRecover` |
| `holeRetagNoted` (existing) | `emitClosureEnvOf`'s capture read |

## Legacy tails the IR calls

`emitCapturedRead` (existing): the env read's lowering, which writes the recover.
