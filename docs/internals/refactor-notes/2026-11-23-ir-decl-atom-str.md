# IR: a narrowed `K | null` decoded into a plain string (2026-11-23, lane IR-D1)

The last corpus cell of `declaration coercion` mine, `named/d16530_typed_dst.vl`. In
`const s: string = v ?? "none"`, with `v` narrowed to `"green"`, the binding reads a nullable
atom (`#lu0 | null`) at `string`. The other seven corpus cells (`d16132_*`) are M1's
heap-identity family.

## Mechanism

Legacy decodes the atom with `atomStrTail`, its plan writing no null (`atomStrPlanOf`'s `apNul`
false). `atomAtStr` named only an atom at a string, or a `K | null` at a `string | null`. `widenTo`
now also takes `atomToStr` for a `K | null` at a plain string; `atomToStr` already misses where the
plan writes a null.

## Verifier

The `RAtomStr` rule refused a `K | null` into a plain string, since the plan's null is invisible
to it. The facts pass now notes on each `RAtomStr` whether its plan writes a null (`irFactInt`).
A node-less decode is noted as writing one. The rule admits the plain string where the noted fact
is null-free. Keyed self-tests:
- `atom-decode-nullable-into-string`: refused, 2;
- `atom-decode-nullable-into-nullable-string`: holds, 0.

## Readings

Master 10cbad91 → head, fixpoint seeds: ir-i8 census `declaration coercion` in the distilled
corpus 8 → 7 (the 7 are M1's), and `argument coercion` in tests/cases 27 → 26 by the same widening.

## Legacy tails the IR calls

None new (`atomStrTail` already, through `RAtomStr`).
