# Step 7 L6 (lane G, #13 P2 step 2a): a primitive's box kind is read off its type, 2026-11-13

P2 step 2 moves the emitter's remaining `valueAtomKind(text)` sites to the type. This first family
is the three sites that parse a primitive's own name, where the type is already in hand:

| site | before | after |
| --- | --- | --- |
| `memReadBoxedAtomKind` (emit_classify) | `valueAtomKind(t.primName)` | `boxTagOfTy(cty)` |
| `memReadCheckerAtomKind` (emit_union_casts) | `valueAtomKind(t.primName)` | `boxTagOfTy(cty)` |
| `njKindOfTy` (wasmEmit) | `valueAtomKind(primNameStr(p))` | `boxTagOfTy(t)` |

## Measurement

A probe at all three sites, over the corpus population (every test case and filed witness),
compared `boxTagOfTy(ty)` with the parsed answer: **0 disagreements**.

The render-parse baseline loses the three entries: emit_classify `ty-parse-unclassified` 2 → 1,
emit_union_casts 1 → 0, wasmEmit 10 → 9.

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, and the comment, ladder, sentinel, scan and render-parse budgets.
- **The full sweep:** CI's `sweep` label.
