# A null-only list literal's niche element is built at the niche's own null (lane COV-START, D17673)

**What.** `nulSentinelElem` took only an i32 element and missed `array null sentinel rep` for a
niche nullable element (`boolean | null`, a literal set's `| null`). It now delivers the `null` at
that element rep. Legacy writes the i32 2 for every such element. That is the right null for
`boolean | null`, but for a literal set the 2 reads back as an atom, so legacy was silently wrong
(clause 1) wherever the list is delivered into a union. Plain lists take another path and were
right.

**Measured.**
- The three regen-10 `array null sentinel rep` units are now claimed: `d16314_bool_el`,
  `fz2_e_bool_elem` and `d16314_lit_union_el`, each `@start`. The bool ones match legacy's bytes,
  and the literal-set one is the legacy-wrong divergence.
- `ir-identity.sh --cases`: 0 differ; behaviour 163 programs, same 162, and the one difference
  is the new fixture (legacy prints `false` for `r[0] == null`). It is listed legacy-wrong
  (`__start__@1`, `f`).
- On master 64eac6aa0 the witness prints `b`; with the change it prints `none`.
