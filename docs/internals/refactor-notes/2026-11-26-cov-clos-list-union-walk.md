# IR: a union-of-lists walk with one body (2026-11-26, lane COV-CLOS)

## Defect

A `for` over a union of lists that a pin leaves as a box (a hole parameter called at two list
types, D16897) is legacy's `emitListUnionFor`. Legacy tests the box's tag once, then writes a whole
walk per arm, the body lowered under each. The IR had no such walk, so every function holding
one missed (`for in list union`).

## Fix (coordinator ruling: one body, not one per arm)

The IR writes one walk:
1. The box goes into the walk's list slot, and the cursor starts at 0.
2. One loop's bound is the held list's length (`luForLenChain`). Its element is read off the arm
   the box holds and boxed into the element union (`luForElemChain`, over legacy's own
   `emitListUnionForElem`).
3. The cursor is stepped before the body, as legacy's union walk steps it, so `continue` needs no
   inner block. The body is built once.

Each chain is a tag test per arm, the last arm untested, since a checked walk's box holds one of
them. A walk nested over the same binding re-tests the tag rather than taking the known arm.
`SForIn` gains `xfLu`. The verifier takes such a walk of a box into a variable of the element
union's box, or of its boxed `T | null` (the null one more tag).

The plan legacy built inline is now `luForBoxPlanOf` (`wasmEmit.vl`), which legacy and the IR
share. `luForBoxArms` selects the walks whose element union is a box; `luForElemTyOf` wraps
`luElemTy`, so `ir_build` imports no checker symbol.

## Stack margin

The walk's rule sits in its own verifier helper (`luWalkElemRep`). Written inline in the
verifier's `SForIn` arm, its locals widened the recursive statement checker's frame. The
deep-nesting margin case (`VL_DEEP_MARGIN_INNER=1`, 10 KB steps) then needed 970 KB against
base's 930 KB, which reds `ci-native`. With the helper it passes at 930 KB, the same as base.

## Behaviour parity, and the claims-off ripple

The bytes differ from legacy's per-arm form by design (#10171's parity bar). Every changed program
prints what base prints, with claims on and with claims off. The refactor in `wasmEmit.vl` keeps
legacy byte for byte: all 9,065 `tests/cases` programs, built with claims off by base and by head,
differ in **0** bytes.

## Census: base (master) → head, all 11,500 census files

| | base | head |
|---|---:|---:|
| claimed units | 114,720 | 114,735 |
| lost | — | 0 |
| `for in list union` | 19 | 0 |
| `for in list union flat` | 0 | 4 |

15 units are gained:
- `g` and `idx` in `generics/for-in-over-join-of-two-hole-params.vl`
- `deep`, `rebind` and `viaClosure` in `unions/list-union-for-nested-known-arm.vl`
- ten in `unions/list-union-for-through-hole.vl`

The four now named `for in list union flat` are `arrays/is-list-arm-for-at-numeric-literal-set.vl`
(`go_u8`, `go_i64`, `go_f64` and its start body). In those walks each element converts to a scalar
under `is K[]` (`emitListUnionForFlat`), a different element read. That is the follow-up.

## Positions

`tests/cases/unions/list-union-walk-one-body-positions.vl` covers argument, record field, list
element, a `return` from inside the walk, the index, `continue`, `break`, and a walk nested over
the same binding. Base misses `for in list union` twice; head claims every function, and the
output is the same with claims on, with claims off and on base.
