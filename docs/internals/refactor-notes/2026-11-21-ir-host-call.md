# IR coverage: host calls as `RCallHost` (2026-11-21, lane IR-N7)

Split by callee, the `tests/cases` census at 2ebfe622 had about 150 `intrinsic none` rows on a host
call: the `std:fs` floor (`__fs_write_from__` 27, `__fs_size__` 19, `__fs_read_into__` 18,
`__fs_write_at__` 18, …) and user externs (`nowMillis` 8, `sink` 6, …). Legacy lowered both the
same way in two arms (`emitCallCoreHostFloor`, `emitCallCoreExtern`): each argument at a width,
then one `call` of an import reserved only when used.

## Change

- **One plan, one tail.** `hostCallNamed` is legacy's routing: a floor slot by name, or an extern
  no binding of the name shadows. `hostCallPlanOf` gives the import, each argument's kind (a
  floor slot's offsets at i64; an extern's arguments at their declared i64, f64 or f32), whether
  the import is void, and legacy's two emit failures, verbatim. `hostCallTail` writes the call.
  Legacy's two arms are now one, `emitCallCoreHost`.
- **`RCallHost`**, already in the node set, gains `chVoid` and `chNever`. A call typed `never`
  (`__proc_exit__` under `exit`) is followed by `unreachable`, as `emitCall` writes it after every
  `callEndsNever` call. That is the one mismatch the first build showed (`exit` in
  `tests/cases/std/process-exit-never-narrows.vl`, one byte short). As a statement, a non-void
  host call's value is dropped, as `emitCallStmtIdent` drops it.
- **Named misses:** `host call plan` (a call legacy refuses), `host call operand coercion` (an
  argument the plan widens that is not at the kind's prim yet), and a short-circuit operand.
- The plan lives in `wasmEmit.vl`, which already reads the floor and extern tables, so the IR
  imports no checker symbol for it.

## Measured

See the PR body. The shadow row (`tests/vl_ir_shadow_test.ts`, "host calls") has 8 functions:
floor slots of each argument kind, a void and a `never` slot, and an extern kept and dropped. On
master's seed 7 of them are `intrinsic none`; on this one all 8 are covered and matched.
