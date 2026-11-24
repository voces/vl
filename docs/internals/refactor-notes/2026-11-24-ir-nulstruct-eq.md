# IR: nullable record equality (2026-11-24, lane IR-D1)

The probes batch's mechanism B. Every `S | null == S | null` missed as `nullable record eq`
(`nulNicheEqWhy`'s `nulstruct` arm), not only the probe's `o?.f == q`.

## Mechanism

Legacy's `emitNulStructEq` picks the eq row by three rungs, stages both roots as the plain
compare does (`structEqStage`), then in one `block i32` answers `0` where the roots disagree on
nullness, `1` where the left is null, and otherwise compares the fields (`emitStructEqRec`);
`!=`'s `i32.eqz` follows the block (`emitNulNicheEqBin`). The row (`nulStructEqRowOf`) and the
block (`nulStructEqGuardTail`) are moved out unchanged and shared; `structEqLeave` restores the
stash slots as `emitNulStructEq` did. `RStructEq` carries `seNul`: the builder routes the
`nulstruct` arm to the plain compare's builder with the row, and the lowering stages as before,
then writes the guard tail and the `i32.eqz`.

Named misses, all FREE:
- `nullable record eq bare side`: a bare record beside a nullable one, whose legacy function
  declares locals the IR does not (a byte mismatch before the narrowing);
- `nullable record eq element place`: a `(S | null)[]` element, which legacy re-reads in place;
- `nullable record eq row`: no rung names a row, where legacy refuses too;
- the probe's `o?.f` operand stays `record compare place operand`, the place re-read the plain
  compare refuses as well.

## Verifier

`RStructEq`'s `seNul` needs one nullable operand. Keyed self-tests:
- `nullable-records-compared-nullable`: holds, 0;
- `plain-records-compared-nullable`: refused, 2.

## Readings

READINGS

## Legacy tails the IR calls

`nulStructEqRowOf`, `nulStructEqGuardTail`, `structEqLeave` (wasmEmit.vl), new and moved.
