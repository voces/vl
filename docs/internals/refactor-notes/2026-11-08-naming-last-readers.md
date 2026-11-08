# The naming rule's last readers (2026-11-08)

Follows [2026-11-08-pin-step4-types.md](2026-11-08-pin-step4-types.md), which left three emit readers
in `check_emit_queries.vl` resolving a pin by name. The rule: a spelling derives from the canonical
type and is never parsed back into one.

## What changed

| reader | before | now |
|---|---|---|
| `recordClonedNodeTyKnown` | `tyIn < 0` parsed the name | records `tyIn`, else the pin kind's placeholder; takes no name |
| `recordClonedNodeTy`, `synthTypeRef` | name only | deleted |
| `monoMakeInstanceHit`'s hole parameter | `synthTypeRef(pin)` | `monoSynthPinRef(pin, pinTys[i])`, as the clone arm |
| `monoMakeInstanceParams`' written-annotation arm | `recordClonedNodeTy(pin)` | `pinOwn`, else `pinTys` |
| void returns (`$voidtw`, a rewritten `fnRet`) | `"void"` parsed | `TY_VOID` |
| `$extv` wrappers | the link row's spellings parsed | `externLinkTyAt(k)`, the type `checkExternDecls` resolved |
| `$eqc` cores | the row's name parsed | `slotRowTyOf(row)` |
| void twins | the slot's parameter spellings parsed | the slot's function type, carried on `voidTwinSeamNote` |
| `monoPinnedTyParamCanon` | `tyName == tp` / `tp + "[]"` | the annotation's type: a `TyVar` named `tp`, a list of one, else `bindGenWalk` |

## Measured

Probe method as in #6762: a probe build failed loudly (`emitFail`, one tag per site) wherever the
name's type and the handed type disagreed (`tySame`), over the sweep population (23,615). A first
build tagged every `synthTypeRefTy` call that handed `-1` and still resolved a name (`K`): 850
programs fired, at nine sites, before any type was handed.

| site | programs disagreeing once handed a type | outcome |
|---|---|---|
| hole parameter, cloned parameter, void, `$extv`, `$eqc`, void twin | 0 | switched |
| `monoPinnedTyParamCanon` | 2 | switched; both are the control below |
| `monoSynthPinRef` (`recordClonedNodeTyFb`) | 513 | kept, name first |
| `monoSubstAnnNode`, `monoSubstLetType`'s union arm | 42 + 2 | kept, name only where no closed substitution |
| `monoSubstIsExpr` (`recordClonedIsVarTy`) | 10 | kept |

The `monoPinnedTyParamCanon` probe's two programs are `type-param-name-shadows-builtin*.vl`: a type
parameter named `i32`, whose `v: i32` the checker resolves to the builtin. The spelling test bound
it by the coincidence of names; the type does not, which is the checker's ruling.

## What still reads a name, and why

- **`recordClonedNodeTyFb`** (`monoSynthPinRef`, and the two substitution sites with no closed
  type). Against `pinTys` it disagrees in 513 programs, against `pinOwn` in 364. Four kinds: a pin
  spelled by its rep (a function-hole list pinned `i32[]` while its type is `((_) => _)[]`, 72); a
  literal pin spelled widened (`string` while the type is the alias `K`); `Set<K>` against its map;
  an `#anonN` row, which resolves to no type and takes the placeholder where the type is the record.
  Each is a pin spelling that is not `monoPinSpellOf(type)`, so it waits on slice 2 of the naming
  rule (the spelling's producer), not on a reader.
- **`recordClonedIsVarTy`** and the 44 substitution programs: a body rewrite holds only the exact
  bindings (`exSubN`/`exSubT`); a type parameter bound by the ladder closes only in the text
  bindings (`tvV`). They need the instance's typed bindings carried to the body rewrite.

## `nameToTy` under `compiler/` after this

`check_emit_queries.vl` holds two calls, `recordClonedNodeTyFb` and `recordClonedIsVarTy`, the two
readers above. `check_program.vl`'s canonical-name helpers parse a spelling back six times
(`unionMemberGenAppShape`, `canonEmitNameOfTy`, `canonBankTyOf` twice, `canonEmitUnionName`,
`canonSameShapeRecord`): these are emit-facing, not annotation resolution. The rest is check-side
annotation and name resolution (`check_relate_core.vl`, `check_operators.vl`, `check_statements.vl`,
`check_top_level.vl`).

## §3.4

- `monoPinnedTyParamCanon`: switched, reads the type.
- `monoPinTyParamComposite`: calls no `nameToTy`. Its pin is `monoSubstAnn` over the text bindings,
  while `pinOwn` already holds the type, so it waits on slice 2 (`monoPinSpellOf` as producer), not
  on the pin-type column.
