# Step 7: `dispatchRewrite`'s UFCS test reads the checker, not the struct row

Measured 2026-11-08 on master `5a10f929`, 4-core box, over the sweep population (23,613
programs). The pass-keyed census is the scratch probe of
`2026-11-07-step7-premono-askers.md` (each classifier entry keyed by the emit pass running it).

## What the pass asked

With the first `computeRetInference` run gone (#6741), `dispatchRewrite` made 296,879 of the
443,222 pre-monomorphize classifier asks. Almost all of them came from one call:
`drwWalkMemberCall`'s `structIndexOfExpr(callee.memObj, ctx)`, the receiver's struct row, which
reaches `capturedKindOf`, `globalReadStructIndex`, `capturedStructIndex` and the cell-kind
ladders below them. It decided whether `o.f(args)` is a UFCS call to a `self`-function. Before
mono that is a template's receiver, so the row is a per-instance fact asked at the wrong place.

The checker already banks both halves of the answer: the receiver's checked field
(`tyFieldTyOf`, D1070) and the rung it resolved the call through (`memberCallRungOf`:
built-in, `self`-function, or per-instance for a type-parameter receiver). The new test is

    no checked field, not the built-in rung, and (the self-function rung or a callee that is
    not a closure value) and it dispatches  →  UFCS, or per-instance at a type parameter

## Trials, each a fixpoint seed swept against base

| trial | sweep vs base |
| --- | --- |
| self-function rung → UFCS at once | 23,594 same, 14 `runs → not-runs`, 12 new traps |
| the per-instance test also guards the self-function rung | 23,613 same |

The 14 lost in the first trial were all template or hole-parameter receivers
(`tests/cases/generics/mixed-member-dispatch-per-instance.vl`, `modules/overload-per-instance`,
D1002, D1063, D1430, ...). The checker banks the self-function rung on the template, and only
the per-instance mark sends each instance back to answer for itself.

## After (census taken with #6741 applied)

| pass | pre asks before | after |
| --- | --- | --- |
| `dispatchRewrite` | 296,879 | 8,366 |
| `collectA` | 136,501 | 136,501 |
| `monomorphize` (during) | 8,614 | 8,938 |
| other | 1,228 | 1,229 |

Classifiers asked before mono go from 86 to 77. The nine that became post-only (pre-mono asks
before): `listFitArmTestIn` 609, `letIsStruct` 191, `arrLitObjRowTy` 110, `armIsNulNone` 40,
`refListElemIsRow` 14, `letDeclIsClosureNoLocal` 4, `mfResultSlotOf` 3, `cloRetKeySuffix` 2,
`bindingIsLitAtom` 1.

## Parked: the pre-mono `collectA` run

`collectA` makes 136,501 of the remaining pre-mono asks, and its four pre-only classifiers are
`arrLitIsF32` (25,429), `arrNewNamedKind`, `letInitNarrowedAtomKind` and
`compositionMapReadSlot`. With the pass not run, 23,612 of 23,613 programs are the same. The
one that moves is `tests/cases/maps/map-value-union-struct-map-field.vl` (`runs` → `emitProgram:
map value type has no interned slot`). Minimised:

    function go() {
      const v: {f: {[string]: {f: (i32) => string}}} = { f: Map() }
      const t1 = v.f["k"]
      if t1 != null { print(t1.f(1)) }
    }
    go()

The slot missing is the map value `{f:(i32)=>string}`. The same program at module scope runs.
So `collectA#2` alone does not intern the mv slot of a map held in a record field when it is
read inside a function; the pre-mono run had interned it. Until that gap is closed, the pre-mono
run stays.

## Proof

| check | result |
| --- | --- |
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,494,382 → 6,494,290 (−92), both fixpoints |
| `scripts/sweep.vl` diff, 23,613 cells | 23,613 same, 0 bytes-only, 0 movers, 0 `runs → not-runs` |
