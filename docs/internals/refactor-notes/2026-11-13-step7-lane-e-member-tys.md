# Step 7 D16052: three union walks read member types via `unionTyMemberTys`, 2026-11-13

Lane E's share of D16052, split with lane G. `internShapeDeepTyGo`, `internFuncTypeShapesTyGo` and
`unionHasBoolLeafArm` each called `unionTyArms(ty, atoms, tys)` and read only `tys` and the arm
count. The spellings were filled in and then dropped. `unionTyMemberTys(ty, tys)` (#7845) has the
same coverage and fills only the types. Lane H owns the `collectDeclaredUnion` callers.

## Probe

The probe used a scratch compiler, never refreshed into a seed, on master `52100b11`. At each site
it compared the success flag and type array from `unionTyArms` with those from `unionTyMemberTys`.
It was drained once after `emitProgramRun`, over the sweep's 24,224 programs.

- 210 site hits in 104 programs; `unionTyArms` succeeded at 205.
- 0 differ in either the flag or the type array.

## Changed

All three sites call `unionTyMemberTys`. The two shape walks pass `tys.length` as the arm count,
and `unionTyArms` is no longer imported by `emit_shape_intern.vl`.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `52100b11` against the candidate: SWEEP.
- `scripts/gate.sh`: all rows pass.
