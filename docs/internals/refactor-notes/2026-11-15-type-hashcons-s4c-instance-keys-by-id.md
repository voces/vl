# Type hash-cons stage 4c: a mono instance key spells a type by its set id (lane H), 2026-11-15

Stage 4's third slice, stacked on 4b (#8277). `tyCanonKey(ty)` built every type part of a mono
instance key (`emit_inst_key.vl` 2 sites, `emit_mono.vl` 9). It walked the type and rendered it:
union members flattened, sorted and deduplicated, and any other kind by its `tyToStr`. It is now
`"#" + tyCanonSet(ty)`, and `"?"` for no type.

**The 29 disagreements 3b measured.** In 13 files, 27 struct-name splits and 2 Sets inside
`Box<…>` had looked like a semantic choice per caller. The test settled it: with every key part
taken as the set id, all 1,839 corpus files and the compiler's own build are byte-identical. No
instance those keys separated or merged changes the emitted module, so one rule serves every
caller and no caller needs its own.

**Deleted:**
- `tyCanonKey`'s walk, its cycle stack, its 100,000-type budget, its string memo and the
  member-sorting union spell (`emit_ty_canon.vl` −99);
- the `depth` argument at all 11 call sites;
- the `tyCanonKey` shadow (`canonShadowKey`, its tallies and its two maps; `emit_ty_seal.vl`
  −46). Only the layout shadow is left.

**Not done here:** the emit-side `tyMutEpoch` reads. They stamp memos keyed by row, and a row still
changes during mono instancing (lane E measured 107 tree rebuilds there from `tyMutEpoch`). A memo
can drop its stamp only by re-keying on a content id, and only where its answer depends on the
type alone. The rep memos also read `cUserTypesVer` and the variant shapes, so that is a memo-by-
memo change, and it waits for the arm-aware rep id.

## Measurements

The base is 4b (2ddf7f4f) built to its own fixpoint.

| reading | value |
|---|---|
| seed | fixpoint |
| identity | 1,839 corpus files plus `compiler/entry.vl`: same module and diagnostics |
| seed size | see the PR |
| net compiler lines | −156 (`emit_ty_canon.vl` −99, `emit_ty_seal.vl` −46, `emit_mono.vl` −9, `emit_inst_key.vl` −2) |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
