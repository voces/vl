# Step 7 L2 §7: a pinned list of a union registers its element by the element's type, alias or inline, 2026-11-12

`monoPinMintedUnion` asked emit_base's `parenUnionArrElemName(name)` whether a pinned annotation
is a list of a boxed value union. The predicate answered from the spelling: an inline
parenthesised union element (`(A | B)[]`) counted, and an alias-named one (`AB[]`, `Shape[]`)
did not, though both rep as the same box list.

#7484's note left it as a floor. The orchestrator then ruled that an alias-named union list
registers as its inline twin: D15761's one set, one row, applied to lists.

The base is master `377a45c9`, with a fixpoint seed on both sides. The population is the whole
sweep: 24,040 programs.

## Changed

- `monoPinMintedUnion` asks the type: the element of `ty` is a union, or a nullable whose inner
  type is not one of the niches (`boolean`, `string`, a literal union).
- That element is spelled by the naming rule for the `(pc)[]` registration the inline spelling
  already took.
- emit_mono no longer calls `parenUnionArrElemName`.
- The new fixture `generics/alias-named-union-list-in-let-union-runs.vl` reads a let union over
  `Shape[]` and over `(Circle | Square)[]`.

## Result

The swap is byte-identical over the whole sweep and on the new fixture. No program that reaches
the path has an alias-named union list whose registration differs from its inline twin's.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: same 24,040, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **Fixture:** prints `2 2 2` on master and candidate, and its module is identical.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0;
  - render-parse 13 / 55;
  - `cases_wasm_*`, pin-helper and the new fixture pass.
