# The last pin parses outside the argument ladder (2026-11-08)

Item 2 of the last-parses lane. It follows [2026-11-07-pin-spelling-no-parse.md](2026-11-07-pin-spelling-no-parse.md),
which listed four `nameToTy` calls on pin text outside `monoInstanceFor`. The rule is that a
spelling is derived from a type and is never parsed back into one.

## What changed

| site | it parsed | it now reads |
|---|---|---|
| `monoPinNamesTy` (a concrete parameter's agreement in `monoInstanceFor`) | the pin's name | `pinTys[i]`, the type `monoInstanceFor` already holds for that pin |
| `monoInstanceFor`'s widened result | `monoInstanceRetName` and the substituted result spelling `rs` | `monoInstanceRetTy` (the result of the slot type `tnameTy`, set beside the name), and the result annotation substituted through the bindings |
| `monoDeliverCallRets`'s `at2` | `ann` | `annTy` |
| `monoCoerceChoiceBinding`'s key | `tname` | `tnameTy` |
| `monoCallIfBound`, the choice binding's call-site twin | `ct` | `dFt[0]`, the slot type `monoSlotPinNameTys` hands back |
| the maker delivered at a closed function type (`monoCoerceFnValueTys`) | `tname` | `tnameTy` |

`monoInstanceRetTy` is cleared with `monoInstanceRetName` in the per-program reset. `monoCoerceChoiceBinding` was reached from `monoPinTyParamComposite` with no type. That caller
now hands the parameter type substituted through the bindings (`substTyDeepOf`) whenever `pinC`
is still the plain substituted spelling. When a rest-union or row pin replaced the spelling, it
hands -1.

## Measured

Probe method as in #6740. A probe build kept each parse and failed loudly (`emitFail`, one tag per
site) wherever the parse and the type disagreed. It ran over the sweep population (23,613 programs).

| site | programs where the parse disagreed |
|---|---|
| `monoPinNamesTy`, widened result | 0 (deleted outright) |
| choice binding | 2, both closed by the `monoPinTyParamComposite` type |
| `at2` | 2, where `ann` spells a `void` result and `annTy` an `i32` one; deleting the parse moves no output |

Both seeds were built to a fixpoint (a second `refresh-compiler.sh` was byte-identical). Base is
`claude/pin-spelling-no-parse` at `8678fbe5`; candidate is that tree with this change.

| | |
|---|---|
| sweep | 23,613 of 23,613 same (0 bytes-only, 0 output movers, 0 `runs → not-runs`) |
| seed | 6,485,865 → 6,486,052 bytes (+187) |
| pin-helper budget | no function added or removed |

## Parked: step 4, the argument ladder's own type

`monoPinOwnOfSpelled`'s parse is load-bearing. A probe that failed wherever it returned something
other than the argument's type fired in 434 programs, all of them on `monoArgTyName`'s answer.
A trial patch made the ladder hand back the type each rung spells from, through a `tyOut` list
threaded through `monoArgTyName`, `…Cascade`, `…Bound`, `…Projected`, `…Rep` and `monoArgPinName`.
The typed rungs were the closed type, its numeric-literal base, the build row, the parameter
annotation, the hole map and the expression's struct row. With that patch, 57 programs still
disagreed. In each one the spelling names a REP that differs from the type it came from: a
newtype brand pins its base (`Id` → `i32`, 25 programs; `F32x4` → `v128`), a `Set<K>` pins
`{[K]:boolean}`, `readonly i32[]` pins `i32[]`, and an alias pins its target record. The step
that collapses them is `monoAnnPinName`, a name→name ladder. So the type the pin denotes needs
a type-level `monoAnnPinName`, and that is the next piece of work.
