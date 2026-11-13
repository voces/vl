# Step 7 P3: emit_base's callerless and unreached spelling helpers go, 2026-11-13

This is lane E's work, from lane F's unreached-site audit (#7759).

## Changed

- Deleted because they had no caller:
  - `nameIsI32KeyedMap` and `isVariantBoxUnionAtoms`;
  - the four `atomTyIs*` helpers that only `isVariantBoxUnionAtoms` used;
  - `nameIsI32HashedLitUnion` (check_ty_rep), which `nameIsI32KeyedMap` alone called.
- `normTypeAtom` is deleted. Its only caller, `pinSpell` (emit_sig_tokens), ran it over its own
  `tyToStr` render. That render is never padded and never wrapped in parentheses, so the trim
  and the paren peel were never reached. `pinSpell` now has a loud floor,
  `PIN_SPELL_PADDED_MSG`. It fires on any render that starts or ends with whitespace or is
  wrapped in `(…)`, a superset of everything the old normalisation could change.
- `render-parse-census.vl` drops `nameIsI32HashedLitUnion` from its parser list, because the
  census refuses to run when a listed parser is declared nowhere.
- Three comments that named `nameIsI32KeyedMap` are reworded (tyname, check_node_tys,
  emit_list_rep).

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `32ab5241` against the candidate: 24,209 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps. The floor
  never fires.
- Render-parse budget, `emit_base.vl` only: `ty-string-parse` 9 → 8, `ty-parse-unclassified`
  4 → 0.
- `scripts/gate.sh`: all rows pass.
