# IR A1: list literals through one decision and legacy's short tail, 2026-11-17

Lane IR-C. I8c (`armSeat`, `atomSeat`) was next, to be taken when it leads the census. On the
2c-2b seed it does not. Its nearest blockers hold at most 54 corpus functions alone, and the
leaders read:

| blocker, functions held by it alone | corpus | self-compile |
|---|---:|---:|
| `expression array` (list literals) | 1,048 | 604 |
| `statement`, which a throwaway resolved to `for … in` | 395 | 407 |
| `parameter rep record` | 456 | – |
| `expression if` (a valued `if`) | – | 366 |
| `list length rep` | – | 353 |
| `wide literal` and `expression as` (one grid) | 337 each | – |
| `member record` | – | 285 |

By the coordinator's ruling the order is list literals, then `for … in`. No other lane owns
either in the IR. `CLAIMED` stays empty, and no emitted byte moves.

## What landed

- **`arrLitArmOf` is the list literal's decision.**
  - `emitArrUnder`'s flag ladder moves into it unchanged, and `ArrLitArm` names the builder:
    `spread`, `clash`, `emptyHole`, `v128`, `u8`, `f32`, `f64`, `i64`, `str`, `ref`, `i32`
    (and `notLit`).
  - `emitArrUnder` dispatches on it.
- **The short tail is shared.** `arrLitShortTail` writes the `array.new_fixed` backing, the
  length, the capacity and the wrapper, and the i32, f64, i64, f32 and string builders end
  with it.
  - `arrLitPrologue` is `emitArr`'s spread note and type mint.
  - `arrLitShort` is the short build's shape: within the chunk cap, not the `for` iterable's
    hoist, and, for the i32 list, no atom or `null`-sentinel element.
- **`RMakeList { mlElems, mlAt }`** moves into the `list` family. It is built for those five
  arms, each element delivered at the list's element rep (`deliver`, so an i32 into an f64
  list takes legacy's widen plan).
  - Its lowering is the build pair, the prologue, the elements, then the short tail, in
    `emitArr`'s order.
  - Every other arm is a named miss (`array <arm>`, `array long or seeded`, `array element
    coercion`).
- **A `[]` binding that legacy reserves is a named miss** (`declaration list reserve`). When
  pushes follow a fresh `[]`, legacy builds it at its final size and appends through locals
  (D3623).
  - `listReserveScan` is legacy's own scan, shared, and `emitListReserve` reads it.
  - The builder holds each statement's list and position (`stmtRun`, `stmtAt`) to ask it.
  - Without this the first armed self-build reported 15 byte mismatches, all at a reserved
    `[]`.
- `ArrLitArm` is registered as a closed set in `compiler/lint.vl`.

## Pins

Each is a shared witness, one covered function matching legacy and printing the right value:
- an i32 list;
- an f64 list with an i32 element widened;
- an i64 list, an f32 list, a string list and a boolean list;
- an empty literal.

A reserved `[]` binding and a nested list literal are a test of their own: each a named miss.
A union-element literal stops earlier, at its result rep. Two older tests changed:
- the void tail-call witness's callee now holds a nested literal;
- the census test's row reads `coalesce string default` alone.

## Coverage

| reading | 2c-2b | this step | gained |
|---|---:|---:|---:|
| self-compile claimed in mode 3 | 5,734 | 6,316 | +582 |
| corpus covered = matched (12,296 cells) | 24,120 | 25,060 | +940 |

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical, with the 2 mismatches 2c-2b already reports |
| corpus identity against the 2c-2b seed, 12,294 cells | 9,016 identical, 3,278 fail under both, 0 differ (so the builder split moves no corpus byte) |
| mode 3 with `list` and `map` admitted (throwaway build) | self-compile 6,316 claimed and byte-identical, the same 2 fallbacks; corpus 9,016 identical, 0 differ, 0 fell back |
| L2 self-compile fuel (`self-compile-time.sh`, each tree from its own fixpoint seed) | 94,398,540,067 to 94,452,105,313 (+0.06%) |
| seed size, 2c-2b seed to this one | 6,544,190 to 6,546,352 (+2,162) |
