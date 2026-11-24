# IR-N3: `atom cell local rep` — a `const` joining const-bound literals, held as the set's atom (2026-11-24, lane IR-N3)

An un-annotated `const` bound to a join of two or more const-bound literals
(`const M = if c { A } else { B }`) keeps the join's literal set (`constBindsLitSet`, D14757): legacy
holds its cell as that set's atom (`letBindIsAtom`), though the checker types the binding `string`.
The IR declared the variable at `string`'s rep and missed (`atom cell local rep`).

## One decision (`letAtomCellTy`, `constLitSetTy`)

`letAtomCellTy` (emit_classify, beside `letBindIsAtom`) is the type legacy's atom cell holds: -1
unless `letBindIsAtom`, then the set `constLitSetTy` names, else the binding's own type.
`constLitSetTy` (check_leaf_steps) is `constBindsLitSet`'s body returning the set, and
`constBindsLitSet` is now `constLitSetTy(ix) >= 0`, so the rung and the type are one function;
emit_classify imports it in `constBindsLitSet`'s place (phase-state surface unchanged).
`irBDeclVar` declares the variable at that type where its rep is the atom.

Consistency: a probe in `irBDeclVar` reading `letBindIsAtom(d) != (letAtomCellTy(d) >= 0)` found 0
disagreements over tests/cases and the self-compile; its inverted control fired on the witnesses.

## Reads

A read where the text is wanted (print, concat, interpolation, a captured read) decodes the atom
as it did (`atomAtStr`). An `==`/`!=` with such a side misses (`compare of a joined const atom`):
legacy declares a string compare's locals for it that no IR compare route declares, so claiming
it would move bytes. `.length` and `is` over it miss at `narrowed read`.

## Grading (fixpoint seeds on master 26a9bee97, each built in its own tree)

| family | programs | after |
|---|---|---|
| A: capture-sweep-shape3-* | 10 | 9 covered, matched; `union-arg` stops at `box atomAsStr` |
| B: const-literal-* / is-const-literal-* | 4 | declaration covered; reads stop at `compare of a joined const atom`, `narrowed read`, or a start's `pre-path atom hook` |
| C: asg-into-nullable-atom-{local,field} | 2 | unchanged (`atom cell local rep`): the `K \| null` cell's type is no atom rep |

tests/cases (mode 1): covered and matched 82,725 → 82,737; `uncovered atom cell local rep` 19 → 2.
Template `scripts/capability-probes/matrix/const-literal-join-local-read.matrix.vl`: RUNS 68 of 68
before and after; module-scope cells stay at the global's `pre-path atom hook`; in-function cells
9 of 14 covered, the 5 capture cells' un-annotated face stops at `print operand rep` (capture
binding shape 3's print decode, FREE).

## Legacy tails the IR calls

None new.
