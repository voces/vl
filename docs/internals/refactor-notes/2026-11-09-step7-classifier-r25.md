# Step 7: classifier round 25, a captured local's env field reads the local's cell, 2026-11-09

Round 25 starts from master `ce2bd63b`, where `classifier-census.vl` reads 47 probed
classifiers, all post-only. It uses round 24's method. A scratch compiler wraps each
classifier, runs it and a typed twin, and counts `SH <fn> = <tag>` or `SH <fn> <legacy>/<typed>`
under `$VL_CLS_CENSUS=1` over the 23,806-program sweep population (`--keep`). The cloud image's
prebuilt host binary needs `cargo build --release` in `scripts/vl-host` first (round 23).

**Shadow** (post-mono, calls):

| classifier | typed twin | agree | disagree |
| --- | --- | --- | --- |
| `captureValKind`'s annotated `let` arm | the local's cell kind, `letCellKindGo(b, frame)` under `capInitAsk` (shipped) | 10,273 | 0 |
| `captureValStructIdx`'s `let` arm | the local's cell slot, `letCellSlot(b, frame, kind)`, compared exactly (shipped) | 8,765 | 0 |
| `fieldCodeCellKind` | the read's own type's rep, through `nulNicheOrNull` | 828 | 18 (stands) |
| `arrLitObjRowTy` | the lead element's type's structural row, else its variant shape row | 6,296 | 6 (stands) |
| `arrLitObjRowTy` | the literal's element type's row, the same way | 6,296 | 6 (stands) |
| `forInVarStructIdx` | `repSlotOfKind(kind, element type)` | 9,476 | 17 (stands) |
| `moduleCopySigKey` | the copied binding's type's key, then the read's own (graded at its caller) | 3 | 4 (stands) |
| `refListKeptSlotOfExpr` | the rest of `refListSlotOfExpr`'s ladder (graded at that caller) | 14,316 | 2,000 (stands) |

**Switched.**

* `captureValKind`'s `let` arm is one read of the local's own cell, `letCellKindGo` in the frame
  declaring it, with `capInitAsk` set as the un-annotated arm already did. The annotated arm's
  three niche rungs (D1632, D3139, D1759) are what `letBindRepClaims` already answers there.
  A `let` with neither a type nor an initializer is a check error, so the arm's old `i32` floor
  for it is unreachable. `initIsNestedStructFieldRead` had no other caller and is deleted.
* `captureValStructIdx`'s `let` arm is `letCellSlot` beside that kind. Its old ladder was
  `letCellSlot`'s, missing the map arm. A first shadow that called every negative answer equal
  passed, and the switch it licensed broke `maps/i32-keyed-scopes.vl`: a map's shape is
  negative and a real answer. The exact comparison is the one in the table.
* `captureValKind` and `capturedKindOf` go to `NOT_BLIND`. Every answer is a by-name binding
  lookup, which stays name-keyed by design, and then a typed reader: the local's cell, a
  parameter's annotation, or the loop variable's `forInElemKind`. `captureValStructIdx` stays
  probed, because its loop-variable arm asks `forInVarStructIdx` and its `let` arm `letCellSlot`,
  and both are still type-blind.

**What stands, and why the legacy answer is right.**

* `fieldCodeCellKind`'s 18 are fields whose type is still a hole, such as an empty-list-or-null
  join (`objects/empty-list-join-null-field.vl`, D6271) or a record field holding a generic
  application (`generics/inline-record-field-holding-generic-application.vl`). The read's type
  has no covered rep. The row's field code is the stored rep and says nullable list or nullable
  struct.
* `arrLitObjRowTy`'s 6 are records holding function lists (`[{ fs: [inc0] }]`, D15561,
  `closures/returned-lists-of-records-take-the-joined-set-runs.vl`). The context row is the
  joined function set's, and the element's own type names its narrower set. Those rows belong
  to the function-value lane. The first twin's other 9 misses were variant rows, and its variant
  half closes them.
* `forInVarStructIdx`'s 15 variant misses are layout twins (`distilled/named/b0165*`, `b0174*`,
  `b0183*`): `Circle` and `Dot` are both `{ r: i32 | null }`, the legacy names `Circle`'s row,
  and `repSlotOfKind` names the canonical twin. They share a heap type, so there is no bug. The
  other 2 are records holding hole functions (`d15207_loop_over.vl`,
  `hole-fn-list-reached-through-alias-called-in-callback.vl`), where the type keys no row.
* `moduleCopySigKey`'s 4 are module copies of a generic function value (`const g = f` with
  `f = fst`, D9130). The checker records the copy's type with a type variable, which keys no
  `$fnsig`. The lambda's instance key is the right one.
* `refListKeptSlotOfExpr`'s 2,000 are mostly the kept row 0 against a type that keys none
  (1,654). They are the same families `refListSlotOfExpr`'s 2,187 are (round 24).

**Census** (`classifier-census.vl`):

| tree | probed | post-only | pre-only | both | uncalled | warnings |
| --- | --- | --- | --- | --- | --- | --- |
| master `ce2bd63b` | 47 | 47 | 0 | 0 | 0 | 0 |
| this PR | 45 | 45 | 0 | 0 | 0 | 0 |

**Proof.** Both sides are fixpoint seeds. Master `ce2bd63b` is 6,596,106 bytes and this PR is
6,595,446 (−660). On this tree the census reads 45 probed over 23,814 programs
with no warnings, late demands are 6 (the baseline), and the filed witnesses grade
4,679 of 4,679 as filed. With master `ddf30c4b` (#7015, #7020) merged in, the fixpoint seed is
6,595,637 bytes and the same gates hold.
