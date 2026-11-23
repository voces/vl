# Legacy: a `??` over a field of an effectful receiver evaluates it once (D17036, 2026-11-21, lane IR-N1)

The coordinator's ruling on the `coalesce niche litUnion` blocker: the IR copies no defect, and
it takes no byte divergence from legacy. So legacy's re-evaluation (D17036) is fixed first, and the
IR owns the arm afterwards as the fixed legacy writes it.

## The change

`emitCoalesceNiche`'s `K | null` (`litUnion`) and `boolean | null` (`nulBool`) arms re-read their
left operand in the present arm, unless `lhsReEval` was false, which held only for a call or an
`if`. `coalLhsStashes` (`emit_query.vl`) is now the one predicate. It is true for a call, an `if`,
or a field read whose receiver is no re-readable place (`unionEqOperandOk`), and both readers ask
it:

- `emitCoalesceNiche`, for `lhsReEval`;
- `coalChainHasCallLhs`, the scratch scan that reserves the per-function coalesce stash frame.

The scan reserves on syntax, without the arm, as it already does for a call-left `??` (it
over-approximates, `emit_state.vl`): a `??` whose left operand is a field of a call reserves the
frame even where its arm (a nullable scalar box, a string) evaluates the operand once anyway.
Those functions gain three unread locals. That is the only byte move outside the stashing arms,
and it is confined to functions holding such a `??`.

## Witness

`tests/cases/null/coalesce-niche-field-receiver-once.vl`: `f().k ?? "a"` (present and `null`),
a method receiver `o.m().k`, and `f().f ?? false` count their calls. On master the counts are
2, 3, 5 and 7 (each present field re-runs its call); with this change, 1, 2, 3 and 4. D17036 is
closed and grades `runs`.

## Measured vs merge-base `4c186c336` (fixpoint seeds on both sides)

Legacy's bytes move by design, so every mover is named. Each holds a `??` whose left operand is a
field read of a receiver that is no re-readable place:

- **Self-compile**: 5 functions, each `repOfTy(…).rdKind ?? <literal>`: `njStash`,
  `emitNumUnionBin`, `njConvertArm` (`wasmEmit.vl`), `fieldLitTyIn` (`emit_rep.vl`) and
  `repABDescWord` (`emit_ref_list_kinds.vl`). `repOfTy` now runs once at each.
- **`tests/cases` A/B**: 23 files differ, the witness included, and 8,648 are the same; no exit
  code changes. In 22, a function holds such a `??`. Some move only in the stash frame's three
  locals: `functions/field-completion-coercion.vl`.
- **Corpus `--names`**: 4 cells differ (`ckb_bound_wider`, `d15172_listviafield`,
  `d15172_viafield`, `d15314_fn_union_nested`), the same shape. 9,033 are identical.
- `--cases` (IR claims against a claimless build of the same tree): identical 7,557, differ 0;
  witnesses 60 same.
- IR coverage is unchanged, as expected for a legacy fix: self-compile 19,238 covered = matched,
  corpus 43,118, `tests/cases` 57,390 / 57,379, mode 3 identical with 19,218 claimed.
- L2 fuel 104,228,054,057 → 104,234,910,901 (+0.007%).
- Inventory: `check-filed-witnesses --strict` grades 5,550 rows as filed, 0 MOVED.
