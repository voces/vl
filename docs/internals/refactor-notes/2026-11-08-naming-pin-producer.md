# The pin's type from its type: naming rule slice 2 (2026-11-08)

Follows [2026-11-08-naming-last-readers.md](2026-11-08-naming-last-readers.md), which left
`recordClonedNodeTyFb` resolving `monoSynthPinRef`'s pin by name first, against `pinTys` in 513
programs. The rule: a spelling derives from the canonical type and is never parsed back.

## What changed

| site | before | now |
|---|---|---|
| `monoSynthPinRef` | the name's type, `tyFb` where it did not resolve | the handed type wherever it is closed; the name only for an open one |
| its annotated-parameter caller | `pinTys` (the argument's type) | `pinOwn`, the parameter's own type |
| its un-annotated caller | `pinTys` | `monoPinWidenTy(pinTys)`: the type the pin spelling widens to |
| `monoPinTyParamComposite` | pin text `monoSubstAnn` over text bindings | `monoPinSpellOf(pinOwn)` where it closes and no rest or row pin replaced it |

`monoPinWidenTy` (pin_spell.vl): in a union, a numeric or boolean literal beside any other member
is its base scalar, and a string literal beside such a literal is `string`. A literal union alone
keeps its rep (ruling 1: its alias, or a numeric union's base scalar).

## Measured

Probe as in #6772: a probe build failed loudly (`emitFail`, tagged by site) where the name's
type and the handed type disagreed (`tySame`), over the sweep population (23,628).

| step | programs | what the switch did to output |
|---|---|---|
| `pinTys` at every site (the brief's literal reading) | 313 disagree | 52 output movers, 50 `runs → not-runs` |
| annotated site reads `pinOwn`, literals left on the name | 147 disagree (`#anonN` rows, `Set<K>`, `((i32)=>i32\|null)[]` misparsed) | 0 movers |
| every closed pin, no widening | | 2 movers, both a mixed literal union (`"a"\|1`, `boolean\|1`) spelled widened |
| with `monoPinWidenTy` | | 0 movers |
| `#anonN` list route only for open types | | 0 movers |
| composite pins spelled from `pinOwn` | 104 respelled | 0 movers |

Rows above graded one-level builds against the base. The final graded fixpoint seeds (a third
`refresh-compiler.sh` byte-identical). Base is master `2150af91` with #6772 merged:

| | |
|---|---|
| sweep | 23,628: 23,507 same, 121 bytes-only, 0 output movers, 0 `runs → not-runs` |
| seed | 6,510,326 → 6,510,973 bytes (+647, 0.01%) |
| pin-helper budget (`emit_mono.vl`) | 927 → 927 |

So the annotated kind was never the name being right and the type wrong: `pinTys` is the
argument's type, a member of the parameter's union, and the parameter's own type agrees with the
name everywhere it closes. The `#anonN` and `Set<K>` kinds were the name being wrong (a placeholder
`{}`, a map without its set flag), invisible in output.

Composite respellings are order (`string[]|i32[]` to `i32[]|string[]`), `Set<i32>` for
`{[i32]:boolean}`, an `#anonN` row for its shape, and `Circle` to `Dot` (two declared names over
one row: ruling 3's declaration order is not yet what `sNames` holds).

## Tried and parked

- **Spelling `monoSynthPinRef`'s text from `monoPinSpellOf(type)`**: 41 `runs → not-runs`
  (`only i32[] arrays…`, `field access receiver is not a struct`, 13 traps). Emit readers still
  read the synthesized node's text (`tyNameOf`), so the text waits on those readers.
- **`canonEmitNameOfTy` without its `nameToTy`**: 2 `runs → not-runs` (D4268,
  `shared-nullable-literal-field-read.vl`). The round trip asks whether `canonEmitName`'s text
  collapses a twin-record union to one record, which the type alone does not say. The other five
  canonical-name helpers take strings only, so their callers must hand a type first.

## What still reads a name

- `monoSynthPinRef` for an open pin type (`synthTypeRefFb`), plus `monoAnonRowListTy`'s row lookup.
- The two body-rewrite substitution sites and `recordClonedIsVarTy` (exact bindings only, as before).
- check_program.vl's six canonical-name round trips (unchanged).
