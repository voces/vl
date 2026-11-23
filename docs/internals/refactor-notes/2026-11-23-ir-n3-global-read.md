# IR-N3: `start: global read coercion` (2026-11-23, lane IR-N3)

The class is a module global read whose cell rep is not the rep the checker typed the read at,
on no arm the global path had: 29 starts and 7 functions on master c12265041.

## A union global narrowed to a record arm

`if v is J { v.r }` on a global `v: J | string` reads the box at legacy's `global.get`, then its
payload cast to `J`'s variant (`narrowedVariantTail`), the bytes a local's narrowed read writes.
The local's arm (`narrowedBoxVariantPlain`) is asked of a `local` read only; its global sibling
`narrowedGlobalBoxVariant` (`emit_plan_union.vl`) is the same decision for a `nonlocal` read of
a module global. `boxNarrowArmOf` takes either, and `boxNarrow`'s lowering reads the one that
holds. 13 starts leave the class; 9 of them now stop at `coalesce field place`, the `??` of the
field they read.

## A literal-union global at a string

A global whose cell holds a literal-union atom, read where the checker typed a string (or
`string | null`) and a delivery seats the read (`cell`), passes the id as a local's read does;
the delivery's atom arm decodes it. The temp is typed at the binding's type, whose rep is the
cell's.

## Legacy tails the IR calls

- `narrowedVariantTail`: the payload cast after a global's box read (unchanged; the local arm
  already called it).
