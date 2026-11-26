# Narrowed field read coercion: a lone literal's field read at its atom (2026-11-26, lane COV-START)

CENSUS's census (fcf003d9) gave COV-START the coercion family of its start list. A scan of
tests/cases, the probes and the distilled cells found four start units of `narrowed field read
coercion`. A scratch build printed both reps at each miss, and every one was the same pair:
- the row stores the field as an atom (the union's literal set);
- the read wants a string, since the narrowed arm types the field at a lone literal (`"end"`);
- the read is itself a literal atom.

## The mechanism

The plain field read admits this pair as `atomStr`: the read is typed at the atom kid, and its
consumer decodes it. The narrowed read (`narrowedFieldPlain`) had no such arm. It now reads at the
atom kid the same way (`narrowedAtomKid`). Its lowering is legacy's narrowed read of the same node.

## Measured

| program | master | head |
|---|---|---|
| `scripts/capability-probes/litunion-mixed-arm-with-bare-literal.vl` | start uncovered | start matched |
| `unions/is-inline-arm-lone-literal-field.vl` | start and 1 function uncovered | matched |
| `unions/struct-arms-inline-literal-tag.vl` | start uncovered | start matched |
| `unions/discriminant-mixed-litunion-bare-literal-arm.vl` | start uncovered | moves to `atom cell local rep` |

- Each prints the same output on legacy and under `$VL_IR_STRICT=1`.
- `distilled/regress.vl`: no runs lost. Its movement list is identical to master's seed.
- The sweep `tests/cases/unions/narrowed-lone-literal-field-read-positions.vl` covers a function, a
  list loop, a module binding, a string binding and a concatenation. It prints the same output on
  legacy and under strict IR, and its start body and function are matched. On master both missed.
