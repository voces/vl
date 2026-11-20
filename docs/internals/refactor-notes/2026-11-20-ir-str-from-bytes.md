# IR: `__str_from_bytes__` through the shared string-op path, 2026-11-20

With #9249's byte-list element store in, 337 corpus functions waited only on
`intrinsic none`: a `__str_from_bytes__(src, at, count)` call, which the builder sent to the
numeric intrinsic plan and which that plan does not name. Legacy writes the three operands as they
stand and then calls one helper (`gHelpStrFromBytes`), which bounds-checks the range and copies it
into an exact-fit string.

## The change

- `strFromBytesCallNamed` (wasmEmit.vl) is the routing legacy's `emitCallCore` now dispatches on:
  the spelling, with no binding owning the name. The builder asks it ahead of the numeric
  intrinsics.
- `strFromBytesTail` is the helper call, which legacy's arm and the IR's both write.
- The builder builds an `RStrOp` `frombytes` (a new `StrOp` member, lint set updated) over the three
  operands: a `u8` list, then two `i32`s, each refused by name at any other rep. `lowerStr` writes
  the operands, as for every string op, and the arm writes the tail. The verifier holds the operand
  reps.

Compiler lines are about +60 −6 across `wasmEmit.vl`, `ir_build.vl`, `ir_lower_ref.vl`,
`ir_verify.vl`, `ir.vl` and `lint.vl`. No legacy line is deleted; legacy's routing and helper call
moved into the two shared functions.

## Readings (vs merge-base `799e3a8d1`, fixpoint seeds on both sides)

| reading | merge-base | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 18,280 | 18,283 (+3) |
| corpus covered = verified = matched (shadow) | 40,614 of 45,678 | 40,951 (+337) |
| corpus `intrinsic none` alone (census) | 356 | 19 |
| L2 self-compile fuel | 103,311,866,734 | 103,366,805,283 (+0.053%) |
| seed size | 6,886,447 | 6,887,969 (+1,522 bytes) |
