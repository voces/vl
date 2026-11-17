# IR A1: list literals through one decision and legacy's short tail, 2026-11-17

Lanes IR-C, then IR2. I8c (`armSeat`, `atomSeat`) was next, to be taken when it leads the
census. On the 2c-2b seed (#8934's head) it does not: its classes hold 88 (`narrowed read`) and
15 (`string atom`) corpus functions alone. The blocker census (`$VL_IR_SHADOW=4`, 45,661
corpus functions, 24,121 with no blocker) reads:

| blocker, corpus functions held by it alone | functions |
|---|---:|
| `expression array` (list literals) | 1,048 |
| `statement`, which a throwaway resolved to `for … in` | 458 |
| `parameter rep record` | 456 |
| `wide literal` and `expression as` (one grid) | 337 each |
| `expression array` with `intrinsic none` | 1,349 |
| `expression array` with `statement` | 682 |

The order is list literals, then `for … in`. No other lane owns either in the IR. `CLAIMED`
stays empty, and no emitted byte moves.

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
  - The builder passes each statement its list and position (`stmtAt`) to ask it.
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

Each tree is built from its own fixpoint seed: master after #8934, and this step.

| reading | master | this step | gained |
|---|---:|---:|---:|
| self-compile claimed in mode 3 | 5,747 | 6,341 | +594 |
| self-compile covered = verified (armed) | 5,749 | 6,343 | +594 |
| corpus covered = verified = matched (12,296 cells) | 24,121 | 25,061 | +940 |

The first-miss rows that move by more than 20:

| first miss | corpus | self-compile |
|---|---|---|
| `expression array` | 4,483 → 0 | 1,616 → 0 |
| `statement` (`for … in`, F1) | 808 → 2,165 | 481 → 794 |
| `intrinsic none` | 354 → 1,703 | 17 → 32 |
| `expression as` | 674 → 1,011 | 13 → 17 |
| `string append in place` | 3 → 340 | 93 → 114 |
| `array ref` (a nested literal), new | 0 → 51 | 0 → 30 |
| `declaration list reserve`, new | 0 → 42 | 0 → 24 |
| `local rep box` | – | 2,743 → 2,884 |
| `list length rep` | – | 2,294 → 2,406 |
| `expression if` | – | 676 → 746 |

Net compiler lines are +171 (+416, −245): 5.5 corpus functions, or 3.5 self-compile ones, per
line.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical, with the 2 mismatches master already reports |
| corpus identity against master's seed, 12,297 cells | 9,029 identical, 3,268 fail under both, 0 differ |
| mode 3 with `list` and `map` admitted (throwaway build) | self-compile 6,341 claimed and byte-identical, the same 2 fallbacks as master; corpus 9,029 identical, 0 differ, 25,048 claimed, 0 fell back |
| L2 self-compile fuel (`self-compile-time.sh`) | 95,735,881,085 to 95,626,704,192 (−0.11%) |
| seed size, master's to this one | 6,605,491 to 6,607,590 (+2,099) |
| pin helpers in `emit_mono.vl` | 908 |
| phase-state census | flat |
