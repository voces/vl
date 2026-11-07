# The naming rule's producer, shadowed (2026-11-07)

Slice 1 of the call-param lane ([architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4,
the blocked `monoArgTyName` family). The naming rule (orchestrator, 2026-11-07): an instance's
name and its synthesized annotation text derive from its canonical type alone. A record spells
as its row's registered name, `sNames[repRowOfTyStruct(ty)]`. Every other type spells
structurally, with union members sorted and function types written `(i32)=>i32`.

`monoPinSpellOf(ty)` (`compiler/pin_spell.vl`) is that producer. Nothing reads it yet. Under
`$VL_REP_SHADOW`, `monoInstantiateCallIn` notes every parameter pin and every type-parameter
binding against it, by class, after `monoExactPinTys` and just before `monoMakeInstance`, so the
pair is the one the instance is made from. `tests/vl_pin_spell_shadow_test.ts` pins two witnesses'
classes exactly.

## Measured

Merged tree `e9d8e2dc` (master `dd855bc1` plus this branch). The population is `tests/cases` and
the distilled corpus: 19,355 programs, 6,902 of which make an instance.

| class | param pins | programs | type-param bindings | programs | what it needs |
|---|---|---|---|---|---|
| agree | 25,190 | 5,744 | 11,566 | 3,483 | nothing |
| open pin type (`TyVar` left at mint) | 1,907 | 407 | 129 | 50 | a closed pin type, else the name stays mono's |
| differ: a literal union's alias or `#lu` row, or its base scalar, against its members | 1,798 | 764 | 1,252 | 690 | **a ruling, below** |
| differ: other | 459 | 189 | 111 | 55 | per-case triage (`{[i32]:boolean}` against `Set<i32>`, `L` against `string`) |
| fn sig key (`=>i>i` against `(i32)=>i32`) | 826 | 169 | 124 | 40 | the `=>` readers (`monoPinIsFnSig`) switch to the pin's `tyIx` |
| union order or parens | 814 | 385 | 675 | 342 | nothing semantic: an order the scans must not read |
| record, another name | 566 | 205 | 222 | 95 | the row name; see "rows named by shape" |
| record inside, another name | 342 | 182 | 162 | 112 | the same, one level down |
| producer has no spelling | 146 | 87 | 61 | 32 | a union-member record's row (`uVariants`, not `sNames`) |
| anon row (`{x:i32}[]` against `#anon1[]`) | 37 | 17 | 5 | 5 | D12641's naming policy |
| no pin type (`-1`) | 26 | 10 | 18 | 6 | function lists pinned with no type |
| **all** | **32,111** | | **14,325** | | |

The two "differ" rows are split by whether the producer's spelling holds a literal that mono's
does not. The largest buckets are `K|null ~ "a"|"b"|null` (837 + 607), `K ~ "a"|"b"` (285 + 213),
`#lu2|null ~ …` (81 + 80) and `i32 ~ 0|1|2` (51), the numeric union pinned at its base (P11).

## What the shadow says the switch needs

- **A literal union's alias is load-bearing spelling.** For a literal union the spelling is the
  rep (`monoLitUnionPinOfTy`'s header), and the alias is how `litUnionAliasNameOfTy` finds it.
  A numeric literal union pins at its base scalar (P11, load-bearing for instance count). The
  canonical structural spelling erases it. This is the largest disagreement and the rule as worded
  does not say which way it goes.
- **A record that is a union member has no `sNames` row.** `collectS` skips it and mints a
  variant row, so `repRowOfTyStruct` answers -1 and the producer has no spelling (`Shape`,
  `{r:i32|null}`). The producer needs the variant table as the record row of last resort.
- **Some registered rows are named by shape.** `Circle ~ {r:i32}` and `{x:i32} ~ #anon0` are rows
  whose `sNames` entry is a render, not a declared name. The rule takes the row's name as given, so
  the switch moves these names. Output should hold, since instance identity is `tyCanonKey`.
- **Two declared names over one row spell as the first.** In the test's witness, `Circle` spells as
  `Dot`. This is the 38 + 31 row of the instance-identity note.
- **The `=>` readers decide from spelling.** `monoPinIsFnSig(an)` and `monoHoleFnPinTyOf` read the
  `=>` prefix, so they must read the pin type before the 826 fn-sig pins can change spelling.
  `isNumRecvBaseName` (wasmEmit) also decides from `monoArgTyName`'s text (`i32`/`i64`/`f64`).

## Rulings (orchestrator, 2026-11-07), for slice 2

1. A literal union spells by its rep key (`litUnionAliasNameOfTy`). A literal union's type carries
   its rep (the ruled one literal-union rep), so the rep key is the canonical spelling. A numeric
   literal union spells as its base scalar: this keeps P11, and erasing it splits instances.
2. A record that is a union member and has no `sNames` row falls back to its `uVariants` row.
3. Names may move. A name reaches only the name section and backtraces, and output must hold. Two
   declared names over one row spell as the first in declaration order, not collect order.
