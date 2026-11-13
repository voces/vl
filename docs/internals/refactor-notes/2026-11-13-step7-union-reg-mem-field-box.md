# Step 7 L6 (lane G, cut 9a): a field read's union box is named off its element type, 2026-11-13

The base is master `ce4e98ce`. `memberUnionFieldNameRead` names the union box a field read yields.
It has six consumers: `memReadBoxedAtomKind`, `exprUnion`'s member rung, `unionNameOfExprGo`,
the shared-field plan, `memReadBoxedAtomKinds` and `coalBoxFieldScalarKind`.

It read the name columns `sFieldElemNameAt` / `variantFieldElemName`, the narrowed read's
spelling (`memReadBoxNarrowName`), and the shared plan's member spelling. Lane F found it while
mapping the `sFieldElemName` readers.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded at every
rung the type it already held: the struct field's or variant field's element type, the narrowed
type, and the shared join's read type. It compared the old name against `unionNameOfTyForBox` of
that type. It ran over the sweep list (24,170 programs, 194,934 calls).

| answer | calls |
| --- | --- |
| no union | 179,172 |
| same name | 15,307 |
| same row, other spelling | 187 |
| type-only gap: the shared-plan rungs, where the probe held no type | 77 |
| another spelling of the type's union: alias against render (`{c2:i32}\|{s2:i32}` → `Shape2`), member order | 191 |

## Changed

- The struct, variant and narrowed rungs name the box with `unionNameOfTyForBox` of their type.
- The shared-plan rungs read the first boxing member's element type, through
  `sharedPlanBoxTy` / `sharedPlanOneBoxTy`, which replace the name-returning
  `sharedPlanBoxName` / `sharedPlanOneBoxName`. Two members store one box when their element
  types are `tySame`.
- `emit_classify` no longer reads `sFieldElemNameAt` or `variantFieldElemName`.

## Proof

- **Seed:** fixpoint.
- **The full sweep:** CI's `sweep` label. The 191 respellings are graded on its movers.
