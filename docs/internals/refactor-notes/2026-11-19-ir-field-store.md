# IR: a struct field store through one arm decision and legacy's store tail (2026-11-19, lane DEAD)

`assignment target` blocked 159 self-compile functions alone (on #9146's tree). An instrumented
miss shows every one is a field store, `o.f = v`: the builder's `assign` covered an `Ident` or an
`Index` target and nothing else, and `SSetField` had a verifier rule but no lowering.

## What landed

- **`fieldStoreArmOf` is `emitAssignMember`'s decision** over the closed `FieldStoreArm`
  (registered in `compiler/lint.vl`). Its arms:
  - `narrowVariant`: through a narrowed union box;
  - `variantParam`: into a variant receiver;
  - `nulVariant`: into a nullable variant's receiver;
  - `shared`: through an un-narrowed struct union's shared field;
  - `struct`: straight into the record.

  `emitAssignMember` is an exhaustive `match` on it, with one function per arm. The `shared`
  arm's "applies" test is `sharedFieldAssignPlanOf`, split out of `emitSharedFieldAssign`, which
  now uses it too.
- **The `struct` arm is the record, the value and `fieldStoreTail`**: the niche recover's store
  half (D1222), the scalar covariant park (D2163), then `struct.set`.
  - `fieldStoreStructAt` names the row and field.
  - `fieldStoreValuePlain` says whether `emitStructFieldStoreValue` writes the value bare. It is
    an exhaustive `match` over the same `VKind` arms.
- **The IR's `SSetField`** is built by `fieldStore` where the arm is `struct`, the value is plain,
  the receiver is an `RRecord`, and the value is at the field's kid rep. Every other shape is a
  named miss: `field store <arm>`, `field store value`, `field store coercion`.
  - The lowering is the record, the value, then `fieldStoreTail`, read off the store's node
    (`lw.irNodeAt`) as `SListSet` reads its own.
  - `SSetField` moves from `other` to the `record` family, which is claimed.

## Coverage

| reading | #9146's tree | this step | gained |
|---|---:|---:|---:|
| self-compile functions the shipped claim emits (`$VL_IR_SHADOW=5`) | 13,747 | 13,840 | +93 |
| corpus functions covered = matched (`ir-shadow.vl`, 45,678) | 32,189 | 32,211 | +22 |
| `assignment target` alone, self-compile | 159 | 0 | |

That is +151 net compiler lines (+210 −59). No legacy line is deleted or moved to `@ir`.

Left in the class, as named misses:
- 45 self-compile functions store through a narrowed union box;
- 12 store into a variant parameter;
- 3 store a short-circuit value.

The first two go through `emitVariantFieldStoreVal`, a separate value writer: the next step.

## Bars

| bar | reading |
|---|---|
| `ir-identity.sh` plain, #9146's seed against this one | 9,037 identical, 3,267 fail under both, 0 differ; self-compile identical |
| `--names` | 9,037 identical, 0 differ; self-compile identical |
| `--cases` | 7,512 identical, 68 fail under both, 0 differ |
| mode 3 over the corpus | 9,037 identical, 0 differ; self-compile identical |
| armed shadow | 32,211 covered = verified = matched; `ir-shadow: ok`; `--claims` ok |
| seed fixpoint | a second refresh is byte-identical |
| `regress.vl` | 0 runs → not-runs of 260,828 |
| L2 fuel | +0.9% on the 99.03G baseline the coordinator is refreshing (master drift is most of it) |
| seed size | +0.8% on its baseline |
| late demands | 9, baseline 9; late tag rows 307, baseline 307 |
| lint-self, phase-state, ladder-sets | clean; ok; 59 sets |
