# The pin's text from its type: naming rule slice 3 (2026-11-08)

Follows [2026-11-08-naming-pin-producer.md](2026-11-08-naming-pin-producer.md), which typed
`monoSynthPinRef`'s node by its handed type but left its TEXT on mono's name, because spelling
the text from `monoPinSpellOf` cost 41 `runs → not-runs`.

## What the 41 were

A probe build (`emitFail` where `monoPinSpellOf(ty)` and the name differ) over the 41 programs
gave the spelling pairs. None was a reader reading the text as the wrong type. Every one was a
spelling `monoPinSpellOf` produced that no annotation reader parses:

| name (old text) | `monoPinSpellOf` (before) | kind | now |
|---|---|---|---|
| `{[i32]:boolean}`, `…\|null`, `…[]` | `Set<i32>`, … | set | spelled as its map |
| `i32[]`, `St[]` | `readonly i32[]` | readonly view | spelled as its list |
| `S`, `Shape`, `M` | `A\|B`, `Circle\|Rect`, the members' shapes | declared union | its declared name |
| `A\|B` | `{n:i32\|string}\|{n:string}` | arm records over a shape row | the record's declared name first |
| `N[]`, `N[][]` | `(i32)[]` | numeric literal union in a list | `i32[]`: parentheses only around a bar |
| `K\|i32\|null` | `(K\|i32)\|null` | nullable union | one flat union |

The set flag and `readonly` live on the node's TYPE (`mSet`, `aRead`), which every reader that
needs them already reads; the text spells the rep, as ruling 1 spells a literal union.

## Ruling 3

`monoPinSpellOf` named a record by the row `repRowOfTyStruct` found first, the order emit
registered rows. It now takes the first name in declaration order (`cStructNames`) whose record
has the type's row identity (`repRowId`), and the row's own name only where no declared record
has it. An arm record with no struct row takes the same name before its variant row.
Witness: `type Circle = {r: i32}` (an arm of `Shape = Circle | Sq`) declared before
`type Dot = {r: i32}`; `app((a, b): Circle => …)` pinned `(i32,i32)=>Dot`, now
`(i32,i32)=>Circle`. With `Dot` declared first, `Circle` still spells `Dot`, which
`vl_pin_spell_shadow_test.ts` pins as a shadow disagreement with mono's spelling.

## `canonEmitNameOfTy` without `nameToTy`

The round trip asked whether `canonEmitName(nom)` re-parses to one record. As a type question:
the union's record arms share one shape row, meaning no declared union names it and two arms are
records no declared name spells (`canonTwinArmsShareRow`). Declared arms (`C | D` with
`C = {v: 1|null}`, `D = {v: 2|null}`) keep their names and do not collapse; that was the
`shared-nullable-literal-field-read.vl` and D4268 failure of the first attempt.

## Measured

Fixpoint seeds on both sides (a third `refresh-compiler.sh` byte-identical). Base is master
`e61f650e`; candidate is this branch with it merged:

| | |
|---|---|
| sweep | 23,650: 23,650 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs` |
| the text switch alone, one-level, before the spelling fixes | 41 `runs → not-runs`, 13 new compiler traps |
| seed | 6,513,186 → 6,513,532 bytes (+346, 0.005%) |
| pin-helper budget (`emit_mono.vl`) | 927 → 927 |

Not one module byte moved, so in the sweep population every reader of a synthesized pin's text
now reads text that names the same type its node carries, or does not depend on the difference.

## What still reads a name

- `monoSynthPinRef` for an OPEN pin type (`synthTypeRefFb`), plus `monoAnonRowListTy`'s row
  lookup. Closing it needs the instance's bound column for the type variable the pin still
  carries (`elabUnboundTpTy`) at the parameter, so the pin is closed before it is spelled.
- The two body-rewrite sites (`monoSubstLetType`'s registered-union arm and the substituted
  annotation's `sty < 0` arm). They hold only exact bindings (`bN`/`bT`); closing them needs
  the rewrite to carry the instance's full type column, the one the elaboration keys, rather
  than the exact-binding subset.
- `nameToTy` outside check-side annotation resolution: `check_program.vl` 4 (the string
  canonical-name helpers: member, spelling and name round trips), `check_emit_queries.vl` 2
  (`recordClonedNodeTyFb`, `recordClonedIsVarTy`), `check_relate_core.vl` 16.
