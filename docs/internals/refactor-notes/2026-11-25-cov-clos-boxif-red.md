# Box of a valued if: the I8 red list's `??` families (2026-11-25, lane COV-CLOS)

This is the I8 draft's regeneration-6 red list, class `box of a valued if`, which this lane owns.
It was measured on master over the class's program list
(`scripts/ir-i8-census/classes/box-of-a-valued-if.txt`, 32 programs that still exist). Each of the
14 functions that missed was tagged with the statement written below the box lead and with the
box's plan arm:

| sub-family | box arm | statement below the lead | functions |
|---|---|---|---:|
| A | `atom` | a `??` whose arm does not stage its operand's leads (`elem` 3, `optLeaf` 3, `mapIndexGetOr` 1) | 7 |
| B | `nulNiche` | a nested `??` on the `nulRef` arm | 2 (4 sites) |
| C | `atom` | an arm site (`SArmSite`) | 4 |
| D | `RNulNoneBox` | an `if` | 1 |

## Mechanisms

* A: `boxOfJoinAt` let a coalesce follow its operand's own nodes only on a staging arm. The
  lowering already writes the box head ahead of a non-staging coalesce (`stashIfBoxHead` →
  `joinBoxHead`), so the restriction is dropped. What stays is that the nodes before the coalesce
  write no statement (`ifBelowLeadHas`). With `VL_IR_SHADOW=6`, the order check finds no
  mismatch on the class's programs.
* B: a niche box (`nulNiche`, `nulBool`) writes no bytes ahead of its value, but it takes its
  stash slot there (`holeBoxHead`), and that fixes the locals' numbering. `holeBoxHeadAhead` names
  the arms that do anything ahead of their value. `boxOfJoinAt` and the lowering's `joinBoxHead`
  ask it, so the slot is taken ahead of the join, as legacy's rung takes it. `boxOp` already skips
  a head written earlier.

## Class delta (the class's programs, master → head)

| class | master | head |
|---|---:|---:|
| `box of a valued if` | 14 | 6 |
| `string operand after another` | 12 | 16 |

Claimed: `takeF`, `viaU`, `go` and the `@init` of `nullable-scalar-element-coalesce-wider-default`.
Moved on to `string operand after another`: `interp`, `viaHole`, `viaBoolean` and an `@init`. Lost:
0. All 32 programs print their `@log` lines. The arm-site-hoisted-index mismatches under
`VL_IR_SHADOW=6` are the same on master's seed; that program is in the divergence baseline.

Left in the class: C (4, arm site), D (1) and A's `mapIndexGetOr` (1, in an `@init`).

Q58: `tests/cases/unions/coalesce-boxed-under-a-leading-head-positions.vl`. It prints the same
claims-off and claimed. `retU` and `viaNiche` miss this class on master and are claimed here.
`atoms` moves on to `coalesce box after an operand`.
