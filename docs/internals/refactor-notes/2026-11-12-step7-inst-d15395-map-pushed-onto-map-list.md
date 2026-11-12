# Step 7 inst: a map pushed onto a list of maps of a set takes the list's set, 2026-11-12

Lane w321, D15395. Take `const xs = [m2, fnMap]`, where `fnMap` holds `inc0` and `half` and `m2`
holds `half`, all un-annotated. Then `xs.push(m2)`. The list literal alone has run since D15352,
which decides the smaller set with the wider one and stores both maps at the wider set's ids.

The tag pass refused the push in three places, each a rung only the literal had. A probe on
every `return false` of `ftScan`, and on `ftHoldCtxOk`, found them in turn:

1. `ftSlotOp` admitted no `push` on a list of maps (hold kind 7), so the receiver `xs` failed its
   read context.
2. A value pushed onto it was joined by `ftJoinAt`, not by the literal's element rule.
3. The pushed map's own context, a `push` argument, admitted neither a map of a smaller set
   decided with the list's (`ftMapListOfWider`) nor a map of the list's own set read against
   the list's element (`ftDstTakes(ftArrElemTy(…))`).

## Changed

All in `check_fn_tag.vl`.

- `ftSlotOp` admits `push` on a list of maps of the set.
- `ftMapElemOk` is the literal's element rule, lifted out of `ftLitJoin`. A map of the set is
  taken, and so is a map of a smaller set within it, noted as needed. The slot-write loop applies
  it to each value pushed onto a list of maps.
- `ftHoldCtxOk`'s `Call` arm admits a `push` argument as the literal admits an element. That is
  `ftMapListOfWider` and `ftDstTakes` over the receiver's element, through `ftPushRecvOf`.

## Measured

`scripts/capability-probes/matrix/map-of-hole-fns-pushed-onto-map-list.matrix.vl`:

| | master | this branch |
| --- | --- | --- |
| runs, of 58 graded | 39 | 45 |
| un-annotated runs, of 29 | 14 | 20 |
| `runs → not-runs` | — | 0 |
| silent | 3 | 3 |

These cells moved to runs, all un-annotated: `push_smaller`, `push_wider`, `push_both`,
`push_in_function`, `push_then_read_wider_key` and `push_read_by_loop`.

- The three SILENT cells are `array_push` (both faces) and `map_set` (annotated), the same on
  both seeds. They are D15752 (unfiled: D15752, filed in #7396): a map of un-annotated
  functions delivered by `push` or `set` into an annotated container.
- The record-field cells refuse as a ref-list field with no interned element. `argument` and
  `array_element` refuse at emit. The `*_assign` and `map_*` cells are check refusals of the two
  result types.

D15394, two such lists in one program, is still refused. Its maps are refused in the literal
itself (`ftHoldCtxOk`, `ArrayLit`, hold kind 3), a separate mechanism.

## Witnesses moved

D15158's position witness and the emit-reason control of `tests/vl_capability_matrix_test.ts` move
to D15394. It still refuses from `emitGlobalSection` with no position.

## Proof

**Full local sweep.** Fixpoint seeds, base master `8fbf0d78`:

| | count |
| --- | --- |
| same | 23,971 |
| bytes-only | 0 |
| output movers | 1 |
| runs → not-runs | 0 |
| new compiler traps | 0 |

The one mover is D15395, which goes from refusal to runs. D15158's new witness, D15394's program,
still refuses. One program is only in the base: D15752's witness. The base record was taken on
the #7396 tree, which files that row.
