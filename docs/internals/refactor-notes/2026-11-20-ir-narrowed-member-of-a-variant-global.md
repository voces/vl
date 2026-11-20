# Fix: a narrowed member record off a variant global, and a store through one (2026-11-20, lane IR6; D17028, D17029)

`if z.h is B { showB(z.h) }`, with `z` a module `const` of a record `W` that is a union member,
wrote invalid wasm: the field's union box reached `showB`'s `B` parameter. And `if q.h is B {
q.h.w = 5 }` wrote invalid wasm off every receiver.

## D17028: the receiver's row

`boxedArmOfMember` names a read of a member record out of the union field it is held in, from the
receiver's struct row. A variant global has none: `globalReadStructIndex` is gated on the global's
cell kind (D200), so the struct and variant readers never both answer for one binding. So the
read was never named, its tail never cast, and the box reached the record destination.

`boxedRecvRowOf` gives `boxedArmAtRow`'s two callers, `boxedArmOfMember` and
`structIndexOfMemberStore`'s boxed-arm rung, the variant's row where the receiver has no struct
row. `structIndexOfExpr` and the D200 gate are unchanged for every other reader. Both callers must
move together: with `boxedArmOfMember` alone the read casts, but `structIndexOfExpr(z.h)` stays -1,
`holeBoxPlanOf` answers `ladder` at every union delivery, and a first prototype lost 41 runs.

## D17029: the store's own unbox

A field store under the narrowing takes `fieldStoreArmOf`'s `narrowVariant` arm,
`emitFieldStoreNarrowed`: the receiver, then the box's payload cast, then the write. Where the
receiver is a `boxedArmOfMember` read, its own tail has already cast it, and the store unboxed a
record. It now skips that unbox for such a receiver (the D17025 shape: the writer honours the
shared decision). A variant global's store ran before only because D17028 named nothing there.

## What the IR saw

The IR never covered D17029's stores: `fieldStore` takes `narrowVariant` only where
`narrowedBoxVariantPlain` names the receiver's variant, which it does not for a member receiver.
D17028's deliveries it did cover: on #9255's seed the armed shadow matched none of the two
functions that deliver a variant global's narrowed field at `B` (`inFn`, `early` in the case file),
legacy being the invalid side, and matches all four here. No corpus cell reaches the shape, so the
corpus shadow saw a divergence only these hand cases reach; the matrix is the witness for a
shared-decision change.

## The one known byte movement

A narrowed variant-global field delivered to its own union (`showU(z.h)`, `showU(h: A | B)`) used
to pass the field's box as it stood. It is now cast to `B` and boxed again under `B`'s tag, which is
what a parameter, local or struct receiver of the same shape already does:

    -      (struct.get $3 0
    -       (global.get $global$2)
    +      (struct.new $7
    +       (i32.const 2)
    +       (ref.cast (ref $0)
    +        (struct.get $7 1
    +         (struct.get $3 0
    +          (global.get $global$2)

The output is the same. Passing the box through where a cast read is delivered to its own union
would be a cost change to the shared decision for all four receivers, a candidate, not this fix.

## Witnesses

- `tests/cases/narrowing/narrowed-field-of-a-global-union-member-record.vl`: reads, record and
  union deliveries, an early return, and field and whole-field stores off a variant global.
- `tests/cases/narrowing/narrowed-field-store-through-a-member-record.vl`: field stores through
  the narrowed read off a parameter, a local copy, and a plain and a variant global.
- `scripts/capability-probes/matrix/narrowed-member-record-*-recv.matrix.vl`: all three 72 of 72.
