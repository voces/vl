# IR: a captured `for-in` variable at its read's rep, gated by legacy's capture valtype, 2026-11-22

Stacked on `2026-11-21-ir-capture-held-i32`. A `for-in` variable's LoopVar declaration records no
type, so `capTyOf` found none, and every closure capturing a loop variable missed as `capture
binding`: 50 rows on tests/cases. Legacy's binding column covers only the 4 that are
literal-union atoms (`loopVarCellGo`).

## The change

`capRepFor(fe, name, readRep)` is `capRepOf` with a candidate: a captured loop variable takes
the read's own rep. It is admitted only through the comparison `capRepOf` already makes for
every capture: legacy's capture valtype must agree byte for byte. That valtype is
`captureValKind` written through `fbValtype`, which for a loop variable is legacy's own
`forInElemKind` / `forInPairElemKind` ladder, the one `declareForInLocals` types the local with.
A lifted function's capture parameter is made at that rep, and a later read at another rep
misses by name. No binding-column change, no new state, no type derivation. The coordinator
ruled this in place of extending the column.

**Valtype agreement is coarser than rep agreement only within the i32 family.** That family is
i32, u32, bool, the atom, and the `K | null` and `boolean | null` niches. Two reps there differ
only by a narrowing or a signedness view of the same stored i32, because a loop variable is
fixed per iteration. A read the checker types narrower than the binding sees only the values
both encodings share, and the read itself is the same `local.get` or `struct.get`. Every
reference valtype names its heap index, so a reference rep agrees exactly.
