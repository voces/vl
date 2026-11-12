# L1: the empty `[]` readers read the instance's list type, 2026-11-11

The fourth batch of `2026-11-11-l1-instance-readers-classified.md`'s "should read `nodeTyAt`"
group: two of the four readers handed to lane w321.

- `emptyArrHoleElemSlot` (emit_obj_lit_fits.vl) and `emptyArrHoleKind` (emit_ref_list_kinds.vl)
  read the empty `[]`'s type at the instance, `nodeTyAt(ax, fnIx)`, and take `fnIx` from their
  callers (`emitArrUnder`, `ifExprRefSlot`, through `emptyArrHoleBuildKind` and
  `emptyArrHoleBuildSlot`).
- w321 measured the producer side over `tests/cases` and the distilled named cells: of 302
  reaches at an open `T[]`, the elaboration already records a closed type at every instance in
  286 (64 programs). The other 16 (3 programs: an unbound type parameter, and two `is`-list
  tests pinned through a literal) have no record and keep the checked type.

The other two w321 readers: `emitCoalesceGo`'s minted `??` links are typed at the instance by
their producer (w321, #7241), so their reader needs no change. `cloCallSigKey`'s capture-cell
read is a floor: every reach is a cell holding a hole lambda in a non-generic function, which
has no instance to bank.

**Proof.** No `@run` output changes under `tests/cases`. The corpus oracle (`cases_wasm_0..3`)
passes 7,440, distilled `regress.vl` loses no run, lint-self is clean, seed size +0.5%.
