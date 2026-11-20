# IR: an i32 memory load or store through one access plan and tail, 2026-11-20

After #9290, five self-compile functions still waited on `intrinsic none`: three
`__store_i32__`, two `__load_i32__` (one with `__load_u8__`). Legacy wrote each width in one of
three arms (`__store_i32__`, `__load_i32__`, and the width tables for the rest): the address,
with any constant part moved into the memarg offset, a store's value at its declared width, then
one access at the width's natural alignment.

## The change

- The three arms of `emitCallCore` are one, `emitCallCoreMemAccess`, over one plan and one tail
  (wasmEmit.vl), which legacy and the IR both call:
  - `memAccessCallNamed`, the routing;
  - `memAccessPlanOf`, a width's opcode, alignment, operand count and store widening;
  - `memAccessTail`, the access.
- `emitMemAddr` is a plan, `memAddrPlanOf` (a new closed set `MemAddrArm`, registered), and the
  writes of each arm. Its arms are unchanged.
- `RMemAccess { mmArgs, mmAt }` is a new `Rhs`, built for an access whose value is a plain i32,
  over the plan's `const` address (an immediate 0) or `rest` address (its node), then a store's
  value. The verifier holds every operand and a load's result at i32.
- The lowerer writes it in `emitCallCoreMemAccess`'s order, as a value for a load and as an
  effect for a store; a discarded load drops its value, as legacy's statement arm does.
- Named misses stay for a widened store value (i64, f32, f64), a wide load, and the `lma`,
  `fold`, `wide` and `bad` address arms.

`vl_ir_shadow_test.ts` holds a plain, a computed, a constant and an offset address, a byte width
and a discarded load covered and matched.

## Readings (vs merge-base `6aa68d8eb`, fixpoint seeds on both sides)

| reading | merge-base | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 18,863 | 18,867 (+4) |
| self-compile functions with no blocker | 18,967 | 18,976 (+9) |
| self-compile `intrinsic none`, alone | 5 | 0 |
| corpus covered = verified = matched (shadow) | 41,774 of 45,678 | 41,774 |
| L2 self-compile fuel | 104,594,888,271 | 104,786,027,740 (+0.183%) |
| seed size | 6,925,560 | 6,928,351 (+2,791 bytes) |

No corpus function waited on a memory intrinsic alone. The fuel rise is spread over the phases
(checking +0.10G, code payload +0.07G, emit passes +0.02G): the source the plans add and a new
member of the `Rhs` union every match over it checks. Legacy is A/B'd on its own: compilers with
`CLAIMED` empty built from both trees give identical bytes on every tests/cases program and probe
(7,535 identical, 68 failing under both, 0 differ) and the same first diagnostic on all 59 filed
emit-reject witnesses.

## The zero-extending load fold (after the master merge at f44a504b)

The queue's armed shadow over `tests/cases` found 4 byte mismatches in
`tests/cases/memory/load-zero-extend-fold-values.vl` (`prefix or locals at 0x08 vs 0x10`, three
times, and `vs 0x17`). Legacy folds `(__load_*__(p) as% i64) & mask`, and an unsigned load cast to
i64, into one zero-extending i64 load (`zextLoadOf`: `asCastArmOf`'s `zextLoad` arm and
`emitBinExprNode`'s `&` arm). The builder asked neither, and once it built the load it wrote the
load and its widening apart. As ruled, the builder now asks legacy's decision and re-spells
nothing: `&` with `zextLoadOf(ix) >= 0` misses as `zero-extending load mask`, and an `as` on the
`zextLoad` arm as `expression as zextLoad`. That file reads 4 covered, 4 matched, 10 uncovered on
those two classes, and no mismatch. The IR owning the fold as legacy writes it is a follow-up.
