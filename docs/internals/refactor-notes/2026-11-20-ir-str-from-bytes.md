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
- `strFromBytesTail` is the helper call, which legacy's arm and the IR's both write. Its
  `emitFail` is internal, not a refusal: the pre-scan reserves the helper for every call it sees
  spelled (`gNeedsStrFromBytes`), so an unreserved helper is a pre-scan miss. Master's arm made
  the same check, before its operands rather than after.
- The builder builds an `RStrOp` `frombytes` (a new `StrOp` member, lint set updated) over the three
  operands: a `u8` list, then two `i32`s, each refused by name at any other rep. `lowerStr` writes
  the operands, as for every string op, and the arm writes the tail. The verifier holds the operand
  reps.

Compiler lines are +66 −4 across `wasmEmit.vl`, `ir_build.vl`, `ir_lower_ref.vl`,
`ir_verify.vl`, `ir.vl` and `lint.vl`. No legacy line is deleted; legacy's routing and helper call
moved into the two shared functions.

## Readings (vs merge-base `c34a60bfd`, fixpoint seeds on both sides)

| reading | merge-base | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 18,328 | 18,331 (+3) |
| corpus covered = verified = matched (shadow) | 40,615 of 45,678 | 40,952 (+337) |
| corpus `intrinsic none` alone (census) | 356 | 19 |
| L2 self-compile fuel | 103,413,762,266 | 103,466,430,703 (+0.051%) |
| seed size | 6,890,795 | 6,892,324 (+1,529 bytes) |

Legacy moved into the two shared functions, so legacy is A/B'd on its own: compilers with
`CLAIMED` empty built from both trees give identical bytes on every tests/cases program and probe
(7,520 identical, 68 failing under both, 0 differ) and the same first diagnostic on all 59 filed
emit-reject witnesses. The shipped seeds give the same 7,520 / 68 / 0.
