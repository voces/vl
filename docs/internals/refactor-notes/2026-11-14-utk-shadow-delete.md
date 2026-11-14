# The type-key shadow harness deleted, 2026-11-14

Lane D, the first of two steps toward D16025. The second gives each type key one row and drops
`unRowBySid`.

## What went

- emit_union_tykey.vl: `unTyKeyShadow`, `unTyKeyShadowSweep`, the `UTK_*` root and outcome tags,
  `utkCnt` / `utkNe`, `utkBump`, `utkTagName`, `utkOutName`, `unTyKeySiteTag`, and the
  `unTyKeyTag*` getters.
- emit_collect.vl: `registerInlineUnionAt`'s offer to the shadow.
- emit_sections.vl: the sweep call.
- emit_mono.vl: `monoShTag` / `monoShTy` / `monoShStage`, `monoShParNode`, the `monoShPend*`
  queue and its flushes in `monoMakeInstance`, `monoShOffer`, and `monoPinMintedUnion`'s `shTag`
  parameter. The name-shadowing helpers (`monoShAlias*`, `monoShadowRename`, `monoShAdd`) have
  nothing to do with the harness, and they stay.
- scripts/emitter-state-audit.vl: the `monoShPend*` exemption.

Every deleted path returned early unless `unABOn()` was set. The rest of the A/B harness
(`unABMode`, the `collectTyReachRegister` memo bypass) is a separate instrument and stays.

## Evidence

- The seed reaches a fixpoint: a second `refresh-compiler.sh` is `cmp`-identical.
- Every program in `tests/cases` plus distilled `cells/` and `named/` (19,754 programs) builds to
  the same bytes under master's fixpoint seed and this one, and the refusals are identical.
