# A module global's narrowed union read unboxes to its record arm (2026-11-23, lane IR-N5)

`start: global read coercion` was 29 functions in 29 programs (23 sole) on master e6cb8541.
A probe naming the cell and read reps of each miss found that the largest family (15 of 36 read
rows) is a module global's union-box cell read at a record arm the checker narrowed it to.
`narrowedBoxVariantPlain` admitted only a read whose arm (`identReadArmOf`) is `local`; a global's
is `nonlocal`, so the IR never took the variant unbox that `globalUnboxRead` already builds.
Legacy's destination coerce (`variantCoerceArmOf` `box`) unboxes a global as it does a local.

## The change

`narrowedBoxVariantPlain` admits a `nonlocal` read of a module global (`globalIndexOfSid`). Only
the IR asks it (the builder's `boxNarrowArmOf` and the lowering's `RBoxNarrow`), so no legacy byte
moves.

New test case: `unions/global-union-reassigned-to-an-arm-read-at-it.vl`.

## What it unblocks

The start rows fall 29 → 17. Of the 12 start bodies past the read, 9 stop next at
`start: coalesce field place`, so they land when that class does.

## Not in this change

The 17 rows left are families of one to five: a nullable union cell read at a nullable rep, an
atom cell read as a string, a struct cell read at another record (not a retag `recRetagNoted`
admits), an i32 cell read as a closure, and a few single shapes.
