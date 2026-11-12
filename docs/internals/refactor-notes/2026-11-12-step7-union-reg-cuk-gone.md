# Step 7 L6 (lane G, cut 1): the spelling key and the softened-key probe are deleted, 2026-11-12

The base is master `cf01f012`. The union registry keys rows by the canonical type key (`unTyKey`);
the softened key's column went in `2026-11-12-step7-union-reg-unkey-gone.md`. This cut deletes what
was left of the spelling side of the key.

## Re-measured on the base

| reader | uses | what read it |
| --- | --- | --- |
| `canonUnionKeyOfName` | 3 | `canonUnionKeyOfTy` re-keying its own rendered text (1), the box-destination shadow (2) |
| `canonUnionKeyOfTy` | 2 | `unRowOfTyWide`'s existence test (`< 0`), the box-destination shadow |
| `canonUnionKeyTextOfName` | 2 | `softKeyProbe`, the box-destination shadow |
| `softKeyProbe`, `softKeyProbeNoTy` | 2 | `registerValueUnionNameAB`, `registerInlineUnionGo`; armed only under the A/B harness, comparing against a key no row holds |

No emit decision read any of them except `unRowOfTyWide`. There, `canonUnionKeyOfName(text)` is -1
exactly when `text` is "" (a non-empty text splits into at least one non-empty atom), so the test
is `canonUnionKeyTextOfTy(ty) == ""`.

## Deleted

- `check_nj_join.vl`: `canonUnionKeyOfName`, `canonUnionKeyOfTy`, `canonUnionKeyTextOfName`, the
  text and id memo (`cukTexts`, `cukIds`, `cukTextMemo`, `cukMemoSync`), `canonUnionKeyText`,
  `unionAliasMultiMembers` and `aliasDeclRowSet`.
- `emit_union_registry.vl`: the softened key's walk (`softUnionKeyTextOfTyIn` and the eleven `suk*`
  helpers), `softKeyProbe`, `softKeyProbeNoTy` and their notes in the registry sweep.

## Changed

- The box-destination shadow (`box_dst_shadow.vl`, off unless armed) counts a site's union and the
  record as "agree up to spelling" when their canonical type keys (`utkTyKeyText`) are equal. A
  site that hands over no type is graded by spelling alone. `tests/vl_box_dst_shadow_test.ts`
  pins no "agree up to spelling" row, and passes unchanged.

## Proof

- **Seed:** a fixpoint, 6,735,476 → 6,723,507 bytes (−11,969).
- **Locally:** lint-self, regress (no runs lost), rep-fuzz, the box-dst shadow test, dead-export
  (nothing new), render-parse (unchanged: 12 renders, 40 parses).
- **The full sweep:** CI's `sweep` label. Expected identity: no emit decision moved.
