# Step 7 L6 (lane G, cut 3b): a delivered box's retag is decided from the two union types, 2026-11-12

The base is master `2c252adf`. This is cut 3 of lane G: the registry's two type-string parses,
`unionSetAtomsOf` (`splitUnionAtoms`) and `unionSetMemberCount` (`unionMemberCount`).

## The parses, per caller

A probe compiler, built in the scratchpad and never refreshed into a seed, tallied each split
fallback with its caller's `file:line`. It reported all of them once, at the end of
`emitProgram`. A first probe that failed at each hit saw only the first per program, since
`emitFail` keeps one message. The population is the sweep list, 24,020 programs graded, on
master `cf01f012`.

| caller | lane | calls (programs) |
| --- | --- | --- |
| `unionSetMemberCount`, `emit_shape_intern` (the deep walk's union test) | E | 743,774 (17,866) |
| `unionSetMemberCount`, `emit_shape_intern` (the closure-result walk) | E | 33,028 (2,615) |
| `unionSetMemberCount`, `emit_shape_intern` (the arm walk) | E | 10,931 (2,596) |
| `unionSetAtomsOf`, `monoPinUnionName` | D | 5,353 (2,099) |
| `unionSetAtomsOfTy`'s fallback (`registerInlineUnionGo` and `collectDeclaredUnion`) | G | 3,024 (1,858) |
| `unionSetAtomsOf`, `emit_shape_intern` (the union arms) | E | 1,845 (491) |
| `unionSetAtomsOfTy` handed no type | G | 889 (300) |
| `unionSetAtomsOf`, `emit_mono` (the substituted member) | D | 872 (511) |
| `boxRetagNeeded` (both sides) and `emitBoxAtomRetag` | G | 495 (about 170) |
| `unionMemberAtomsOf` | G | 181 (50) |
| `unionSetAtomsOf`, `emit_mono` (the pin's part) | D | 126 (76) |
| two more `emit_shape_intern` sites | E | 47 (12) |
| `collectDeclaredUnion` | G | 19 (16) |
| `unionSetNonNullCountTy`, `unionSetHasAtom` | G | 9 (5) |
| `unionSetMemberCount`, `emit_shape_rows` | F | 3 (3) |
| `unionSetAtomsOf`, `emit_map_value_slots` | H | 2 (1) |

Every other caller reached no split. It is still keyed by the spelling's row. The typed reader for
the other lanes' callers is `unionTyArms(ty, atoms, tys)` (`emit_map_twins`). It returns the keyed
row's recorded arms, else the type's own members. A count is its `atoms.length`.

## This cut: `emitUnionBoxArg`'s retag

`emitUnionBoxArg` asked `boxRetagNeeded(unionNameOfExpr(..), unionName)`, which split both
spellings. The value's union type is `unionBoxTyIxOfExpr`, `unionNameOfExpr`'s typed twin. The
destination's is the `unionTy` the box is built at. A second probe compared the name decision with
the decision from the two types' arms (`unionTyArms`), over the same population on master
`65e121b8`:

| case | calls | programs | the names said |
| --- | --- | --- | --- |
| the types agree, no retag | 10,528 | 2,957 | no |
| the types agree, a retag | 10 | 7 | retag |
| a type covers no arms | 71 | 61 | no, every call |
| no type | 2 | 2 | no, every call |
| **the types disagree** | **0** | | |

## Changed

- `boxRetagArmsOfTys(fromTy, toTy, fa, ta)` decides from the two types' arms, and fills them.
  Where either type is -1 or covers no arms it answers no retag, as the names did in all 73 such
  calls. The retag is emitted over those arms (`emitBoxAtomRetagAtoms`).
- `boxRetagNeeded` is deleted, and so is `emitUnionBoxArg`'s `unionNameOfExpr` call.
- `emitBoxAtomRetag` (two text callers, `emitStaleBoxRetag` and the `??` field arm) is left. It
  had 2 split hits in 1 program.

## Graded by output

The 70 programs the probe saw retag, cover no arms or hold no type ran on a fixpoint master seed
and on the candidate. 0 differ.

## Proof

- **Seed:** fixpoint, 6,724,803 → 6,724,771 bytes.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, render-parse, dead-exports, emitter-state-audit.
- **The full sweep:** CI's `sweep` label. The expected movers are the 7 retagging programs' bytes,
  at most: the arms now come in the row's order.
