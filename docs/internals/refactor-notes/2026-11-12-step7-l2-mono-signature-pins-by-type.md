# Step 7 L2 §7: a delivered function value's signature pins are its type's parameters under the naming rule; `annFnDecompose` leaves emit_mono, 2026-11-12

Two emit_mono sites built instance pins from the destination's annotation text, through
`annFnDecompose`:

- `monoNoteBindDeliveryCall`: the signature a named hole function takes where a function type is
  delivered.
- `monoDeliverLamLit`: the respelled destination a hole lambda literal is pinned at. It also
  called `annFnDecompose` through `monoFnTypeAnnParamsName`.

#7429's note left them as a floor. Its probe found that the rule's spelling of the parameters
differs from the text in 35 of the 2,581 programs reaching `monoNoteBindDeliveryCall`:

- an alias kept by its text (`string` for a literal alias `K`);
- a record named by its row;
- member order.

The orchestrator approved the swap as a behaviour change, with the `sweep` label and a
before/after output for each program that moved.

The base is #7449, with a fixpoint seed on both sides. The population is the whole sweep: 23,997
programs.

## Changed

- `monoNoteBindDeliveryCall` takes the destination's `TyFunc` (`annTy`) and spells each
  parameter with `monoPinSpellShaped`. A nullable function type still delivers no signature here,
  as the text decomposer declined it.
- `monoDeliverLamLit` adopts the literal's own signature under the gate it had: the same arity as
  the destination's function type, and every parameter spellable. Its pins are that type's
  parameters, spelled by the rule. The respelled text (`tname`, built from `aparts` / `aret`) is
  deleted.
- With no callers left, these go too:
  - `monoFnTypeAnnParamsName`;
  - emit_mono's `annFnDecompose` and `nonNulBaseOf` imports;
  - `monoDeliverLamLit`'s and `monoElabLamArg`'s now-unread `ann` parameters.

## Result

**No program moved.** The sweep is byte-identical, so no output comparison was needed. The 35
spelling differences rename pins that no two instances share, so every instance key still
separates and merges exactly the instances it did. This turned out to be an identity change, and
the PR carries no `sweep` label.

## Proof

- **Byte sweep.** The #7449 fixpoint against the candidate fixpoint: same 23,997, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0;
  - render-parse 13 / 55 (`--findings`);
  - emit_mono's function count 911 (budget 912);
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-helper and pin-spell shadow tests: 7,484 passed.
