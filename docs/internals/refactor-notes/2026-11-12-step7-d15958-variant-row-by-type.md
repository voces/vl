# Step 7, L6: D15958 closed, and `typeDeclMintsRow` by type, 2026-11-12

D15958 (filed with #7626) was the floor behind `typeDeclMintsRow` and `collectNestedFieldShapes`'
`ownsRow`. Both asked `variantIndexOf(s.tdName)`: whether a record declaration is itself a union
arm. Switching them to the type (`exactArmRowOfTy` of the declaration's type) cost D36's witness
when measured: its twin `Dot` stops minting a struct row, and the arm-shaped literal it relied on
then had no row. Measured on master `b5598a43`, 24,196 programs.

## The mechanism

A debug build at the refusal printed what the read of `g()[0].r` saw for D15958's witness:

| question | answer |
| --- | --- |
| `exprRefArray(g())`, the call result is a ref list | yes, slot 0 |
| the element's type, `exactArmRowOfTy` of it | `Circle`'s, variant row 0 |
| `rlElemVariantRow(0)` | **-1** |
| `exprVariantIndex(g()[0])` | -1 |
| `sDeclared` (any struct row) | false |

`rlElemVariantRow` asks `tyIsVariantMember`, which tests the checker's member set by type
**index**. The literal `{ r: 7 }` has its own index, `tySame` to `Circle`'s but not equal to it. So
the element was no arm, there was no struct row either, and the read refused.

## The change

- **`rlElemVariantRow`:** a record element type that is not in the member set, has no struct row
  of its own (`structRowOfRecordTy < 0`) and has an arm's shape answers that arm's row
  (`exactArmRowOfTy`). Under structural typing it is that arm's type. A record with its own struct
  row keeps it.
- **`typeDeclMintsRow`, `ownsRow`:** `declIsVariantArm(s)`, which is `exactArmRowOfTy` of the
  declaration's type. A record declaration of an arm's type is stored at the arm's row and mints no
  struct row of its own. `variantIndexOf` goes from 18 to 16 code sites.

## Grading

Each half was switched alone, then both together, and every sweep was diffed against the fixpoint
seed of the tree beneath it.

| change | bytes-only | output movers | runs → not-runs |
| --- | --- | --- | --- |
| `rlElemVariantRow` alone | 0 | 1: D15958 emit reject → runs | 0 |
| plus `typeDeclMintsRow` / `ownsRow` | 86 | 1: D15958 emit reject → runs | **0**: D36 keeps running |

The 86 bytes-only movers are twin declarations now stored at their arm's row: 13 cases, 69
distilled cells and 4 inventory witnesses (D351, D48, D627, D93). Every one prints what it printed
before.

## Proof

- Refresh ×2 is a fixpoint at 6,716,409 bytes, against master's 6,716,345.
- Sweep against master's fixpoint seed: 24,109 same, 86 bytes-only movers, 1 output mover
  (D15958 → runs), 0 `runs → not-runs`, 0 new traps.
- `rep-fuzz-check` exact. lint-self is clean, and `regress.vl` lost no runs.
- Witnesses `--strict`: 4,860 as filed, D15958 and D36 both runs. The inventory row tests pass.
- Late demands 8, seed +1.9%, render-parse 9 and 3, dead exports 0, and plumb-shape cost passes.

## The `#anon` handle rungs: a contract (coordinator ruling, 2026-11-12)

Three `structIndexByName` sites read an `#anonN` handle back to its row:

- `retStructRowIndex`'s `#anon` rung (`emit_nullable_rets`);
- `anonPinRow`, behind `anonHandleTyIx` (`emit_shape_rows`, mono's anonymous pins, D681);
- `anonRowTyOfName`, behind `rlInternNameTy`'s untyped `RLK_STRUCT` mint (`emit_union_atoms`).

**Contract:** an `#anonN` handle is not a type spelling. It is an object literal's row id, rendered
as text because pins and ref-list names carry strings. Reading it back is a lookup by id, not a
parse. A same-type shape row need not share the literal row's layout: #7414 measured 17 programs
where the two differ (D15646, D2762, `hole-closure-reads-param-field-per-pin`,
`record-is-narrowing-copy-runs`), so the type cannot stand in for the handle. This is the
handle floor lane I's audit passed.

**Exit:** when lane F's D6 carries row indices (`#rowN`) through pins and ref-list names, each
rung becomes a direct index read and leaves `structIndexByName`.
