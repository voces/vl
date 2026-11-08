# Step 7: the cloRet* family through a bundle arm (2026-11-08)

The question: can `cloRetValSlot`, `cloRetKeySuffix` and `mfStructResultRowName` read the type
once the reader has a bundle arm? The bundle class closes completely. The three classifiers
still stay, because the record rows the type names are not always the rows the values are built
at. This PR changes no compiler code. The reader and its shadow are commit `84e735f5` on
`claude/step7-cloret-bundle`.

**The reader.** `fnRetBundleTy(fe)` is the bundle record `fe`'s result is delivered as, or -1:

1. -1 when the source declares the result (`elabKeyDeclOf(k)`'s `fnRet`), so the declared
   member is taken (`bundle-record-delivered-to-a-declared-destination.vl`).
2. `elabKeyRetBundleTy(k)` (new, emit_elab): every call reaching instance `k` delivers the
   parameter `elabRetParamOf` names at one bundle (`elabCallArgRep`, `elabIsBundleTy`).
3. `calleeReturnsRecord(fx)` with two or more signatures, as `elabBundleRecordOf`. This covers
   a plain function returning a plain function's bundle call (`chain` → `mk` → `lap`), which
   `elabCallBundleRet` misses because the callee is not an instance.
4. Each returned value, at `elabWrittenBuiltTy(-1, v, k, 0)` (exported as `elabValueBuiltTy`),
   is a bundle and they agree. This covers `const r = lap(...); return r` (D15147, D15211).

The slot is `bundleRecordRowOfTy` of that record. Otherwise it is
`repSlotOfKind(cloRetValKind(fe), fnRecordedRetTy(fe))`. The slot has to be read at the
classifier's own kind, because every caller pairs the two. At `repOfTy`'s kind, a record that
shares its shape with a union member reads `variant:0` where the caller expects a struct row.

**Shadow.** The counts are calls, from `clsCensusEnter("SH …")` and `classifier-census --keep`.
The first row is over the 23,615-program population, the second over the 57 programs that still
disagreed.

| reader | agree | disagree | of them bundles |
| --- | --- | --- | --- |
| r5/r6 (no bundle arm) | 66,737 | 820 | 570 |
| arms 1, 2 and 4, at `repOfTy`'s kind (population) | 67,498 | 225 | 4 |
| all four arms, at `cloRetValKind`'s kind (57 programs) | 2,593 | 142 | 0 |

Here are the 142 that are left, by class:

| class | calls | who is right |
| --- | --- | --- |
| struct row differs | 68 | the classifier, where it was ablated |
| map shape (`-1` against `-2`/`-3`, `-4` against `-5`) | 47 | either one: these were bytes-only movers |
| struct, and the type has no row (`-1`) | 8 | the classifier |
| ref-list slot (`-2` or `1` against `0`) | 11 | the type, or either one: bytes-only movers |
| variant or nulstruct row | 8 | not ablated |

**Sweep.** I switched `cloRetValSlot` to the reader. Both seeds are fixpoints. Base is master
`4c3ad151` (6,510,829 bytes). The 23,634 programs graded 23,626 same, 5 bytes-only movers and 3
output movers. All 3 are `runs → not-runs`:

* `b000378.vl` (`mkcall`, un-annotated, returns `{ r: 7 }` beside `Circle = { r: i64 }`) is now
  invalid wasm. The recorded type reads as `Circle`'s row (0, or `variant:0` at the rep's kind),
  but the literal is built at its own row (1). Ablation: dropping `Dot`, `Box1` or the union
  does not help, and dropping the union only moves the rows to 2 and 0.
* `mkAB(): AB` in `inline-shape-open-span-homes.vl` and `a2<T>(): { f: … | null }` in
  `generic-declared-record-result-function-field-row.vl` both now hit `ref valtype with no
  interned shape`. The result is declared. `retStructRowIndex(annotation)` finds a row, and
  `repStructRowOfTy(fnRecordedRetTy)` finds none.

**What is missing, and where.** Both missing facts belong to `fnRecordedRetTy` and the row
readers, not to the classifier:

1. An un-annotated record result is recorded at a type whose row is not the row its values are
   built at. `frsValuesBuiltRow` exists, but `b000378` does not reach it.
2. `repStructRowOfTy` misses rows that the annotation path (`retStructRowIndex`) finds, for an
   alias of an inline shape and for a generic's declared record with a nullable function field.

Once those two close, rerun the shadow from `84e735f5`. The bundle arm needs no more work.
`cloRetKeySuffix` follows the slot: once the bundle arm went in, 85 of its calls disagreed (4 of
them bundles). The 330 `>sN` against `>c` calls close with the bundle class.
`mfStructResultRowName` reads `cloRetValSlot`, so it moves when the slot does.
