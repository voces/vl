# Step 7: the arena-type list ladders read the descriptor, 2026-11-10

This is conversion 2 of `2026-11-10-step7-vkind-census.md` §4. Base is master `d5340fbe` (#7093). Its
compiler is `61d7d912`'s, with a fixpoint seed of 6,600,459 bytes.

## What changed

Three functions in `emit_struct_order.vl` decided an array type's scalar-list `VKind` from the arena
type, outside the descriptor:

- `tyPrimLeafListKind`: a `TyPrim` element;
- `tyScalarBackedListKind`: a literal-union element, an i32-sentinel nullable element, and
  `(string | null)`;
- `tyScalarListKind`: the two above, plus `null[]`.

They duplicated `repOfArray`'s and `repOfNulElemArray`'s arms.

`tyScalarListKind` is now one `repOfTy(ty)` read. It answers `rdKind` when that is one of the six
scalar list kinds (`list`, `u8list`, `i64list`, `f32list`, `f64list`, `strlist`). It answers `null`
for a ref list, a type that is not an array, or a type the descriptor leaves uncovered. A `_`-less
`match` names the 26 kinds it declines.

`tyPrimLeafListKind` and `tyScalarBackedListKind` are deleted. Their two other readers take
`tyScalarListKind`:

- `tyListRepKind`, behind `emptyArrHoleKind` and `emptyArrUnionArmKind`;
- `emitListCopyTail`.

That removes three VKind producers from the census's arena-type family. The fourth, `tyListRepKind`,
keeps only its ref-list rung, which reads the caller's row.

## Where the answers could move

The descriptor answers more than the ladders did. Three spellings differ:

| spelling | descriptor | old ladders |
| --- | --- | --- |
| tagged-function element | `list` | `null` |
| single numeric-literal element (`1[]`) | its base scalar's list | `null` |
| `null[]` in `tyListRepKind` and `emitListCopyTail` | `list` | `null` |

`tyScalarListKind` already said `list` for `null[]`. On the `tests/cases` population none of the
three moves a byte. The CI sweep (`sweep` label) grades the distilled and inventory populations.

## Proof

- **Seed:** 6,600,459 → 6,600,149 bytes (−310). Two refreshes are byte-identical.
- **`tests/cases`:** `sweep.vl -- record --population cases`, base against candidate, finds 7,421 of
  7,421 the same: 0 module-hash movers, 0 output movers and 0 `runs → not-runs`.
- **rep-fuzz:** exact. Also green: lint-self, seed-size, late-demands (6), the dead-export,
  render-parse and pin-helper budgets, cases_wasm, the inventory tests,
  `check-filed-witnesses --strict`, scaling-shape, probe-rollback and plumb-shape-cost.
