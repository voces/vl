# IR: a guarded global write (2026-11-24, lane N10)

`userGlobalWriteClass` is "guard" for a write a function can make before the global's
initializer ran (D2654). Legacy's `emitUserGlobalSet` writes the value, then
`emitInitGuard(gi, "written")` (the assigned-flag test that calls `__init_fail__`), then the same
`global.set` and init-bit set as a plain write. The IR refused the class outright:
`irGlobalWriteMiss` named it, and `SGlobalSet`'s "guard" arm was a miss.

- `irGlobalWriteMiss` takes "guard" as "plain" does (a minted global is the IR's).
- `SGlobalSet`'s "guard" arm writes the value, `emitInitGuard(sym, "written")`, `global.set`, then
  the bit where `initBitOf` has one, in legacy's order. The guarded read's arm already calls the
  same guard with "read".

No builder or legacy change. The verifier has no rule for the guard: the IR holds no guard node,
and the lowering takes the class from `userGlobalWriteClass`, as legacy does, so a guard-class
write cannot lose its guard.

`write-before-init-traps::setN` on both seeds: the value (`i32.const 99` into the scratch), then
the guard (`global.get` of the assigned flag, `i32.lt_s`, `call $__init_fail__`), then
`global.set`. No guarded global in the census programs or the sweep carries an init bit; the
lowering writes it after `global.set`, as `emitUserGlobalSet` does.

## Legacy tails the IR calls

`emitInitGuard` (shared with the guarded read's arm since it was covered); `userGlobalIdx`,
`initBitOf`.

## Witnesses

- `tests/cases/globals/guarded-global-write-positions.vl`: the Q58 sweep. Five globals (`i32`,
  `string`, `string | null`, `i32 | string`, a record) are written from a parameter, a call, a
  nested call, an `if` arm, a `??`, a record field and an interpolation hole. A loop, a closure
  and an early-return guard write one too. Each setter is reached before its `let` with `go`
  false, so the guard is emitted and passes, and each call prints its own value.
- `tests/cases/globals/guarded-write-trap-via-closure.vl` and `guarded-write-trap-recursion.vl`:
  a write before init through a closure and through a recursion cycle traps. `vl run` reports
  "`n` written before its initializer ran (line 7), via a closure" and "(line 7), via a" on both
  seeds. The wasm tier's `@trap` sees the guard's trap as an array bound, so the files assert the
  trap; the text is the native host's.
- `tests/ir-shadow-rows/guarded-global-write.vl`.

## Readings (base @@BASE@@, fixpoint seeds on both sides)

@@READINGS@@
