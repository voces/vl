# The argument ladder hands back its type; no pin spelling is parsed (2026-11-08)

Step 4 of the pin-type-column lane ([architecture-target-2026-10.md](../architecture-target-2026-10.md)
§3.4). It follows [2026-11-08-pin-last-parses.md](2026-11-08-pin-last-parses.md), which parked
`monoPinOwnOfSpelled`'s parse: load-bearing in 434 programs, all on `monoArgTyName`'s answer.
The rule is that a spelling is derived from a type and is never parsed back into one.

## What changed

| site | it parsed | it now reads |
|---|---|---|
| `monoPinOwnOfSpelled` (deleted), the bare-`T` pin's own type | `monoArgPinName`'s answer | the type the ladder spelled it from, collapsed by `monoAnnPinTy` |
| `monoPinSpellTy` (deleted), the type a minted union pin registers | the canon spelling `c` | `pinOwn` at the parameter (the whole substituted annotation), the substituted type at a `let`, collapsed by `monoAnnPinTy` |
| `monoValueAtAnnTy` | the slot's pin signature `ann` | the delivery function type the flow table's pin was spelled from (`fts`, now also out of `monoFlowSlotPins`) |

`monoArgTyName`, its `Cascade`/`Bound`/`Projected`/`Rep` rungs, `monoBuildTyPin` and `monoArgPinName`
take a `tyOut` list. A rung that spells its answer from a type sets it: the closed argument type
(`monoClosedPinOwnTy`: a record's declared row type, a numeric-literal union's base, a lone string
literal's `string`), the build row, a binding's or parameter's annotation substituted in the
instance, the hole map's closed type, the struct row, the unbound variable's elaboration type, a
list's element. A rung that renames the answer (narrowed, niche-widened, nullable-record list)
clears it, and the pin falls back to the argument's banked type, as the parse did when it agreed.

`monoAnnPinTy` (`pin_spell.vl`) is the type-level `monoAnnPinName`: a newtype brand is its base, a
`readonly` list the list, a `Set<K>` the map `{[K]: boolean}`, a numeric-literal union its base
scalar, at every depth of a list, nullable, map, record or union.

## Measured

Probe method as in #6749: a probe build kept each parse and failed loudly (`emitFail`, one tag per
site and source) wherever the parse and the type disagreed, over the sweep population (23,615).

| step | `monoPinOwnOfSpelled` | `monoPinSpellTy` | `monoValueAtAnnTy` |
|---|---|---|---|
| base (#6749 merged) | 434 (#6749's probe) | — | — |
| ladder types threaded | 13 | — | — |
| record row, string literal, substituted annotations, unbound variable | 5 | 38 | 0 |
| `pinOwn` to the union pin; record, union and numeric-literal arms of the collapse | — | 0 | 0 |

Each probe sweep showed 0 movers among the programs it did not stop. The 5 left on
`monoPinOwnOfSpelled` were taken by a switched build (the parse removed, nothing else) that swept
23,615 of 23,615 same: three where the name was an `#anonN` row (which the parse could not read,
so it kept the argument's type, and the ladder hands the row's), a `K` where the argument type is
open, and `K | (L | i32)` pinned by its row's `string|i32` spelling. They do not move a byte.

The `monoPinSpellTy` probe fired 38 times before `pinOwn` was handed down: the instance builder
passed the ARGUMENT's type (`{a: i32}`) where the union spelled the whole parameter (`{a:i32}|null`),
which is what made the parse load-bearing. The `monoValueAtAnnTy` probe never fired; the three
`returns another type than the element's` cases in `tests/cases/closures/` exercise its reader and
are in the sweep.

Both seeds built to a fixpoint (a second `refresh-compiler.sh` byte-identical). Base is master
`4f754a32`; candidate is this branch with it merged.

| | |
|---|---|
| sweep | 23,615: 23,614 same, 1 bytes-only, 0 output movers, 0 `runs → not-runs` |
| seed | 6,500,272 → 6,503,783 bytes (+3,511, 0.05%) |
| pin-helper budget (`emit_mono.vl`) | 931 → 930 (`monoPinSpellTy` inlined; the new helpers live in `pin_spell.vl`) |

The bytes-only mover is `tests/cases/generics/pin-inferred-from-union-argument.vl`: the union pin
now registers the collapsed type (`Set<i32>` minted as `{[i32]: boolean}`) rather than the
parse's, so two wasm types are numbered in the other order. Same size, and the same definitions
once type indices are erased.

## `nameToTy` under `compiler/` after this

`emit_mono.vl` calls it nowhere. The rest are check-side annotation and name resolution
(`check_relate_core.vl`, `check_program.vl`, `annotResolve`), except three emit readers that resolve
a pin by name in `check_emit_queries.vl`: `recordClonedNodeTyFb` (name first, a type as fallback,
from `emit_nullable_rets.vl`), `recordClonedNodeTyKnown`'s `tyIn < 0` route and
`recordClonedIsVarTy` (`emit_mono.vl`'s variant test). Those are the next readers to hand a type.
