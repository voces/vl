# Step 7, lane H: the value-union mint reads the type its spelling reads back as, 2026-11-13

`registerValueUnionNameAB` minted from the caller's type only when
`valueUnionTyIsFlat` accepted it. Any other type had its spelling
(`unionSpellingOfTy`) parsed back with `declTyIxOfName`. Site 55
(`registerInlineUnionGo`) is the one caller holding a type there: 219 programs.

## Why not `storageNormTy`

The coordinator asked for one normalizer shared with B's `storageNormTy`
(#7816). A probe compared each candidate with the parsed type (`tySame`) at
every site-55 parse, over 24,218 programs:

| candidate                                                    | agrees |
| ------------------------------------------------------------ | ------ |
| `storageNormTy(ty)`                                          | 184    |
| `storageNormGo` plus a nested-union flatten, no numeric join | 162    |
| the same plus string-literal grouping                        | 214    |
| `unionSpellingTyOf(ty)`, below                               | 219    |

The spelling site 55 parses is `unionSpellingOfTy`'s, not the list rung's. It
differs from `storageNormTy` in three rules the probe named:

- it never joins numerics (`i64 | 1` spells `i64|i32`, where `joinTys` gives
  `i64`);
- it groups a union's string-literal members into one literal-union member only
  through `mixedLitRunAliasOf`: a registered alias holds exactly that set, and a
  non-literal member stands beside it. Otherwise the literals widen to `string`;
- a nested union or a `null` part joins the outer union.

So the typed answer is a twin of that spelling, not a mode of B's normalizer.
Each branch of `unionSpellingTyOf` (emit_union_atoms) mirrors one branch of
`unionMembersSpelling`, `nullableSpelling` or `unionPartSpelling`. It builds the
part's type where the spelling builds text, and a repeated part drops as the
spelling's does.

## The change

A caller holding a type `valueUnionTyIsFlat` rejects mints from
`unionSpellingTyOf(ty)`; a decline fails loudly (the probe saw none). Only a
caller with no type still resolves the spelling. `storageNormTy` is untouched,
so B's 471-program agreement stands without a re-run.

## Measurement

- **Probe:** `unionSpellingTyOf(ty)` is `tySame` to the parsed type in all 219
  programs that reach the parse, with 0 declines.
- **Sweep** (`sweep.vl diff`, fixpoint seeds, master 723db85ad against this):
  24,224 programs, all the same. 0 bytes-only movers, 0 output movers.
- **Census:** does not move, since `declTyIxOfName` is graded once for the whole
  function.
- `deno task test` passes (8,760), and rep-fuzz-check is exact.

## Keeping the two faces from drifting

`unionSpellingOfTy` and `unionSpellingTyOf` encode one set of rules, so one
should derive from the other. Spelling the twin's type with the emit render was
tried first: it is not byte-identical, 99 of 6,697 programs differ. A list arm's
element is spelled by its nominal name in the spelling but structurally by
`tyToEmitName`, and the render declines a few others. So both faces stay, and
drift fails loudly instead:

- **Shadow compare:** under `$VL_REP_SHADOW` each mint from the twin also parses
  the spelling and compares (`spellTy/checked`, `spellTy/disagree`, reported
  after the shadow sweep by `spellTyShadowSweep`).
- **Test:** `tests/vl_spell_ty_agreement_test.ts` asserts disagree is 0 and
  checked is above 0 over the 151 `tests/cases` programs that reach the mint
  (`tests/fixtures/spell-ty-agreement/witnesses.txt`).
- **Control:** a twin drifted alone (its literal-run grouping disabled, the
  spelling left alone) makes 18 of the 151 disagree, so the test fails.
