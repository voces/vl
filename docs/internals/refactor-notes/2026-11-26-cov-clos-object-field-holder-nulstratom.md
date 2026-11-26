# IR: object-field holder and nulStrAtom deliveries (2026-11-26, lane COV-CLOS)

This is part 2 of the object-field family (regen-11). Part 1 is
`2026-11-26-cov-clos-object-field-deliveries.md`. Each mechanism below was ablated apart.

## Mechanism 3: a bundle holder read into a one-closure field (`object field holder`)

Take `const w = { f: u }`, where `u` holds a closure at several signatures (a bundle, stored as a
record of holders). Legacy's `holder` arm writes the holder's record, then the member the field
takes (`emitBundleMemberPick` with `elabStoreMemberOf`). The IR already had that pick for an
annotated binding (`RHolderPick`), but there the member was found from the binding
(`typedHolderMember(hkAt)`). `RHolderPick` now carries the member itself (`hkM`): the binding and
global sites pass `typedHolderMember`, and a record field passes `elabStoreMemberOf`. Lowering is
`bundleMemberPickOf(hkArg, hkM)`, the same call legacy makes.

With claims on, every function and start body of both closure fixtures and the D15326 witness
matches legacy's bytes in shadow (77 of 77 functions twice, 3 of 3 for D15326).

## Mechanism 4: a literal-union atom into a nullable-string field (`object field nulStrAtom`)

Legacy writes the atom's member string (`emitStrValue`). `deliver` already converts an atom
delivered at a nullable string in every other position. The field's refusal is gone wherever the
field's rep is a nullable string (`strNullable`). Both literal-union fixtures match legacy's
bytes, and their `main` functions now claim.

## Census

The population is part 1's 2,266 programs plus all of `tests/cases/{closures,literal-unions}`: 4,547
listed. 3,161 of them produce rows, the same set on both sides; the rest produce none on either
side. Base is the part-1 tree (#10421).

| | base | head |
|---|---:|---:|
| claimed functions | 31,012 | 31,013 |
| unclaimed functions | 146 | 143 |
| claimed start bodies | 3,291 | 3,293 |
| claimed lost | — | 0 |
| `object field holder` | 3 | 0 |

The two literal-union fixtures fell in a batch that produced no rows. Probed one by one on the
same two probes, `main` goes from `fnu | object field nulStrAtom` to claimed in both.

## Positions (`scripts/capability-matrix.vl`, `VL_IR_REQUIRE_CLAIM=1`, before → after)

* `nullable-litunion-niche-into-nullable-string`: struct field init, assign (both faces) and the
  field place go from `object field nulStrAtom` to RUNS.
* `bundle-copy-handed`: struct field init (annotated) goes from `object field holder` to RUNS.
  The other refused cells there are `bundle result pick` and monomorphizer refusals, the same on
  both sides.
* `returned-bundle-record`: unchanged.
* All three matrices: 0 runs → not-runs, 0 silent.

## Still open in the family

* `object field coercion`, record → record (D17402). The field's record is held at the literal's
  own type, whose `r` is the null unit, while the arm row it is stored in boxes `r`. The fix is the
  storage-rep rule at the binding: the local and its literal held at `rowRep(row)`. The scope of
  that change is with the coordinator.
* `object field coercion`, a list re-pointed at a smaller function set (D16916).
