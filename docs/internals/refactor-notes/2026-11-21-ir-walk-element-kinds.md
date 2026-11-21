# IR: a walk over bytes, nested string or byte lists, variants, nullables and wide scalars (2026-11-21, lane IR-N3)

`forInPlainWhy` refused every byte source and eight element kinds the IR's walk did not take.
The walk's binding is legacy's own (`forInLoopAt`, `forInRolledOpen`, `emitForInBind`), so a
kind it refused was refused by name, not by a writer the IR lacked.

## The change

- **Byte source.** The rung goes; the lowering passes `forInU8Src` into `forInLoopAt`, as
  `emitForInStmt` does, so the loop reads the `$bl8` wrapper and `array.get_u`. The builder and
  the verifier bind a byte unsigned as an `i32`, as the push and store rules already take it.
- **Element kinds.** `forInElemPlain` takes `strlist`, `u8list`, `nulstr`, `variant`,
  `nulstruct`, `i64` and `f64`, each bound through legacy's tail.
- **Box receiver.** A union list's walk variable read as its box (`u is A`, `u.a` under it) is
  `irBBoxLocal`'s: its declaration is a `LoopVar`, whose variable the walk made.
- A master shadow row pinned a generic instance's `f64` walk as a named miss. Both instances now
  cover, so the row expects six walks.

## Witnesses

`tests/cases/loops/for-in-bytes-lists-boxes.vl` and `for-in-variant-nullable-wide.vl`, and the
rows `tests/ir-shadow-rows/walk-*.vl`. On the merge-base seed, 1 of 7 and 1 of 6 are covered;
every function is covered and matched after.
