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
  "`n` written before its initializer ran (line 11), via a closure" and "(line 9), via a",
  identical on both seeds, with exit code 1. The wasm tier's `@trap` sees the guard's trap as an
  array bound, so the files assert the trap; the text is the native host's.
- `tests/ir-shadow-rows/guarded-global-write.vl`.

## Readings (base 467ffe33, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| tests/cases `guarded global write` (IR-only census) | 13 → 0 for the census's own; 49 → 0 with this PR's witnesses (the sweep's 34, the two trap files' 2); no other row moved; fully IR-only 6,179 → 6,190 of 7,225; self-compile 0 missed |
| census provenance | base arm: `compiler/ir_lower.vl` (the only compiler file this PR touches) at 467ffe33's copy |
| distilled corpus, mode 4 | rows identical (the class has no corpus cell) |
| Q58 sweep (`guarded-global-write-positions.vl`, `VL_IR_SHADOW=6`) | 106 functions: base 34 miss (`guarded global write`), head 106 matched; output identical on both seeds |
| claimless, the four witnesses | identical 4 of 4 |
| `ir-identity.sh <base> <head> --names` | identical 9433, differ 0, built under one only 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7803, fail under both 68, differ 0, expected divergence 2 (master's baselined arm-site rows); witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14460, differ 0 |
| legacy A/B (tests/cases + probes) | 7,873 programs, 0 moved |
| L2 self-compile fuel per PR | −0.00% on 125,953,594,913 |
| late demands / late tag rows | 9 (baseline 9) / 307 (baseline 307, 0 gone) |
| `self ir misses` | 0 (baseline 0) |
| `lint-self`, `gate.sh --fast` | clean, passed |
| IR tests, door guard, emitter audit (`SELFHOST_NATIVE_ALIGN=1`) / `vl_deep_nesting_test.ts` | 561 passed / 8 passed, 0 failed |
| shadow row `guarded-global-write.vl` | head 2 covered = matched; base 0, 2 `guarded global write` |

The two leftover union-compare starts (`inferred-nullable-mixed-litunion-return` @init and
corpus `f64nul_eqlit_list_bind`) are not this family; they stay FREE.
