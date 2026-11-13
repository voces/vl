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

**Sweep** (`sweep.vl diff`, fixpoint seeds, master `4f7761cb` against this): 24,210 same, 0 movers.

The semantic question, one value-union answer per type, stays D16062.
