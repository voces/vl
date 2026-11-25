# IR coverage: coalesce batch 2 (lane COV-UNION, 2026-11-25)

Three classes of the I8 census: `coalesce box next` (5 rows), `coalesce box after an operand` (4)
and `coalesce never default widened` (3).

## Mechanism

- **box next.** `coalNextArmOf` answers `callBool` for a call's (or an `if`'s) `boolean | null`.
  Legacy stashes that once and tests it against its sentinel (`emitCoalesceCallNiche`), which is the
  niche cell's arm over a stashed operand. `coalBox` routes it to `coalNicheCell(..., "nulBool")`.
- **box after an operand.** A call's box arms (`callBox`, `callScalar`) and the `boxStash` rung
  read only their operand before their tag test opens. So `coalArmStagesLeads` now answers true
  for them, and an earlier operand's temps are staged below the operand, as for the niche arms.
  The builder's `endsInTemp` miss on `boxStash` goes with it.
- **never default widened.** At an f64 or i64 result legacy writes the `never` call, its
  `unreachable`, then the widen of the dead `i32` value (`f64.convert_i32_s`, `i64.extend_i32_s`).
  `coalNeverDefault` now builds the call as a value, widens it with `RNumWiden` and stores it into
  the out. It takes the out as a new argument.

## Measurements

- A class cut of the census (`CENSUS_CLASS`, 60 programs across the coalesce classes this lane
  owns), before and after:
  - `coalesce box next` 5 → 0;
  - `coalesce box after an operand` 4 → 0;
  - `coalesce never default widened` 3 → 0;
  - cases start bodies claimed 32 → 35 of 48; witnesses start bodies claimed 10 → 11 of 14.
- Two lambdas (`capture-by-reference.vl`, `shared-scalar-let-cell-written-and-read-by-two-closures.vl`)
  move to a later miss, `intrinsic none __trap__`. Their default is the `__trap__` intrinsic a
  shared `let`'s unwritten cell reads, which writes its message loop and has no call value to widen.
- Q58 sweep `tests/cases/null/coalesce-call-box-after-operand-in-each-position.vl`: 81 of 81
  functions and both start bodies matched; each call runs once. A parameter as the earlier operand
  is a different miss (`short-circuit right operand`): the parameter is read at its use, above
  the `??`'s out. Every staging arm shares it.
- Sweep `tests/cases/functions/coalesce-bool-call-niche-in-each-position.vl` covers box next.
