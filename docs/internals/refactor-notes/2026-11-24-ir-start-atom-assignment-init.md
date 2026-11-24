# IR soundness: an atom cell's assignment as a global initializer declines (2026-11-24, lane IR-N11, D17133)

(unfiled: D17133 — N7 files the row.)

Express fix for a clause-1 build: an invalid module, with the G3 fallback the only net. Take
`const c = (k = "ww")` with `k: K` (or an inline literal union) and `c` read from a function or
closure. The start's claim re-read `k`'s atom and decoded it to a string: the decode's slot was a
start local the frame never declares (`unknown local 4`), and the result was a string in a cell
where legacy stores the atom's id.

- **`globalInitValue` (ir_build.vl)** misses `global initializer atom assignment` when the
  initializer is an assignment whose target's rep is an atom (`RAtom`), so the start declines to
  legacy.

## Measured

Base 854945a3, both seeds fixpoints.

- Module-start sweep, 32 programs: 8 cell kinds (`K`, inline literal union, `K | null`, string,
  i32, f64, unwidened i64, nullable record) × the global read plainly, from a function and from a
  closure, plus 4 top-level statement forms and 4 ablations.
  - Base: 4 invalid under `VL_IR_STRICT=1`, the `K` and literal-union cells read from a function or
    closure.
  - Head: 0 invalid, every one identical to a claimless compiler.
  - The 2 plain-read siblings also decline; the other cells read as they did on base.
- `vl run` on base (host after c0cbdab7) prints the G3 note
  (`IR claim produced an invalid module; used the legacy emitter`) and `ww`, rc 0. So the fallback
  held, and the defect shows only under `VL_IR_STRICT=1` and in the shadow.

Pins: `tests/cases/assignment/global-init-atom-assignment-{alias,union}-{closure,function}.vl`, all
invalid on base, and `...-controls.vl`.

## Legacy tails the IR calls

None new.
