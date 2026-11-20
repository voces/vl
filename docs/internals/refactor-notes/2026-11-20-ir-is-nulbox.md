# IR coverage step: an `is` test over a local `U | null` box, 2026-11-20

Lane F2. The top self-compile blocker at master `056fd4af8`, `is box not a local` (53 functions
alone). Measured on fixpoint seeds of this branch and of its merge base, `056fd4af8`, each building
this branch's source.

## Why this class

A scratch probe (pristine seed restored, checked with `cmp`) labelled each `rawBoxVar` refusal: 52
of the 53 were a box local whose IR rep is the `U | null` box (`RNullable`, discipline 4), from the
compiler's idiom `const n = if x >= 0 && x < P.nodes.length { nodeAt(x) } else { null }` followed by
`n is Ident`. Legacy keeps that local as the box itself, `(ref $box)`, with `null` the box's null
tag; its `is` reads the tag and compares it, as for any box. The `RTest` verifier already accepts a
discipline-4 operand; only `rawBoxVar` admitted `RBox` alone.

## What landed

`rawBoxVar` admits a local held as a box (`heldAsBox`: `RBox`, or the discipline-4 nullable). One
line; the comment says why.

## Coverage

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions covered | 18,516 | 18,568 (+52) |

`is box not a local` falls from 56 to 1 in the self-compile (the one left is a declaration that is
no `let` or parameter). Corpus and byte proof: see the PR.
