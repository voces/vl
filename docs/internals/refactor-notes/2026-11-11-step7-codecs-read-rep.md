# Step 7 codecs: the read rep stores its kind, and the read-rep string decoders deleted, 2026-11-11

The first codec slice of `2026-11-10-step7-vkind-census.md` §4 item 5: the read-rep string row of
§1.1 (`readListKindOf`, `readNulVKind`). Base is master `f50936aa` (#7141). Its fixpoint seed is
6,613,699 bytes.

## The census

`ReadRep` carried what a read is stored as (`rrStore`) and reads as (`rrRead`) as strings. Each
mixes a `VKind` spelling with non-kind tags: `atom<N>`, `litatom`, `nullitatom`, `type`, `fc<N>`,
`mv<N>`, `reflist?` and "". Two functions decoded a `VKind` back out of those strings:

- `readNulVKind(rr.rrRead)`, in `exprNulKind`: a 14-entry table, the same set as `vkNulKindOf`'s
  nullable arm, with every non-kind tag answering null.
- `readListKindOf(st)`, in `readRepKinds`' list-arm narrowing: a 22-entry table from the store
  string to its list kind. Its 8 `atom<N>` rows were dead, since a store string is never an atom
  code (only `rrRead` is). Its call site compared the answer with null only.

Every writer of both strings held the kind as a `VKind` at the point it wrote the string: a
`repOfNode(...).rdKind`, `identStoreVKind`, `listRepOfFieldCode`, `refListElemKind`,
`repSigKindOfTy`, or a kind literal. So the kind can be stored where it is computed.

## What changed

- **`ReadRep` gains `rrKind: VKind | null`**: the rep kind the read reads as, null for an atom id
  or a read with no rep. All 13 record writers in `readRepKinds` set it from the kind they already
  hold.
- **The store half is a record.** `readStoreAt` returns `ReadStore { rsTag, rsKind }`.
  `readFieldStoreKind`, `readCallStoreKind`, `readIndexStoreKind` and `scalarListElemCell` return
  one, through `rsOfKind(k)` for a kind and `rsOfTag(t)` for a tag. `readStoreOf` keeps its
  string answer as `readStoreAt(...).rsTag` for its two callers.
- **The readers ask the stored kind.** `exprNulKind` answers `vkNulKindOf(rr.rrKind)`. The list
  narrowing tests `vkListClass(sa.rsKind) != 0`.
- **Deleted:** `readNulVKind` with `READ_NUL_VKINDS`, `readListKindOf` with `READ_LIST_FROM` and
  `READ_LIST_TO`, and `SCALAR_LIST_ELEM`. `scalarListElemCell` becomes an exhaustive `match`.

## By design, and left

- `rrStore` and `rrRead` stay strings. Their non-kind tags (an atom code, `litatom`,
  `nullitatom`, `type`) are the conversion the read makes, and their readers compare them with
  literals; none decodes a kind from them any more.
- The `$fnsig` token decoders (`sigKeyRetKind`, `sigParamKindAt`, `repKindOfSigTok`) stand while
  `$fnsig` keys are strings. This lane leaves them.

## The price, measured

`sweep.vl diff`, master's fixpoint seed against the candidate's (23,885 programs):

- **23,885 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

`vkind-census.vl`: 77 → 75 functions return a `VKind`. The census graded both deleted functions
as `forward`, the family that fell by 2.

## Proof

- Refresh ×2 is a fixpoint at 6,610,141 bytes (−3,558).
- `scripts/gate.sh`, and the ladder, comment and sentinel budgets: see the PR.

## What is left

The rest of this lane's codecs: `MfKind` (`listRepOfMf`, `spreadScalarVKind`), the value-atom
code (`njVKind`) and the wasm type index (`listFitStoodKind`).
