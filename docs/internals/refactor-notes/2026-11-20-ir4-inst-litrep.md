# IR list literals at legacy's build type (2026-11-20, lane IR4)

This started as the f32 arm's last door miss, `fragment rep` in
`generics/coalesce-type-param-list-default-agrees.vl`. The fix turned out to be general.

## The miss

The IR built a list literal at its own stamp (`exprRepOf(ix)`). Legacy builds it at
`arrLitBuildTyOf(ix, fnIx)`, which picks, in order:
- the held rep;
- a bundle record;
- the stamp read at the instance (`tyAtInstance`).

In `gt<T>(xs: T[] | null) { return xs ?? [1.5] }` under `gt<f32>`, the build type is `f32[]` and
the stamp is `f64[]`. Legacy's arm (`arrLitArmOf`, read off the same build) writes an f32 list,
the IR an f64 one.

## The change

- **`arrayLit`** takes the list rep from `arrLitBuildTyOf` when that is a list rep. It delivers
  each element at that list's element rep and types its temp at the build type, through the new
  `irBLetTempTy`, which `irBLetTemp` now delegates to.
- **The verifier's `RMakeList` rule.** A sub-word packed list's elements are plain i32s, as a
  `u8` list's are, which matches what `emitArrU8` writes. Building at the build type exposed
  `i8` and `u16` literals that the old stamp had kept away from the packed rule.

## Measured

Fixpoint seeds: merge-base c34a60bfd against this branch.

| | merge-base | this branch |
|---|---:|---:|
| corpus + cases covered = matched functions | 93,025 | 93,420 (+395) |
| start bodies matched | 10,281 | 10,347 (+66) |
| door literals matched | 33,193 | 35,688 (+2,495) |
| door `fragment rep` | 618 | 6 |
| door `array union element rep` | 900 | 2 |
| door `array element coercion` | 984 | 108 |
| door `rep null` | 181 | 1 |
| self-compile covered = matched | 18,410 | 18,425 (+15) |
| self-compile door matched | 13,584 | 13,625 (+41) |

No row reads `fail`, `differ` or a verifier miss that the merge-base lacks.

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `--cases` | identical 7,520, differ 0; witnesses same 59, differ 0 |
| mode 3 | identical; claimed 18,425 (merge-base 18,409) |
| L2 fuel | +0.019% on the merge-base (103,435,399,528 vs 103,415,721,516) |
| `gate.sh --fast` | passed |

**Controls** (`tests/vl_ir_door_guard_test.ts`):
- `gt<f32>`'s `[1.5]` matches.
- An `i8` and a `u16` literal match.

Each fails on the merge-base seed with `fragment rep`.

**Lines: compiler +24 / −6, tests +32.**
