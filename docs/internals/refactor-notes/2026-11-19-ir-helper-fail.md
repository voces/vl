# Runtime helpers through the IR, step 2: the fail and log helpers (2026-11-19)

Family C of §10.1(b) (`ir-design-2026-11.md`), on the door and raw layer of
`2026-11-19-ir-helper-door.md`: `__log__`, `__init_fail__` and `__as_fail__` are built as IR and
lower to the bytes their hand-written writers emitted. The writers and their three sub-writers
(`emitInitFailPick`, `emitInitFailText`, `emitAsFailDecimal`) are deleted.

## Shape
- **`RRel { rlSp, rlSub, rlVal }`**: an i32 constant the relocation table names in space `rlSp`
  from `rlSub`, lowered by `fbI32RelOf`. Its own Rhs, not a raw op, since it carries three
  integers. In the `raw` family; rule 10 keeps it in helpers.
- **Raw op `load`**: an `i32.load` at alignment 2, offset 0, for `__log__`'s tag/value pairs.
- The void helpers return the no-value rep (`TY_NEVER`'s), so `ir_helper.vl` imports a fourth
  type-id constant.
- The door's byte copies go through `wBytes`, so a relocated constant's row follows its bytes into
  the framed entry. Relocation is unarmed (`RELOC_ARMED`), so no byte moves.

## Measured
- Every `tests/cases` program not `@error` plus every capability probe, master seed (6af1fed0c)
  against this one: identical 7508, fail under both 68, differ 0. `globals/read-before-init-*`
  links `__init_fail__`, `run/log-i32` links `__log__`; an `as!` program links `__as_fail__` and
  prints the same `as! i32 at 3:19: not exact`.
- Lines, compiler only: +183 / −194. The two kinds and the door's copies cost about 30; the bodies
  are about 0.7× the hand lines they replace.
- L2 self-compile fuel: +0.15% on master's own reading (98,983,941,006 to 99,131,181,587). The
  self-compile's `__init_fail__` prints a text row per guarded global, and each printed character
  is now an IR node built, verified and lowered rather than bytes written directly.

## Not in this step
F (map + list) and G (list views); H waits on IR4; the exit-form mover.
