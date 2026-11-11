# L1: four more instance readers read the per-instance bank, 2026-11-11

The second batch of `2026-11-11-l1-instance-readers-classified.md`'s "should read `nodeTyAt`"
group. Base is that note's PR.

- `letHeldTyOf` (emit_classify.vl): the binding's own type, for the scalar fast exit and the
  tagged-set rung.
- `letWidensToString`: takes its caller's `fnIx`; a `let` an instance widens to `string`.
- `blockTailIsClosure`: takes the instance `fnReturnsClosure` asks about; the tagged-set
  early-out.
- `fnUnionRetSinkOk` (emit_fn_scans.vl): the instance's inferred return (`inferRetTyIxOf`), with
  the `FuncDecl`'s checked return only where none is recorded.

Left in the group: `assignTargetReReads` (whether the bank records an assignment's place is
unconfirmed) and the four readers handed to lane w321.

**Proof.** No `@run` output changes against the first batch's seed. The corpus oracle
(`cases_wasm_0..3`) passes 7,440, distilled `regress.vl` loses no run, lint-self is clean, seed
size +0.5%.
