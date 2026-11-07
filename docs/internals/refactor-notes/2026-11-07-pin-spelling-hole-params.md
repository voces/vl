# The naming rule names a hole parameter's pin (2026-11-07)

Slice 2b of the call-param lane ([architecture-target-2026-10.md](../architecture-target-2026-10.md)
§3.4), after slice 2a (#6702) took every decision off the pin's spelling. `monoPinSpellOf` now
names the pin of an **un-annotated** parameter, at both instance makers (`monoInstantiateCallIn`
and `monoInstanceFor`), through `monoPinRespell` in `compiler/pin_spell.vl`. The producer takes the
binding rulings of the shadow note: a literal union spells by its alias, a numeric one by its base
scalar, a string one with a null member as its alias and `|null`, and a union member's record falls
back to its `uVariants` row.

## Why only un-annotated parameters

Each candidate was built from the base fixpoint and swept (23,610 programs):

| candidate | respelled | lost `runs` | new traps |
|---|---|---|---|
| B | every closed pin | 168 | 89 |
| C | pins holding no record, map or non-literal union | 78 | 41 |
| D | C, at un-annotated parameters only | 1 | 0 |
| E | D, a union of string and numeric literals excluded | 0 | 0 |

B and C fail for one reason: `pinTys` holds the **argument's** type, and an annotated parameter's
pin is its substituted annotation. `len<T>(t: T[] | i32)` called with `[1, 2]` pins `i32[]|i32`
while `pinTys` holds `i32[]`, so its spelling drops the union (D10131, then `is` refuses). Only at
an un-annotated parameter are the pin and the argument's type the same thing. D's one loss was
`AB | N12` (`d3127_…_i32_call_hole`), a union of string and numeric literals that has no single
rep to spell. E's one bytes-only mover was a lone literal, `catLit(one[0])` at `"red"`, which mono
pins as the literal union's `i32` atom and the structural spelling turned into a string ref, so a
lone literal keeps mono's spelling too.

## What is still mono's, and why

- **Records, maps and non-literal unions**, even at a hole: C's 78 losses are emit readers that
  resolve the pin's text by name (`is` against a declared union, `{[i32]:boolean}` against
  `Set<i32>`, the struct-or-union element arrays). Each one needs the pin's type handed to it first.
- **Annotated parameters**: they need a column holding the pin type, the parameter's own substituted
  annotation type, which neither maker builds yet (`pinTys` is the argument's).
- **Type-parameter bindings (`tvV`)**: not switched in this slice.
- **The two name parses the handoff named are live.** A throwaway probe build that `emitFail`ed where
  the old and new answers differ: `monoInstanceFor`'s `nameToTy(pinnedNames[j])` fallback answers
  in 280 programs, and `monoKeyPinSeg`'s row class read from the name differs from the one read from
  `pinTys` in 108. Neither can be deleted: the first needs its 13 callers to hand types, and the
  second needs the pin-type column above, since `pinTys` is the argument's.
- **Pin kinds** (`pinKindOfName`) are read from mono's spelling, before the respell, so no kind moves.

## Measured

Final candidate on master `c8c6aa95`, built to a fixpoint (two `refresh-compiler.sh` runs,
byte-identical), against the master fixpoint:

| | |
|---|---|
| sweep | SEE_SWEEP |
| seed | 6,444,894 → SEE_SEED bytes |
| pin-helper budget (`emit_mono.vl`) | 944 → 944 (the helpers live in `pin_spell.vl`) |
