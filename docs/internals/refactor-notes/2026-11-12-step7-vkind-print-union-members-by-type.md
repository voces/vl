# Step 7, lane H: the print plan's union members by type, 2026-11-12

`printUnionPlanCode` (`emit_fn_scans`) plans a print over a value-union box. It found the box's
members in one of two ways:

- the member set of the box type's row (`msSetOfTy(bty)`);
- when no row keys that type, the union's name (`unionMemberAtomsOf(unionNameOfExpr(…))`).

Its `null` test also passed the name (`unionSetHasNullTy(nm, bty)`). The slice came from lane
G; lane I measured that deleting the name reads loses 24 programs (13 emit rejects and 11
compiler traps).

## The 24, by probe

A scratch compiler ran over 24,070 programs, with a control tag on each. The name fallback
answered in exactly lane I's 24 programs. In every one, no row keys the box type. In 1,790
other programs the row's set answers, and the name gives the same atoms. The `null` test never
needed the name: passing `""` gave the same answer at every reach.

| member source tried in place of the name | programs it answers, same atoms in the same order |
| --- | --- |
| the type's own members (`msSetOfTyAny(bty)`) | 21 |
| for `m["k"] ?? "N"` typed `string`: the left operand's box (`string \| i32 \| null`, the map slot's storage) | 1 |
| none: every type source gives the open hole (D16060) | 2 |

The `??` rung applies only when the result type has fewer than two members. A first version
took the left operand's box for every `??`, and the sweep showed it wrong. For
`(q ?? b)` with `q: i32 | null` and `b: f64 | null`, the result is boxed at its own type,
`i32 | f64 | null`. The three `nj2_co__*__print__op` cells moved output (`6.75` became `null`).

## The change

- The members come from the row's set first. If no row keys the type, they come from
  `printUnionStoreSetOf`: the type's own members when it is a union, else, for a `??`, the
  left operand's box.
- The name read is left only below both, as D16060's floor.
- The `null` test reads `msSetOfTy(bty)`.
- The kinds and member types still read the row's set, unchanged.

**Measurement:**
- **Floor reach**, with a tagged build over the 24 programs: D15628's witness and
  `unions/shared-mixed-field-read-through-hole-param.vl`, nothing else.
- **Sweep** (`sweep.vl diff`, master `a16e7550` against this, fixpoint seeds on both sides):
  24,202 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
  traps.
