# IR: ref-list element reads stored alike, and union-box list literals built per element (2026-11-23, lane IR-N1)

The lane was `index element coercion` (N3 confirmed it is unowned). Splitting its miss by element
and read rep showed `ref closure → closure` for 17 of the 28 functions; the rest are record, list,
box and nullable pairs on other heaps, each its own conversion. The batch adds `array ref`'s union
case, which splitting by slot kind showed is 31 of its 34 functions: a one-element literal of a
union-box list, mostly a captured value-union cell.

## What landed

- **A ref element stored alike**: `buildIndex`'s `stored` case also takes a `ref` arm read whose
  rep stores as the element's (`repStoresAs`). The read is the element at its storage, as the
  open-type and declared-storage cases already are; legacy writes no conversion there.
- **`arrLitUnionLongSlot`** (`wasmEmit`): the union-box slot `emitArrRef`'s per-element path
  builds a literal at, unchunked and taken by no short arm, else -1. **`arrRefUnionElemTy`** is the
  union it boxes each element into, split out of `emitArrRef` (byte-neutral). The builder boxes
  each element with `boxTempIn`, the IR's writer of `emitUnionBoxOwed`. The `RMakeList` lowering
  takes that slot after the short and variant ones.

## Legacy tails the IR calls

- `arrLitUnionLongSlot` and `arrRefUnionElemTy` (`wasmEmit`): plans the builder and the `RMakeList` lowering ask; the tail written is the existing `arrLitRefShortTail`.

## Bytes and coverage

- `--names`: self-compile identical. `--cases`: identical 7,704, differ 0. `--claimless`:
  identical 14,034, differ 0. `tests/cases` A/B: same 8,819, differ 0. The moved list is empty.
- `tests/cases`: `index element coercion` 29 → 12 functions, `array ref` 34 → 3. Covered = matched
  goes from 78,789 to 78,820. Some functions move on to their next blocker (`expression null` +8,
  `store element` +6, `union cast operand rep` +2, `return coercion` +1). The corpus and the
  self-compile census are unchanged.

## Fuel

L2 self-compile, +0.02% on base 8a807618.
