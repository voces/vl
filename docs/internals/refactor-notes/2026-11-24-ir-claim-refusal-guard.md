# A claimed unit skipped legacy's refusal: the claims-off fallback (2026-11-24, lane IR-P1, express)

D17094 to D17096: `vl check` is clean on each. The claimless compiler refuses at emit (rc 1).
As shipped, the build wrote an invalid module (rc 70).

## Mechanism

`irClaimFn` (emit_sections.vl, in `emitFuncCode`) and `irClaimStart` (the start body) run before
legacy, and on a claim legacy's body lowering does not run. A refusal legacy raises inside that unit
(`emitFail`) therefore never fires. It is not raised and then discarded: it is never reached.

In D17094 to D17096, legacy's refusal is `emitBundleResultPick` on `bundleResultPickOf(..).bpHeap ==
-2`. The IR reads the same `-2` in `bundleCallOf` only as "not a bundle call", lowers on, and writes
the bundle record into the closure-typed slot. The shadow's dual emit compares against legacy's
bytes, and legacy wrote none, so mode 2 reads every function as matched.

## Population (master dbeb64c77; the seed against `ir-identity.sh --build-claimless`, `ir-parity.vl`)

| population | programs | claimless refuses | claimed invalid | claimed builds | refused differently |
| --- | --- | --- | --- | --- | --- |
| tests/cases, distilled cells and named, probes | 20,539 | 3,335 | 0 | 0 | 0 |
| every capability-matrix template, generated | 93,094 | 6,106 | 0 | 4 | 1 |

- The 4 that the claim builds where legacy refuses run correctly, each printing the template's 4:
  `hole-fn-value-unresolved-read_declared_generic_{list,record}_{ann,unann}`. They are claims that
  legitimately remove a refusal (coordinator ruling), and the fallback leaves them running.
- The 1 refused differently is `map-of-hole-fns-pushed-onto-map-list_argument_unann`: claimless
  says `scalar map read has no value-box type`, claimed says `a union's arm rows were asked of a type
  no row holds`.
- The matrix pass built all 93,094 claimless first, 2,863 CPU-s, then ran parity on the 6,106
  refusals, 1,046 CPU-s.

## What landed

`compile_vl_located` (scripts/vl-host, shared by `vl build` and `vl run`) validates a module only
when the compile took a claim (the guest's `claimed …` rows). On failure, `claims_off_rebuild`
compiles the unit again with every claim off (`irShadowArm(1)`):

| claims-off rebuild | normal | `$VL_IR_STRICT=1` |
| --- | --- | --- |
| refuses | legacy's refusal, rc 1, plus `vl: note: an IR claim wrote an invalid module (…)` | the same |
| valid module | legacy's bytes, plus `vl: <file:line:col: … inside `f`>: IR claim produced an invalid module; used the legacy emitter` | `invalid module`, rc 70 |
| invalid too | `invalid module`, rc 70 | the same |

- A fallen-back result is never stored in the compile cache, so a later strict build meets the
  claim again.
- `$VL_IR_STRICT=1` is set by `gate.sh`, ci.yml, `ir-identity.sh` and every `ir-parity.vl` build.
- `$VL_FAULT_INJECT_CLAIMED` corrupts the claimed module only, never the rebuild, as the control
  for the two outcomes in which legacy builds.

## Proof

- **The failing control first.** On the shared host, without the fallback,
  `tests/vl_ir_claim_fallback_test.ts` reds 6 of its 7 tests: both stable controls give rc 70, and
  the fault seam is unknown to that host. On the new host it passes 7 of 7.
- **The gate row** `ir claim refusals` runs `ir-parity.vl --pop refusals` over 84 programs: the
  18 `@emit-error` cases, `tests/ir-claim-fallback`, and the emit_reject witnesses.
  - On the new host: `same 4, differs 0, build-fails(both) 80`, rc 0, 57 CPU-s.
  - On the shared host (the row's failing control): `differs 4`, naming each escape, claimed
    `failed to validate` against legacy's `emitProgram` refusal.
- **Why D17095 and D17096 are graded by the gate row, not by the native test:** a legacy rung lifts
  their refusal (N2, after #9839). The row only asks that claimed equal claimless, so a legitimately
  lifted refusal passes it. The two stable controls are N2's "a different bundle shape, or a plain
  closure, stored from `g`" rows, which stay refused after #9839.

## Not here

- **The TS hosts** (the LSP, the playground, the V8 corpus oracle) take the claimed bytes without
  the fallback. The controls therefore live in `tests/ir-claim-fallback/`, not as `@emit-error`
  tests/cases, which the oracle grades at the guest (rc 3). The TS hosts follow next.
- **`vl run --batch` and the CLI pump** (`vl check --codegen`) keep reporting the invalid module.
  That is the strict answer, which is what their callers (the fuzz loop and the census) want.
- **No G2 twin** at `bpHeap == -2` in the builder: the ruling did not ask for one. It would also
  remove this unit's escape, which the guard's own control needs.
