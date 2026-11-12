# Step 7 L2 §7: `monoClosedTyName` hands its names their type, and a loop value's carrier is substituted by type, 2026-11-12

Two of this lane's queued sites. Both are byte-identical.

The base is master `e3c63e35`, with a fixpoint seed on both sides. The population is the whole sweep:
23,984 programs.

## `monoClosedTyName`'s five pin names take `ty`

w310 handed this one on: emit_mono callers that pass a registry row's name to `monoAnnPinName`
as a bare spelling (`ty = -1`). Every name `monoClosedTyName(ty)` hands `monoAnnPinName`
spells `ty` itself:

- the struct row recording `ty`;
- the union row `unRowOfTyKey(ty)` finds;
- `ty`'s nullable;
- `ty`'s list, in either of two spellings.

All five now pass `ty`, so `monoAnnPinName`'s typed rungs answer where its untyped ones did.
Swept alone, the change gives same 23,984, bytes-only 0.

## The loop value's carrier: the floor #7401 named is gone

#7401's note put `monoSubstLetType`'s last `monoSubstAnn` fallback on a parser-synthesized
`T | null`. That attribution was wrong. The `let` comes from emit_rewrite: `lvBuild` builds a
loop value's carrier, and when the carrier's type holds a type parameter, its TypeRef is typed -1.
The open type is recorded beside it with `monoAnnOpenTyNote`, and emit_base already reads it back
with `monoAnnOpenTyOf`.

`monoSubstLetType` now reads that note when the annotation has no type, and substitutes it like
any other. Changed:

- the `monoSubstAnn` fallback is deleted;
- `monoSubstLetType`'s and `monoCloneLetDecl`'s `tvN` / `tvV` parameters, now unread, are
  deleted;
- `loops/loop-value.vl` runs through the typed path.

emit_mono now has one `monoSubstAnn` call left: w321's `is` arm.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: same 23,984, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **render-parse** is 13 / 55 (`--findings`). The baseline is not written here, per the L2
  policy.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0, late demands 6;
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-spell shadow, pin-helper and render-parse budget tests pass.
