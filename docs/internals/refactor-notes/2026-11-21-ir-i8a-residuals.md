# I8a's residual cell classes: progress cell, an empty `null[]`, omitted fields (2026-11-21, lane IR-D1)

After I8a (#9335), the coordinator gave this lane the constant-cell miss classes no coverage lane
owns. Three of them close here:
- **`progress cell`** (12 programs). A start body's fragment misses where an init-progress cell
  guards global reads, because the start body writes that cell between statements. A constant
  initializer has no statements and reads no global, so the guard no longer applies under
  `gConstExprEmit`.
- **`array null sentinel`** (1 program). An i32 list of `null` elements is seeded with a sentinel,
  which `arrLitShortWhy` refuses. An empty one has no element to seed: its bytes are an empty
  `i32[]`'s, so the refusal now needs `n > 0`. A non-empty `null[]` literal stays a named miss.
- **`object layout`**, the plain struct literal that omits nullable fields (`{ a: 1 }` at
  `{ a: i32, inner: Inner | null }`):
  - `emitObj` writes each omitted field's null with `emitOmittedFieldNull`. The IR now does the
    same through a new node, `ROmitNull { omRow, omField }`, lowered by that writer, which is now
    exported as a shared tail. It is built only where no field's source order is observable
    (`objLitStashes` false), at the literal's own struct row or its destination's.
  - Variant rows and literals that drop fields still miss.
  - It closes the cells and their functions alike, for example `mk` in
    `tests/cases/functions/field-completion-coercion.vl`.
- **`RMakeRec` carries the row its fields were built by (`mrBuiltRow`).** The lowering reads it
  back instead of re-deriving it through eight layout predicates. Those predicates know no
  omitting literal, so without this the lowering failed (`unlowered: record row`) where the
  builder had succeeded.

## Measured vs merge-base 4c186c33 (fixpoint seeds on both sides)

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,556, differ 0; witnesses same 60 |
| `ir-identity.sh --claimless` | identical 14,012, differ 0 |
| `tests/cases` + probes A/B | 7,618 same |
| shipped against claimless, all 26,216 I8-census programs (before the master merge) | 26,216 same |
| const cells, armed shadow over the census programs | 30,543 matched, 0 mismatch; `progress cell` 12 → 0, `array null sentinel` 1 → 0, `object layout` 7 → 4 programs |
| L2 self-compile fuel | 104,282,150,062: −0.6% on the 104,920,663,373 baseline |

Four programs now miss `object field count` rather than `object layout`: literals whose omitting
row passes but whose rep holds fewer fields than the row. That is a named miss, not a new failure.
