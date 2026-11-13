# Step 7 L6 (lane G, #13 P2 step 2b): a shared field's box kind is read off its type, 2026-11-13

`sharedFieldArmAtomKind` (emit_obj_lit_fits) decided the scalar box kind a shared variant field is
stored at by parsing the field's text (`valueAtomKind(sFieldTyText[at])`). It was the last reader of
the variant field-text column that decided anything (lane E's #7795, #7802). It now reads the
field's type off its variant's record type, `tyFieldTyOf(uVarTyIx[vi], armFieldNames()[at])`, and
takes `boxTagOfTy` of it, the pattern of `variantRowFieldTy` in emit_variant_sig. Its bounds
check, and `sharedFieldLitArmKind`'s, no longer read the column's length.

## Measurement

A probe at the site, over the corpus population (every test case and filed witness), compared
the typed answer with the parsed one, after the same exclusions (union-box, literal and
literal-union fields) and the same `0..5` scalar filter: **0 disagreements**.

emit_obj_lit_fits no longer reads `sFieldTyText`. Only the column's writers remain (emit_collect,
emit_union_atoms), and lane E deletes them. The render-parse entry leaves the baseline.

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, and the comment, ladder, sentinel, scan and render-parse budgets.
- **The full sweep:** CI's `sweep` label.
