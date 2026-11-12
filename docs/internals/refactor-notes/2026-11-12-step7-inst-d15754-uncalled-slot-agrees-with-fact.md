# step7 inst: D15754 — an uncalled slot's type agrees with its slot fact

Lane w321, D15754. Take a map of un-annotated functions bound at an annotated map, where one
function is also stored in a second map that nothing reads. Emit refused it with
`monoPinMapValues: the map's stored functions close at another type than its slot fact`.

## Mechanism (probed)

At `monoPinMapValues`, the probe printed matching types for `fnMap`. For `m2`:

- `et` was `{[string]: (f64) => f64}`. It is the slot fact: `elabSlotClose` → `elabHeldFnTy`
  finds `half`'s one instance, made by `fnMap`'s delivery.
- `nt` was `{[string]: (i32) => i32}`. Mono reads the uncalled slot through
  `monoUncalledSlotFnTy` → `elabUncalledSlotTy`, which went straight to the D9100 default for an
  open member.

So two elaboration readings of one slot disagreed.

## Change

`elabUncalledSlotTy` (its only caller is `monoUncalledSlotFnTy`) asks `elabHeldFnTy` about its open
members before the default, and keeps the default when that answers no closed type. A slot with no
instanced member is unchanged.

## Grading

- D15754's witness goes from refusal to runs, printing `4`. The returned-binding spelling in the
  row's ablation goes from refusal to runs. So does the probe
  `annotated-map-of-fn-shared-with-unread-map.vl`, whose header is reworded.
- Matrices: the 81 hole-function matrices plus `two-map-lists-sharing-a-smaller-set`. See the
  PR body.
- `two-map-lists-sharing-a-smaller-set`'s annotated face still refuses, both alone and with
  #7490. Its minimal witness is filed as D15756, with a probe: one function in two maps, one map in
  an annotated list literal and the other in an un-annotated one. With #7490, the smaller spelling
  without the second list runs.
- Fixture: `tests/cases/maps/hole-fn-shared-with-unread-map-closes-at-its-instance.vl`.
