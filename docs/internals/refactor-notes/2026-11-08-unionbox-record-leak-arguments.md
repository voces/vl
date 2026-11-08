# The box record's batch leak, and arguments read it (2026-11-08)

Step 5, union boxing round 2. Follows `2026-11-08-unionbox-table-arguments.md` (#6751), which
parked the direct and captured argument positions on an order-dependent box record.

## The leak

`check_if_value.vl`'s `lpExits` (by loop node: the values its `break`s and tail joined) was a
module `const` map that no reset cleared. `boxExitsStamp` asks `lpExitsOf(ix)` of every node
`ctxTyStamp` records at a union, so on a shared instance a node that was a labelled block in an
EARLIER program handed this program's nodes at the same indices to `boxTyStamp`. In
`closures/hole-fn-labelled-block-left-by-break.vl` then
`closures/nul-scalar-list-arm-closure-result.vl`, the `useIt` argument was stamped with `mk`'s
return union after its parameter's, and with arguments reading the record the second file built
invalid wasm (`expected (ref $13), found i32`). Alone it was clean.

Fix: `lpExits` is a `let`, cleared in `ifValueReset` beside the rest of the loop log.

Why the audit missed it: `scripts/emitter-state-audit.vl` reads `let`s in emitter modules, and
this was a `const` in a checker module. `check_if_value.vl` now joins the audit (its 15 mutables
classify cleared; `--without-reset ifValueReset` names all 15, `lpExits` among them). The wider
class is open: module-scope `const` maps and arrays that are written are invisible to the audit
in every module (about 150 in `compiler/`, most of them stacks or generation-stamped memos).

Regression: the pair joins `tests/vl_instance_state_leak_test.ts`'s programs in the leaking
order. Control: the same harness on a compiler with the argument switch and without the reset
reds on exactly that pair (2 of 11 tests).

## Is last-write-wins right?

A probe of `boxTyStampOne` over the 23,615-program sweep population, on the fixed tree, counts
each write that replaces a different recorded type: 3,496 writes in 957 files, of which 1,933
re-record the same union under another index. **1,563 writes in 437 files** replace one union
with a different one inside one program, for example `A | B | null` then `A | B` (`inventory/D3528`,
a `??` operand), `XY` then `XYZ`, `{r: i32} | null` then `Circle | null`.

So the record is last-write-wins by design today, as `ctxTy` is, and first-write or a join would
change those 437 files' records. Nothing here changes the policy: with the leak gone, every
position that reads the record is byte-identical to its site union over the population (below).
A position whose switch moves bytes is where the policy question becomes measurable.

## Arguments read the table

`emitDirectArgValue` and `emitCapturedCall` box an argument at `emitDelivered` where the record
names a registered union box (`boxOwedAt`). The floor, an argument with no usable record (one
still naming an open type parameter, 141 deliveries in #6751's shadow), keeps the parameter's
union. Union-box call sites deleted: 0; two `emitUnionBoxArg` calls become that floor.

## Proof

Fixpoint seed 6,498,035 bytes (+216 against #6751's fixpoint, 6,497,819; refresh twice,
byte-identical). Sweep against #6751's fixpoint: 23,615 same, 0 bytes-only, 0 `runs → not-runs`,
0 new traps. Shadow (`box-dst-shadow/run.sh`) on the candidate: 111,374 deliveries, top level
45,865 agree, 10,257 already a box or never returning, 456 empty record, 38 no record, 86 disagree
(87 at #6751), none of them at an argument position. `scripts/gate.sh`: 23 of 23 rows pass.

## Next

Positions with no floor in the population, one family per PR: variant fields, struct-field
store, map default, `emitAssignIdent`, fn-tag dispatch, const-cell init; then returns.
