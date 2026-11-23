# IR: a type-parameter operand's exact numeric cast at its pin, 2026-11-21

Stacked on `2026-11-21-ir-as-exact-opt`. `asCastArmOf`'s `hole*` arms cast an operand whose type
is a type parameter. The cast goes by the instance's pin:
- `holeExact`: `as!` at a pin where the cast can fail;
- `holeOpt`: `as?`, which is `N | null` at every pin (D2754);
- `holeMiss`: a pin that is no number.

Together they were 25 tests/cases functions, every one a named `expression as` miss.

## The change

- **`holeExact`.** `numCastKindOf` and `numCastTail` name the arm at `as!`, from the pinned source
  `asExprHolePinSrc`, which legacy's `emitNumExactCastFrom` already reads. The IR builds it as
  `RNumCast`, as it builds the exact `as!`.
- **`holeOpt`.** Only its failing branch is the exact cast. `holeOptPinTy` and `holeOptExactSrc`
  lift the pin and that branch's source out of `emitHoleNumAsOpt`, which now reads them too, so
  there is one decision. `numCastKindOf` and `numCastTail` name the branch from them.
- **Still named misses.** `holeOpt`'s other branches write no operand (a pin that is no number) or
  box a plain cast, and `holeMiss` drops its operand.

## Readings (merge-base `6716810b0`, fixpoint seeds on both sides; this PR's head includes #9449's change below it)

| reading | base | this change |
| --- | ---: | ---: |
| tests/cases armed shadow covered / matched | 65,130 / 65,129 | 65,164 / 65,163 (same single fail row) |
| the 12 tests/cases files with a `hole*` miss, covered (= matched) | 21 | 37 |
| corpus / self-compile functions with no blocker | 44,588 / 19,550 | unchanged (no `as` site there) |
| L2 self-compile fuel | 107,660,212,814 | 107,676,759,650 (+0.016%) |

Legacy lines deleted: 0. Moved to `@ir`: 0.
