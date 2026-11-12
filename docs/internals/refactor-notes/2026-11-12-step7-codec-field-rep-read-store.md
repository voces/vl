# Step 7 codecs: a field read's storage tag is its row's storage kind, not `fc<code>`, 2026-11-12

This is the `readFieldStoreKind` change that the classify batches held back
(`2026-11-12-step7-codec-field-rep-classify-member-reads.md`). It was built as a behaviour change
and measured as an identity.

## What changed

- **`readFieldStoreKind`** (`emit_classify.vl`) resolves the read through `memberFieldPos`.
  - A struct row or arm row is tagged with its storage kind (`fieldRowKind` / `armRowKind`), so
    `i32`, `str`, `closure`, `f64`, `nulnone` and the rest.
  - The `nullitatom` and `litatom` tags ask the row predicates (`fieldRowIsNulAtom`,
    `fieldRowIsPlainI32` and their arm twins).
  - A record field takes the read's own record rep, as before (`readRecordFieldStore`).
  - A shared read of an un-narrowed union of records keeps the plan code's path, now named
    `readFieldCodeStoreKind`.
- **New:** `armRowKind(r)` (`emit_eq_rows.vl`) and `armRowIsPlainI32(r)` (`emit_atom_kinds.vl`).

## Why this was graded as a behaviour change

The old tags spelled any code with no kind arm as `fc<N>`: a plain `i32` field was `fc0`, a
`string` field `fc3`. `readRepOf` has an `st == "i32"` arm, which reads an `i32` cell typed
`boolean | null` as that niche's sentinel. With the old tags that arm could never fire for a
field read, and with the new ones it can.

Before the change, a probe on master ran record fields typed `boolean | null`, `string`,
`string | null`, `i32`, `f64`, `K | null` and closure:

- read directly, bound to a local, through `??` and through `== null`;
- through a generic, an un-annotated parameter and a union receiver.

All printed correctly, so the old tags hid no clause-1 bug. The probe also found D15882 (a
`K | null` field through an un-narrowed union of records, refused at emit), which is unrelated.

## Measurement

`sweep.vl diff`, master `89ae9a71`'s fixpoint seed (6,675,723 bytes) against this one (fixpoint,
6,676,182 bytes), over 24,025 programs:

- **24,025 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

No program in the corpus reaches `readRepOf`'s `i32` arm through a field read. A `boolean | null`
field is code 21 and was already tagged `nulbool`.
