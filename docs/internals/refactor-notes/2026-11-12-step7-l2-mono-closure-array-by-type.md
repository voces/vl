# Step 7 L2 §7: emit_mono asks whether a parameter is a list of functions by its type, 2026-11-12

w310 is retiring emit_base's spelling predicate `nameIsClosureArray`. Two of its callers are in
emit_mono:

- `monoCallGenFnToTyParamArrow`: the D3913 arm, a list of functions riding the type parameters
  that is handed a literal of generics. It asked `nameIsClosureArray` of the parameter's declared
  spelling (`monoDeclAnnName`).
- `monoPinTyParamComposite`: the coercion gate at `pinC`. It asked `nameIsClosureArray` of the
  pin's spelling.

The base is #7413, with a fixpoint seed on both sides. The population is the whole sweep: 23,984
programs.

## Probed

The probe ran in a scratch compiler (#7119's accumulator). It evaluated both forms at each site:

| site | reached in | typed answer differs |
| --- | --- | --- |
| D3913 arm: `nodeTyIsClosureArray(p.parType)` | 5,810 | 0 |
| `pinC`: `pinC == pinPlain && tyIsClosureArray(po)` | 413 | 0 |

At `pinC`, the typed form is gated on `pinC == pinPlain`. A rest-union or row pin that replaced
the spelling is never a list of functions, and the probe holds that gate.

## Changed

- `tyIsClosureArray(ty)` is the type form of `nodeTyIsClosureArray` (`check_node_tys.vl`).
  `nodeTyIsClosureArray` now delegates to it.
- Both emit_mono sites ask by type.
- The D3913 arm's `monoDeclAnnName` read, which was read only by that predicate, is deleted.

emit_mono no longer calls `nameIsClosureArray`. Its callers left are `emit_shape_rows`'s two.

## Proof

- **Byte sweep.** The #7413 fixpoint against the candidate fixpoint: same 23,984, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0;
  - render-parse 13 / 55 (`--findings`);
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-helper and pin-spell shadow tests: 7,475 passed.
