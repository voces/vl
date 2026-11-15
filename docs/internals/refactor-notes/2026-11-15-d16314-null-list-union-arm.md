# D16314: a null-only list literal boxes at the arm it is delivered to

2026-11-15, lane I. The checker stamps a list literal delivered to a union at the list member it
fits (`listLitUnionArm`, `recordRepTyAdopt`), so `[null]` into `(string | null)[] | boolean` is
stamped `(string | null)[]`. The atom ladder that builds its union box (`coerceValueAtomKind`)
classified it by the node's own type, `null[]`, which rides the `(boolean | null)[]` storage
(code 18, D4671): the union has no box for it, and emit refused.

- One fact, read where it is needed: `nullLitDeliveredTy` (`emit_classify.vl`) is the stamped
  list of a literal whose own element is `null`, -1 otherwise. The three readers that classify a
  list's atoms read it before the node's own type: `exprListRep` (string / ref lists),
  `exprBoolListCode` (boolean lists and the null-unit code) and `exprIsAtomList` (literal-union
  lists). A union whose list member holds `boolean | null`, `i32 | null` or a record ran already
  because code 18 or the i32 list is that member's own storage.
- The checker is unchanged. A value `if`/`match` tail `[null]` stays a check reject the design
  owes (D4190).

Measured on fixpoint seeds (master `172729d83` vs this branch): the 21-cell named set
`d16314-null-list-union-arm`, all `runs` (19 refused or silent on master); `fz2_e_witness` loud
emit reject → runs; regress runs → not-runs 0; capability probes 243 of 247 both. Pin helpers
(`emit_mono.vl`): 908 → 908.
