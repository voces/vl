# The instance key reads the pin's own type (2026-11-07)

Step 2 of the pin-type-column lane ([architecture-target-2026-10.md](../architecture-target-2026-10.md)
§3.4). Step 1 ([2026-11-07-pin-type-column.md](2026-11-07-pin-type-column.md)) added `pinOwn`, each
pin's own type. `monoKeyPinSeg` now takes a pin's row class from it, `typeRowClassOf(pinOwn[pk])`,
in place of `typeRowClassOf(repElemTyOfName(pinned[pk]))`. One name→type parse leaves the key. The
shadow note that compared the two readings (`monoPinOwnRowNote`) is deleted.

## The four type disagreements, triaged

Step 1's probe found 4 programs where the column and the name have different row classes, not just
a row against no row. Each is a pin site where mono's name binding and typed binding disagree. In
all four the instance is built at the name, so the column was the wrong side. It is fixed at its
pin site.

| program | name | column was | cause | column now |
|---|---|---|---|---|
| `generics/null-only-type-param-binds-never` | `{z:i32}\|null` | `{z:never}\|null` | a `null`-only argument binds `Z` to `never` in `tvT` and to the default in `tvV` (`monoBindTyParamElab`), because a `never` slot reps as the default (D15530) | the default, via `monoPinOwnTvAtRep` |
| `generics/nullable-alias-app-type-param-binds` | `CN<i32>\|null` | `{v:never}\|null` | the same | the same |
| `soundness/covariant-record-field-read-only-runs` | `{x:i32\|string}` | `{x:i32}` | bare `T`: the name is the rep of `a`, widened by an alias to a wider record (`monoArgPinName`). The column was the checker's type | the type the name spells, via `monoPinOwnOfSpelled` |
| `soundness/error-generic-nulreflist-field-pin` | `P[]\|null` | `P[]` | bare `T`: the name is the un-narrowed binding's rep. The column was the narrowed type | the same |

`monoPinOwnTvAtRep` replaces a `never` binding whose spelling is the default with that default
(`elabUnboundTpTy`). It is used at both annotation sites (`T[]` and a type-parameter composite),
which close the pattern under the typed bindings. `monoPinOwnOfSpelled` keeps the argument's type
unless the bare-`T` spelling names another closed type. That is a `nameToTy` parse at the pin
site. It lasts until `monoArgPinName`'s ladder hands back the type it spells from (step 4 of this
lane).

After the fix, a probe that fails on any row-class disagreement fires in no program of the sweep
population (see Measured).

The bare-`T` hazard has no witness today. A plain `{x:i32}` argument to the bounded `T` of
`covariant-record-field-read-only-runs` that its body tests with `is` is refused on base and on
the candidate (`` `is` names a declared union member with no interned arm representation ``). So
the program that would merge the plain argument's instance with the widened one cannot be built.

## The 86 a row against no row

The name resolved to no row, and the column holds a record. Each such key now carries `#row<cls>`
in place of the spelling. Over the sweep population no instance merged or split. The sweep is
23,610 of 23,610 same, with 0 bytes-only movers.

## Measured

Both seeds were built to a fixpoint (two `refresh-compiler.sh` runs, byte-identical). The base is
`claude/pin-type-column` at `acd8e896`, with master `30d4bfd2` merged.

| | |
|---|---|
| sweep | 23,610 of 23,610 same (0 bytes-only, 0 output movers, 0 `runs → not-runs`) |
| row-class disagreements, name against column (probe) | 4 → 0 |
| seed | 6,457,284 → 6,457,371 bytes (+87) |
| pin-helper budget (`emit_mono.vl`) | 943 → 943 |
