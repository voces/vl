# COV-CALL: a closure call's head staged ahead of a statement argument (2026-11-25)

Lane COV-CALL, class `short-circuit closure argument`. The design was approved by the coordinator on
2026-11-25, with three conditions: verifier rules armed with a failing control, the ladder lint
entries, and a Q58 sweep over each argument index and callee kind.

## Mechanism

Legacy's `emitCallRefUnder` writes a closure call in this order:

1. the callee;
2. `local.set crSlot` (`callRefStash`);
3. `local.get crSlot; struct.get env` (`callRefEnvOpen`);
4. each argument;
5. the tail (`callRefCallTail`).

An argument that is a valued `if`, a `??`, an assignment or a stash is written in place, above the
env. The IR builds such an argument as a statement ahead of the call node, and the lowering wrote
`RCallRef`'s head at the call. So the builder refused (`ifBelowLead`, `closureCallAt`).

The fix:

- **IR:** `RCallRefHead { chFn }` is a temp whose lowering writes the callee, the stash and the env,
  and leaves the slot and depth for its call (`lwHeadSlot`, `lwHeadDepth`). `RCallRef.crHead`
  marks a call whose `crFn` is such a head. Its lowering then writes only the arguments and the
  tail, and `callRefStash`, `callRefEnvOpen` and `callRefCallTail` stay the one shared writer.
- **Builder:** when an argument writes a statement (`ifBelowLeadHas`), `closureCallAt` inserts the
  head where the callee ends (`closureHeadStage`, at the callee's own type). It stages the earlier
  arguments with `irBStageLeads`. The lowering's staging (`stageLead`, `stageRoot`) then writes the
  head and those arguments ahead of the statement, in legacy's order. With no such argument nothing
  changes.
- **Verifier, rule 10:** a head temp is read only as the callee of one `RCallRef` with `crHead`
  (`vfHeads`, `headRead`); a plain read, a second read, or a `crHead` call over anything but a head
  fails. The failing control `irShadowCorrupt(12)` (`headControl`) clears `crHead`, and
  `tests/vl_ir_shadow_test.ts` asserts it reds while the clean run matches.

## Census (class programs, `CENSUS_CLASS=classes/short-circuit-closure-argument.txt`)

| row | before | after |
|---|---:|---:|
| `short-circuit closure argument` | 19 | 0 |

The one newly exposed first miss is a `map short-circuit operand`, another class. No claim falls
back, and every class program is byte-identical under `VL_IR_STRICT=1 VL_IR_SHADOW=6`.

## Proof

- **Q58 sweep:** `tests/cases/closures/closure-call-statement-argument-positions.vl`.
  - A valued `if` at each of three argument indices, a `??` and an assignment at each of two.
  - Callees: a local holding a closure, a parameter, a capture, a record field, a call's result,
    and module scope.
  - On master the IR leaves 7 of its functions and the start body uncovered; with this change all
    13 and the start match.
- **Byte identity:** the program counts are in the PR body.
