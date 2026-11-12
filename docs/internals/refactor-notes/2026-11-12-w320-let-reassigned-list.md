# A `let` list binding reassigned list literals is built at the wider list it is delivered to, 2026-11-12

Lane w320. Check only. Row D15871 (w315's, the reassigned face of D3340).

**The defect.** D3340 lets an un-annotated list literal binding adopt the list it is delivered
to. A `let` reassigned another list literal was read as possibly holding a non-literal
(`recBindReassigned` admitted only an object literal assignment), so `let q = [{ v: 1 }];
q = [{ v: 3 }]; const ds: D[] = q` was judged at its own type and refused.

**The change.** `recAsgStoresLit` (check_rec_fresh.vl) admits a list literal assignment too. For
the container floor, `recLetListLits` (check_fit_rules.vl) names a `let`'s literals, its
initializer and each one assigned it whole, and `listWidenWalk` judges each by its own
expression, as it follows a `const` to its one literal; a `let` sharing a list another binding
also delivers at its own type is still refused by the kept-alias rule.

**Proof.** `let-reassigned-list-into-wider-list.matrix.vl` (new): 19 of 46 before, 45 of 46
graded; the annotated `return_inferred` cell is D15894 (filed here: a `let` returned by an
inferred function is refused, reassigned or not, master too). Fixture
`let-reassigned-list-built-at-wider-list-runs.vl`.
