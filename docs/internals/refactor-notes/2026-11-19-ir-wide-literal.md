# IR: an integer literal past the narrow reading, 2026-11-19

The builder read an integer literal with `memOffsetLexValue`, which caps at `u32` and so
missed as `wide literal` past it, and at `i32` past `I32_MAX`.

## Sizing (census on master `5c0fd9a6f`)

337 corpus functions were blocked by `wide literal` alone. Counted by originating grid, 319 are
grid `nj2`, whose cells hold no wide literal: string interpolation pulls in `std:fmt`'s float
formatter, which has `d = d + 4294967296`. So the 337 are a few `std:fmt` functions counted once
per importing cell. The rest are `d2567` 8, `d3127` 6 and `d947` 3.

## The change

Past the narrow reading, `numLit` builds the immediate legacy's `emitNumLexAt` writes, at the
width `numLitWidth` gives (a mismatch with the rep's prim misses as `wide literal width`):
- at `i64`, `parseI64Pair`'s halves, packed into the immediate's 64 bits;
- at `i32`, `parseI32`'s wrapped value.

Compiler lines are +32 −5, 27 net (`ir_build.vl`).

## Readings

| reading | master `5c0fd9a6f` | this change |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 31,176 | 31,850 (+674) |
| corpus covered = verified = matched (shadow) | | 31,850 (69.7%) |
| L2 self-compile fuel | 99,571,939,258 | 99,576,032,243 (+0.004%) |

The census gain is double the sized 337: the `std:fmt` functions also clear the rows where
`wide literal` stood beside another class.

## `armSeat` stays

I8c's remaining seat, `armSeat`, is deferred, as the coordinator decided on 2026-11-19. It
deletes when the legacy drivers of its eight `armOpen` positions are claimed and deleted
wholesale under I8. It has no census row (no box→record coercion is a blocker). A seat-free
rewrite would have to decide, per position, the box-row precedence in `coerceKindAt` and the
`armServed` route, for no coverage gain.
