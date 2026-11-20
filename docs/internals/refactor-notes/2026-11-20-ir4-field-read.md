# IR: a nullable field narrowed past its null reads at its inner rep (2026-11-20, lane IR4)

`field read coercion` was 30 uncovered self-compile functions and 59 corpus + cases sites at
merge-base 938a58be3. The self-compile sites were all one shape: a field typed `K | null` (a
nullable atom) read where the checker narrowed it to `K`, as in
`if rd.rdKind != null { return rd.rdKind }`. The corpus shapes, field rep to read rep:

| shape | sites |
|---|---:|
| nullable → record | 22 |
| nullable → str | 17 |
| nullable → closure | 8 |
| nullable → list | 4 |
| nullable → map | 4 |
| nullable → atom | 2 |
| closure → closure | 2 |

Origin: 58 from tests/cases, 1 from a distilled cell.

## The change

- **`buildMember`** admits a field whose kid is `RNullable` with `rnInner` equal to the read's rep.
  It builds the `RGetField` temp at the read's rep.
- **The verifier's `RGetField` rule** admits that one pairing.
- **No new node.** The IR lowering's `fieldTail` already ends in `readOwesNonNullRecover` →
  `ref.as_non_null`, the read's own recover, as legacy's member read writes it. So legacy's own
  decision writes the bytes, and the IR decides nothing from the rep.
- The closure → closure pair stays the named miss.

**Why the per-shape table is the evidence.** A first draft recovered with an extra `RRecover` node,
and it matched all 30 self-compile sites. It matched only because they are atoms (disc 3), whose
recover writes no bytes. On a string or record niche it would write `ref.as_non_null` twice. The
self-compile count could not see that, so the grading is per shape.

| shape (base field-read-coercion files) | mismatch | fail |
|---|---:|---:|
| record (15 files) | 0 | 0 |
| str (12) | 0 | 0 |
| closure (5) | 0 | 0 |
| list (3) | 0 | 0 |
| map (2) | 0 | 0 |
| atom (2) | 0 | 0 |

**Positions.** Two capability-matrix templates, each with GUARD narrowing and VALUE the field read:
`narrowed-nullable-str-field` and `narrowed-nullable-record-field`.
- Every built-in position runs in both faces, before and after: 62/62.
- The un-annotated face of `binding` is the narrowed read into an untyped `const`.
- On the str template's cells under the shadow, `field read coercion` falls 10 → 0 and covered =
  matched rises 4 → 14.

## Measured

Fixpoint seeds: merge-base 938a58be3 against this branch.

| | merge-base | this branch |
|---|---:|---:|
| corpus + cases covered = matched | 94,420 | 94,467 (+47) |
| corpus + cases start matched | 10,381 | 10,384 (+3) |
| `field read coercion` (corpus + cases, functions + start) | 59 | 2 |
| self-compile covered = matched | 18,581 | 18,609 (+28) |
| self-compile `field read coercion` | 30 | 0 |

No row reads `fail`, `mismatch` or `differ` that the merge-base lacks.

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `--cases` | identical 7,527, differ 0; witnesses 59/59 |
| master-vs-head A/B, 7,595 programs | built 7,527, differ 0 |
| mode 3 | identical; claimed 18,581 → 18,609 |
| L2 fuel | -0.004% on the merge-base |
| plumb-shape cost | ok |
| `gate.sh --fast` | passed |

**Lines: compiler +11 / −4, matrix templates +53.**
