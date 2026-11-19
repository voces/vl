# IR: a struct or variant-param field store through one arm decision and legacy's store tail (2026-11-19, lane DEAD)

`assignment target` blocked 167 self-compile functions alone on master b306ab952. An instrumented
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

Measured against master b306ab952's fixpoint seed, after merging it:

| reading | master | this step | gained |
|---|---:|---:|---:|
| self-compile functions the shipped claim emits (`$VL_IR_SHADOW=5`) | 14,125 | 14,239 | +114 |
| corpus functions covered = matched (`ir-shadow.vl`, 45,678) | 33,583 | 33,605 | +22 |
| `assignment target` alone, self-compile | 167 | 0 | |

That is +197 net compiler lines (+258 −61). No legacy line is deleted or moved to `@ir`.

The struct arm and the variant-param arm are covered. `emitVariantFieldWrite` now ends with the
shared `fieldStoreVariantTail`, and `fieldStoreVariantValuePlain` mirrors
`emitVariantFieldStoreVal`'s arms.

Left in the class, as named misses:
- 45 self-compile functions store through a narrowed union box. The box is unwrapped between
  receiver and value, and the receiver is no record rep for `SSetField`'s verifier rule.
- 3 store a short-circuit value.

## Bars

| bar | reading |
|---|---|
| `ir-identity.sh` plain, master's seed against this one | 9,037 identical, 3,267 fail under both, 0 differ; self-compile identical |
| `--names` | 9,037 identical, 0 differ; self-compile identical |
| `--cases` | 7,513 identical, 68 fail under both, 0 differ |
| mode 3 over the corpus | 9,037 identical, 0 differ; self-compile identical |
| armed shadow | 33,605 covered = verified = matched; `ir-shadow: ok`; `--claims` ok |
| seed fixpoint | a second refresh is byte-identical |
| `regress.vl` | 0 runs → not-runs of 260,828 |
| L2 fuel | +0.3% on the refreshed 99.81G baseline |
| seed size | +0.9% on its baseline |
| late demands | 9, baseline 9; late tag rows 307, baseline 307 |
| lint-self, phase-state, ladder-sets | clean; ok; 60 sets |
