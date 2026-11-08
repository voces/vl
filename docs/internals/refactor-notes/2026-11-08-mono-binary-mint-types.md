# Step 7: the monomorphizer's re-made `+` carries its type, 2026-11-08

[The instance re-check note](2026-11-08-step7-instance-recheck-classifiers.md) found `+` nodes with
no type at all, and gave `exprIsStrConcat` a fallback that applied the checker's rule to the
operands. The nodes came from three places in `emit_mono.vl` that re-make a binary over cloned
operands: `monoCloneGenericBinArm`, `monoPinBin` and `monoFoldLayoutBin`. Each called `mkBinary`
and recorded nothing.

## Change

The three sites now share `monoRemintBin`, which re-makes the node and then calls
`nodeSrcNote` and `nodeTyCarry` from the node it replaces. This is the pattern the
neighbouring mints already use (`monoRemintCompound`, `monoRemakeListLitTpl`). The copy keeps
the operator, so it has the same checked type. `exprIsStrConcat` now reads only
`tyIsConcatStr(nodeTyInOf(...))`, and `concatOperandIsStr` is deleted.

## Shadow

This was a scratch probe and is not committed. It noted each `exprIsStrConcat` read that
took the fallback, split by whether the type was absent or open, whether the node had a
`nodeSrc`, and what the fallback and the direct read answered. It ran over the 5,876
`tests/cases` programs with `@run`/`@log` and the 11,811 distilled `cells/` + `named/`
programs, each built under `$VL_REP_SHADOW`.

| seed | no type | open type | fallback ≠ direct |
| --- | --- | --- | --- |
| control (this tree, the three mints reverted) | 285 reads, 42 programs | 45 | 284 |
| this PR | **0** | 45 | **0** |

The distilled corpus has 0 reads in both rows. The 45 open reads are in 10 programs. Each is a
`+` whose checked type is an unsolved type variable: a hole parameter, or a generic read out of
an un-annotated `Map()`. Neither answer is a string there, so deleting the fallback changes no
answer. 44 of the 45 are checker nodes. The other one is a re-made node that carries its
template's open type.

## Other mints with no type

This was a second scratch probe at `monomorphize`'s exit. It counted the nodes minted during
mono that have neither a type column nor a `nodeSrc`, over the same 5,876 programs:

| kind | nodes | programs | candidate sites (read from the code, not measured) |
| --- | --- | --- | --- |
| `Ident` | 4,562 | 869 | instance callees (`mkIdent` + `identFromDecl`) |
| `Index` | 134 | 46 | clone/pin walkers, `monoCopyCellRead` on an untyped read, the kept flow reads |
| `BoolLit` | 17 | 7 | `monoDeadNullTest`'s fold |
| `Member` | 13 | 3 | clone/pin walkers, the callee re-make |
| `Call` | 3 | 3 | `monoPinBin`'s operator call (D511) |
| `Unary`, `Paren` | 1 each | 1 each | clone/pin walkers |
| `BinExpr` | **0** | | |

These are not fixed here. The `Ident` callees need the instance's function type, not the
template's. The rest spread over about ten sites, some of them in the hole-binding family.

## Proof

Both seeds are fixpoints. Base (master `2ec34b26`) is 6,531,436 bytes and the candidate is
6,531,283 (−153). SWEEP
