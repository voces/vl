# STORE: `elabCallArgSetTy` keys a holder of a tagged set at any depth (2026-11-19)

This is split out of the held-set instance key stage (D15900; `store-b3-held-key`) so F2's map-of-`V`
instance (D14433, D17014) can build on it now. The coordinator ruled that one function answers "a
call argument holding a tagged set is keyed at the set" for function value, list, record and map,
and that STORE writes it.

## Change
`elabCallArgSetTy` (emit_elab.vl) tested an argument with `fnTagListTy` (a list, or a list of lists,
of a tagged set). It now tests it with `fnTagHoldsTy`: a list, record or map holding a tagged set's
ids, at any depth. The test is the same at both returns: the argument's own type, and the calling
instance's type for a parameter handed on. No decision change; the unused `fnTagListTy` import is
dropped.

## Measured (master fixpoint vs this branch's fixpoint)
- Late tag rows: unchanged (307).
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics byte-identical.
- Full @run A/B over 6,769 programs: 0 RC, wasm or output movers. No corpus program hands a record or
  map holding a tagged set to a hole parameter today; the change is the key the two stages above
  need.
- `gate.sh`: every row passes except lint-self, which flagged the unused import. The import is
  removed; the seed is byte-identical to the measured one, and lint-self is clean.
