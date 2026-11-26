# A map holding bundle records of different signatures — design, 2026-11

D17106, stage 1 of the union-of-records design (coordinator ruling, 2026-11-26). A map's value slot
held one bundle record (`elabSlotRecordNote`), so stores returning records of different signature
sets, `lap`'s `{(f64)=>f64, (i32)=>i32}` beside `lap2`'s `{(boolean)=>boolean, (i32)=>i32}`, had no
slot type and the store was refused.

## The storage, which stage 2 keeps

* **The slot** is the union of the stored records' rows, the existing boxed-union rep: an `i32` tag
  and an `anyref` payload holding the record. elab notes it per binding (`elabSlotUnionNote`: the
  records, and each store's call with the record it returns). mono types the binding and the
  `Map()` at `Map<key, R1 | R2 | …>`, and each store's call at its own record's row
  (`monoPinSlotUnionMap`), so the store boxes the record whole.
* **Keyed on whether the map has a value read**, not on a usage shape. A use that is a store's
  receiver, a key test, a walk of the keys or a hand to a parameter only so used reads no value. A
  map with any other use keeps today's refusal at the store, so nothing that runs stops running.

## What stage 2 adds, and what it does not change

Stage 2 is [D17573](inventory/D17573.md): a value read back and called. It adds the read side only:
* a `ref.test` on the box's payload against each record row;
* then the member pick at the call's signature, as a single-record slot's read does today
  (`elabCallSigMember`).

The slot type, the box, the store and the elab fact are the ones stage 1 builds, so stage 2 needs no
storage change.

Calling a value at a signature some stored record has no member for is a type error the design
forbids. The checker refuses it with a sentence naming the contract, before stage 2. That closes the
clause-1 risk independently.

## Not covered here

A plain hole lambda stored beside a bundle ([D17572](inventory/D17572.md)) has no closed type to be
a union member. The checker types it at the bundle's open type, so the design builds it as the
bundle's record at the record's signatures (the producer rule of
`bundle-record-value-2026-11.md`). That is a delivery, not storage.
