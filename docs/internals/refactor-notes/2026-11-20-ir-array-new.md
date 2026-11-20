# IR: `__array_new__` through legacy's plan, stash and tail, 2026-11-20

Twenty self-compile functions waited on `intrinsic none` for an `__array_new__(n, fill)` call
(sixteen alone, four with `__array_copy__`), and eighteen corpus functions alone. The builder
sent the call to the numeric intrinsic plan, which does not name it. `RListNew` was declared and
verified but never built, and the lowerer refused it. Legacy writes the length, stashes it in
the frame's array-intrinsic slot (one of its own depth inside another site's fill), writes the
fill, then allocates the backing and the `{backing, len, cap}` wrapper.

## The change

- `emitArrayNewIntr` (wasmEmit.vl) is split into shared parts that legacy and the IR both call:
  - `arrNewCallNamed`, the routing: the spelling, with no binding owning the name;
  - `arrNewPlanOf`, the backing and wrapper pair for the site's list kind, or the refusal legacy
    records;
  - `arrNewLenStash`, `arrNewFillStep` and `arrNewTail`, which write the stash, the fill depth and
    the allocation;
  - `arrNewFillBoxTy`, the union element a fill is boxed into.

  The kind match moved out of the emitter's nesting unchanged, which is most of the diff. The fill
  guard returns its sentence instead of recording it.
- The builder builds `RListNew` (now carrying its call node, `lnAt`) over the length and the fill
  at the list's element rep.
- The lowerer writes it in `emitArrayNewIntr`'s order: the length, the stash, the fill one fill
  depth in, then the tail.
- Named misses stay for `__array_new_default__`, a refused site, a fill boxed into a union
  element, and a length or fill at another rep.

Compiler lines are +206 −128 across `wasmEmit.vl`, `ir_build.vl`, `ir_lower.vl` and `ir.vl`. No
legacy line is deleted; the arm's decisions moved into the shared functions. The capability
template `matrix/array-new-delivered.matrix.vl` grades every position, plus f64, string, record,
nested and union-element fills.

## Readings (vs merge-base `6737c1aab`, fixpoint seeds on both sides)

| reading | merge-base | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 18,446 | 18,454 (+8) |
| self-compile functions with no blocker | 18,529 | 18,553 (+24) |
| self-compile `intrinsic none`, alone | 25 | 9 |
| corpus covered = verified = matched (shadow) | 41,296 of 45,678 | 41,314 (+18) |
| corpus `intrinsic none`, alone (census) | 19 | 0 (1 now `array new default`) |
| L2 self-compile fuel | 103,451,339,825 | 103,492,871,461 (+0.040%) |
| seed size | 6,900,565 | 6,902,016 (+1,451 bytes) |

The nine self-compile functions left are `__array_copy__` (four) and the linear-memory load and
store intrinsics (five). Legacy is A/B'd on its own: compilers with `CLAIMED` empty built from
both trees give identical bytes on every tests/cases program and probe (7,527 identical, 68
failing under both, 0 differ) and the same first diagnostic on all 59 filed emit-reject witnesses.
