# Step 7 codecs: `listBuildKindOfVKind` reads the list-rep table, and the spread's encoder is it, 2026-11-11

This slice follows `2026-11-11-step7-lbk-list-encoders.md` (#7216) and stacks on it. It deletes
the duplicate it names.

## What the two encoders were

Before this slice, three functions mapped a list rep to an `LBK` build code:

- `eqListKindOfListRep`: the table, from the 7 non-null lists, -1 for anything else;
- `listBuildKindOfVKind`: its own 7 arms, plus two ref rows (`RLK_UNION` → `LBK_UNION`,
  `RLK_CLOSURE` → `LBK_REF_AT_SLOT`), the five scalar-backed nullable lists (through
  `nulScalarListBuildKind`) and an i32-list default for every other kind;
- `pendingKindOfList` (after #7216): the table plus the union row.

So `listBuildKindOfVKind` repeated the table's 7 arms, and `pendingKindOfList` was
`listBuildKindOfVKind` except at the closure row.

## What changed

- **`listBuildKindOfVKind` keeps only what the table does not answer:** the two ref rows, the
  nullable scalar-backed lists, and the default. It asks `eqListKindOfListRep` for the rest.
  - The nullable arm is `isScalarBackedListRep(nulListBase(kind))`. That names exactly the five
    nullable lists the old arm spelled: `nullist` and `nulreflist` are over `list` and
    `reflist`, which are not scalar-backed.
  - The ref rows ask `rlElemKindAt`, which bound-tests the row as the old arm did.
- **`pendingKindOfList` is `listBuildKindOfVKind` with one explicit arm.** A closure row answers
  `LBK_REF`, which is the spread's answer today. A hole's answer is `LBK_REF_AT_SLOT`, and
  aligning the two would move output, so the arm stays and says why. With this, the spread has
  no encoder of its own.

## Proof

- Expected byte-identical. The CI `sweep` label proves identity; its summary goes in the PR.
- One refresh: 6,620,922 bytes.
- `cases_wasm` passes.
- `distilled/regress.vl`: no runs lost.
- Clean: `lint-self` + fmt, rep-fuzz.
- `plumb-shape-cost --check` fuel: main +0.6% and tail −0.5%, both inside the bar.
- Budgets exit 0: export, ladder, comment, sentinel, scan and render-parse.
