# Step 7, lane H: P1 part 2, the value-union verdict per spelling convention, 2026-11-13

Part 1 (#7752) asked the type at the four sites where it already gave the name's answer. The other
sites read `isValueUnionName` over a spelling whose convention for literal members the type twin
(`isValueUnionTyOr`) does not follow; asking the type lost 28 programs (D16062). This part removes
those parses with no change in behaviour: each site asks a type-side verdict that mirrors its own
speller arm for arm.

## The conventions, measured

A probe recorded each site's distinct (spelling, verdict, type) triples over 24,207 programs.

| speller | sites | how a literal member spells |
| --- | --- | --- |
| `canonUnionKeyTextOfTy` | `mintValueUnionRowOfTy`, `valueUnionKeyTextOfTy` | at its base, no dedup (`"a" \| "b"` is `string\|string`). A run that regroups to a declared alias, or a declared alias member, is no atom; a nested literal union is its base; a list of a literal union is its base's list. |
| the registered row name | `mvShapeOfValNameArmTyGo` | a declared alias's own name, no atom; else the key text |
| `unionSpellingOfTy` | `valueUnionNameOfTy`, `coalesceResultUnionName`, `boxDstName` | a literal at its base, an alias or a quoted run kept (no atom), a part equal to an earlier one dropped (`9000000000 \| 1 \| 2` is `i64\|i32`) |
| `tyToEmitName` | `litUnionArmValueUnionRetName` (two predicates) | a numeric literal at its base, one string literal as `string`, a run of two or more as one group, no atom |
| the inferred-return name | `fnUnionRetSinkOk`, `retFlagsSeedResult`, `fnRetNullBearing` | decided by the producer that minted the name |

## The change

- **`keyTextValueUnionVerdict` and `rowNameValueUnionVerdict`** (`check_inline_lit_union`, beside
  `canonUnionKeyTextOfTy`) walk the key-text speller's arms and decide over the kinds its atoms read
  as. Where a member's kind is not the arena's to tell, the site parses the name inline. No corpus
  program reaches that fallback.
- **`spellingValueUnionVerdict`** (`emit_union_atoms`, beside `unionSpellingOfTy`) does the same for
  that speller. It drops a part exactly where the speller does, by a key that equals when the part's
  spelling does; a list part's key is the speller's own atom text, compared and never parsed.
- **`emitNameLitUnionVerdict`** (`check_ty_rep`) answers both of `litUnionArmValueUnionRetName`'s
  questions.
- **The inferred-return table records a verdict per row** (`inferRetVU`, read by
  `inferRetIsValueUnion`). It is set by the rung that minted the name: an array-literal or closure
  arm always, and `valueUnionRetName` by `vuRetLastVU`, which is false on its literal-arm fallback.
  The table's rollback and reset carry the new column.

Each twin's comment names the speller it mirrors, so a change to one is visibly a change to both.

## Measurement

**Identity at the decision points.** Each twin was probed against `isValueUnionName` over the
24,207-program population, the check-time producers included:

| twin | sites | programs | mismatches |
| --- | --- | --- | --- |
| inferred-return verdict | 2165 / 31912 / 192 | 8,533 / 4,131 / 236 | 0 |
| `emitNameLitUnionVerdict` | the two predicates | 53 / 776 | 0 |
| `keyTextValueUnionVerdict` | 1452 / 1463 | 531 / 3,781 | 0 |
| `rowNameValueUnionVerdict` | 474 | 161 | 0 |
| `spellingValueUnionVerdict` | 1471 / 509 / 9767 | 3,954 / 620 / 400 | 0 |

The twins converged over several probes. Each time, the probe named a speller arm the twin had not
mirrored: the alias-before-base order, a nested union, and a list of a literal union.

**Sweep** (`sweep.vl diff`, fixpoint seeds, master `3eb0db25` against this, the floors included): 24,212 same, 0 movers.

## Six unreached parse sites, floored

Lane F's audit (#7759) found six `emit_union_atoms` parse sites with no reaches. A probe counted
each site and a control over 24,206 programs: one witness, `D12131`, exhausts the stack in batch
mode on either seed. Each site reads 0; each control fires.

| site | parse | control | control reaches | cut |
| --- | --- | --- | --- | --- |
| `registerValueUnionNameTy` | `isValueUnionName` on a declined row test | function entry | 5,792 | the decline fails loudly |
| `atomArmUseBits` | `valueAtomKind` per arm | `markValueUnionArms`, the `cov \|\| ty < 0` arm | 10,216 | the arm with neither member types nor a type fails loudly; `atomArmUseBits` deleted |
| `unionHasClosureArm` | `valueAtomKind` fallback | `unionNameOfIndex`, the rung before (see below) | 270 | deleted with its only caller |
| `unionClosureArmName` | `valueAtomKind` fallback | function entry | 71 | the fallback fails loudly |
| `unionClosureArrElemUnion` | `isValueUnionName` | `unionNameOfIndex`, the rung before | 270 | the rung fails loudly; the function deleted |
| `unionRefArrayArmSlotForNestedElem` | `nameIsMapOpen` | its caller's non-empty array-literal arm | 181 | the map branch fails loudly |

`unionNameOfIndex`'s arm-name recovery for a union binding's index read never ran: an index read
that reaches it already classified as a ref-list read (`exprRefArray`) one rung earlier, including
`tests/cases/unions/union-arm-closure-element-array-index-call.vl`, the case it was written for.

With part 2's twins, `ty-string-parse` falls 53 → 47 and `ty-parse-unclassified` 46 → 40, all in this PR's files.

The semantic question, one value-union answer per type, stays D16062.
