# IR coverage: a boxed `U | null` read narrowed to one variant (2026-11-20, lane IR6)

The self-compile's largest one-blocker row at master 890abde5 was `narrowed read`, 127 functions.
A scratch instrumented build (its miss naming the local's rep, the read's rep and
`identReadArmOf`) split it:

| local's rep | read at | arm | functions |
|---|---|---|---|
| nullable disc 4, inner box | a variant record | `local` | 98 |
| box | box | `local` | 14 |
| atom | string | `local` | 9 |
| nullable disc 1, inner list | list | `local` | 4 |
| nullable disc 3, inner atom | string | `local` | 2 |

The 98 are a boxed `U | null` local narrowed past its null and delivered at one variant:
legacy's `emitVariantCoerce` box arm (`variantCoerceArmOf`'s `box`) reads the local and writes
`narrowedVariantTail`, the same bytes as for a plain box local, since a narrowed read of the
nullable box is the bare `local.get`. `narrowedLocalRead`'s box-narrow arm now takes the disc-4
nullable too, and `ir_verify` admits that operand for an `RBoxNarrow` at a record, as it already
did for the atom unbox (#9204). The armed shadow matches every function it covers.

The other 29 are left: the box at a box rep and the atom at a string are not narrowings the
`RBoxNarrow` or `RRecover` arms describe.

## Lines

| | lines |
|---|---|
| compiler | +4, −2 |
