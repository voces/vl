# L1: five instance reads of an open type read the instance's type, 2026-11-12

Five of the 17 converts that `2026-11-12-l1-instance-reads-classified.md` lists are w318's, handed
to w308. Each now reads `nodeTyAt(x, emitCurFnIx)`, the type the node has in the instance being
emitted, where it read the template's `nodeTyIxOf(x)`. Base is master `ea1e3a11`.

| site | read |
| --- | --- |
| `letStoreHeldTy` (`emit_classify.vl`) | the initializer's own type |
| `objLitTaggedFieldRow` (`emit_classify.vl`) | the record literal's type, and each field value's |
| `ifBuiltAtRecord` (`emit_classify.vl`) | the join's checked type |
| `asExprNumSrcName` (`emit_union_casts.vl`) | the cast operand's type |

## Grading

- **The probe:** a scratch build ran each function both ways in every program and marked any where
  the two answers differ. Over 23,925 programs:
  - the four `emit_classify.vl` reads differ in **0** programs;
  - `asExprNumSrcName` differs in **5**, and each of those modules builds byte-identical on
    the candidate.

  The probe's own marks are its control. The sixth convert it fired on is below.
- **`nodeTyIsUnionRow` stays on the template, by design.** Read at the instance type, it plans a
  shared-field read for `u is B` inside `f<T>`. Because `u` is stored from the template (D14487),
  `tests/cases/generics/instance-recheck-agrees-with-template.vl` builds an invalid module. #7329
  regrades it.
- **The local sweep:** fixpoint seeds on both sides, base `ea1e3a11` (6,633,237 bytes) against head
  (6,633,252 bytes). **23,933 of 23,933 same**, with 0 bytes-only movers.
- **Gates:** each exits 0.
  - lint-self (`self-lint + fmt-check clean`) and rep-fuzz (exact);
  - `ladder-sets`;
  - the dead-export (0) and render-parse (28 / 59) budgets, each through `--findings`;
  - seed size +0.7%, and late demands 6 against a baseline of 6;
  - probe-rollback, `cases_wasm`, and distilled `regress.vl` with no runs lost.

L1's remaining converts are the 10 `arrLit*` producers (w311) and #7243's two empty-`[]` readers
(w318).
