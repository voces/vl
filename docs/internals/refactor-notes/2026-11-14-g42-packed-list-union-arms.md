# D16046: every packed list width is a union arm, 2026-11-14

Lane G. Before this, `u8[]` was the only packed list with a union box tag (value-atom kind and
code 13). `rtOfUnion` refused a union holding `i8[]`, `u16[]` or `i16[]`.

## Design

- A packed list arm's kind is `pkKindOfRow(row)`: 13 for `u8[]`, else `PK_KIND_BASE + row`
  (64 + row). That is above every other value-atom kind, so none of the fixed-number kind
  compares (14 v128, 15/16 int-mono maps, 17/18 boolean lists) can match one.
- The tag is minted at the one choke point, `scalarTagOfKind`. A twin row's code is
  `pkCodeBase() + k`, where `k` is the row's index in `pkTwinRows`. These codes sit above the
  map twins and below the atom-leaf list (`atomListCodeOf`). A module with no twin numbers its
  codes exactly as before. When a twin exists, `u8[]` keeps code 13 and the band starts at 14.
- Twins are registered with the arm-use bits (`armUseBits` calls `pkTwinNote`). A row first met
  after `arenaFinal` fails loudly, the same way `mapTwinNote` does.
- The band arithmetic (`mTwinCodeBase`, `pkCodeBase`, `atomListCodeOf`) moved from
  `emit_map_twins` to `emit_state`, so `emit_rep` can read it without an import cycle.
- Each ladder on the 13 path now handles the twin range explicitly:
  - `listWrapHeapOfKind` returns the row's wrapper;
  - `leqCoreKindOfAtomKind` returns 10, with the row as the compare slot (`atomEqSlotOfKind`);
  - `refAtomElemName` returns the row's element;
  - the nullable niche (`coalNicheAtomKind`) keys its kind by row;
  - the coerce ladder (`exprU8Array` and the empty-`[]` re-map) picks the row;
  - `atomCodeName` names a twin code `pk:<elem>`.
  `valueAtomKind` is unchanged.

## Grading

- F's five union cases (`arrays/u8-union-{scalar,struct}-arm`, `arrays/u8-union-tag-band`,
  `unions/as-opt-list-arm-inline-operand`, `unions/empty-list-into-u8-list-union`) were cloned
  with `\bu8\b` replaced by each width. All of them print the `u8` output at `u16` and `i16`. At
  `i8` they do too, once the literals 255 and 250 are replaced by values in range; otherwise the
  checker correctly refuses the out-of-range literal.
- `scripts/capability-probes/matrix/packed-list-union-arm-{u8,i8,u16,i16}.matrix.vl`: one
  template per width, covering `is`, the narrowed read, `==`, `as!`, `??` through the nullable
  niche, a second width, a map, closure and struct arm, and an empty `[]`.
  On the refreshed seed, each width runs 80 of its 82 cells. The other two are `return_inferred`
  in both faces: the checker's union-return refusal, which `u8` gets as well.
- Byte-identity: a program with no non-`u8` packed union arm never registers a twin, so
  `pkCodeBase()` is 13 or 14 exactly where the old `atomListCode()` was. The `sweep` run on this
  PR is the proof.
