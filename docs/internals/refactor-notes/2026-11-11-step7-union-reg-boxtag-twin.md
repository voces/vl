# Step 7 L6: `boxTagOfTy`'s render fallback is a member-equality question asked of the type, 2026-11-11

The union registry census (`2026-11-11-step7-union-registry-census.md`, D4320 and cut order
item 5) leaves one rep question that is decided before any row exists: whether a union whose
members share a list or closure tag (7, 9, 11, 18) boxes as one atom. `btOfTy` returned -2 for
those, and `boxTagOfTy` answered by rendering the type and asking `valueAtomKind` of the
spelling. The census names the question: is every member the same value once numeric literals
are their base? This PR asks that of the type.

The base is #7170 (cut order item 5, first part) merged with master `2842f92a`.

## Changed

- **`btSoftOfTy`** (`emit_rep.vl`) replaces `valueAtomKind(tyToEmitName(ty))`. It flattens the
  union's members, with a nullable's inner and `null` and nested unions flattened. Each numeric
  literal or numeric-literal union is taken as its base, and a member equal to an earlier one is
  dropped. One member left answers that member's tag. For a list over a union element, the one
  element left answers that list's tag. Any other result is -1.
- **Equality** is `repCanonId` with two exceptions. Lists compare by element, softened the same
  way. A literal, or a union holding one, compares by `tySame`, because the canonical id folds a
  string literal to `string`. Without that exception `S[] | J[]` over two string sets read as one
  atom list (7). This is the D4320 split the literal ruling keeps.
- `emit_rep.vl` no longer calls `tyToEmitName`. The render-parse baseline goes from 38 to 37 in this PR.

## The reading

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded the render's
answer and the twin's at every fallback reach over `tests/cases` (7,725 files):

| | reaches | programs |
| --- | --- | --- |
| fallback reached | 17,631 | 418 |
| render answers -1 | 17,630 | |
| render answers 7 | 1 | |
| twin disagrees | **0** | 0 |

The first twin, before the literal exception, disagreed on 16 reaches in 8 programs. Three
were `K[] | J[]` (7 against -1). The other 13 were a -2 leaking out of `btOfList`, which now
answers -1.

## Proof

- **Bytes.** Every `tests/cases` file (7,725) was built with #7170's merged L1 seed and with this
  candidate's L1 seed. 7,725 of 7,725 are the same: exit code, module bytes, and the diagnostic
  with digits erased. CI's sweep grades the whole population.
- **Locally:** one refresh, lint-self (clean), rep-fuzz, distilled `regress.vl` (no runs lost; its
  2 other movements are on master too), seed-size (+0.4%), late-demands (6, the baseline), the
  dead-export and render-parse budgets, and `vl_scaling_shape`.
