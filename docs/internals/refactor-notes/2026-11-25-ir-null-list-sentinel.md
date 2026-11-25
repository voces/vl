# IR: a `null[]` list's i32 sentinel storage (2026-11-25, lane COV-IS)

Coordinator ruling (a), 2026-11-25: a `null[]` list's element rep in the IR is legacy's i32-backed
storage, so bytes stay identical and no new lowering is needed for a rare type. Two mechanisms
follow from it.

## What landed

- **The literal** (`arrLitShortWhy` "null sentinel", which was `array null sentinel`). Each `null`
  element is built as the immediate 2 at i32. A value other than a `null` literal is first written
  for its effect and dropped (`RAfterEffects`), as `emitArrI32` writes it. The element predicate is
  `arrElemNulSent`, now shared with `emitArrI32` (a byte-neutral extraction). The verifier's
  `RMakeList` rule takes i32 elements in a `null[]` list, as in a packed list.
- **The store** (`store null unit sentinel`). `emitIdxStoreValue` writes an unstamped `null` (a
  capture cell's rewritten store, D17300) as the value's effect (`emitNulNoneForEffect`), then the
  sentinel 2. The element store builds that (`nulNoneEffect`, then the immediate or
  `RAfterEffects`) at the i32 rep, and the verifier's `SListSet` rule takes i32 into a `null[]`.

## Kept as named misses

- `null unit element read span`: a read of a `null[]` element. Lifting the refusal, as tried here,
  mismatches on the read's banked span (`spans: read index`). It needs the element-read row
  `emitIndex` banks, a separate mechanism.
- `null unit read rep` (a `null`-typed name read written for its effect) and `null-typed call
  sentinel rep` (an element that calls a function returning only `null`, whose sentinel the
  context does not hold).

## Legacy tails the IR calls

None new. `arrElemNulSent` is a predicate.

## Census (restricted to the programs these classes held; 2 `error-*` cases dropped on both sides)

Base rows from master 7eddff27; head on this branch.

| reading | base | head |
|---|---|---|
| tests/cases distinct functions claimed (6 programs) | 36 of 58 | 46 of 58 |
| `array null sentinel` / `store null unit sentinel` (cases) | 12 / 4 | 0 / 0 |
| `null unit element read span` (cases, now the first miss) | 3 | 9 |
| witnesses distinct functions claimed (6 programs) | 4 of 9 | 7 of 9 |

## Q58

`tests/cases/unions/null-list-literal-and-store-positions.vl`: a `null[]` literal as a `let`, a
call argument, a return, a record field and an `if` arm value, then a captured binding's `null`
stored into one. Base: 3 `array null sentinel` and 1 `store null unit sentinel`. Head: 5 of 5
matched, with `others` (a call and a name read) the named miss.
