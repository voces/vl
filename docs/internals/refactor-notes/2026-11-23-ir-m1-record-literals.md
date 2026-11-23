# IR-M1: record literals built at legacy's row (2026-11-23, lane IR-M1)

The record-literal family the coordinator assigned covers `object layout`, `object field count` and
the field-coercion remainder, in bodies, starts and const cells alike. It has five mechanisms, one
commit each. Every row predicate either is legacy's or calls legacy's own answers.

## 1. Omitted fields

A struct literal that omits fields, such as `{ out: "x" }` where `{ verbose, out }` is wanted, was
built at its own one-field type, so its field count disagreed with the row (`object field count`).

`objLit` now takes the omit row (`objLitOmitRow`, over `structIndexOfObjCtx` and
`objLitStashes`) as the row the literal is built at, at the destination's record. Each omitted
field is its null, as `emitObj`'s layout loop writes it (`emitOmittedFieldNull`).

## 2. A dropped effectful field, at a struct row

`emitObj` stashes a literal whose row drops a field. Each initialiser is evaluated in source
order, a dropped one is `drop`ped for its effect (D1696), and the slots are read back in layout
order. The IR now builds this:

- `objLitDropStashRowAt` (wasmEmit, beside `objLitStashRowAt`) answers the row. The stash must
  fire, a field must be dropped (`objLitDropsField`), and every row field must be given.
- The IR walks legacy's own source pairs (`objFieldSrcPairs`). Each dropped initialiser becomes an
  `SDrop` of its own build, at the position legacy evaluates it. Every kept field is set into its
  slot as it is built (`RStashSet`, the stash's set mode).
- The lowering's row lookup takes the same row (`structStashRowAt`).

## 3. A constant extra field, at a union arm

`emitVariantStruct` skips a constant initialiser the arm does not hold (D5342), so the layout loop
writes only the row's fields. `objLitVariantLayoutAt` / `objLitVariantStashAt` used to refuse any
field outside the row. They now refuse only an effectful one (`objLitDropsField`). These two
functions have IR-only callers, so legacy's bytes do not move.

## 4. A dropped effectful field, at a union arm

This is the variant twin of mechanism 2. `objLitVariantDropStashAt` (wasmEmit) answers
`variantLitDrops && objLitDropsField` with every row field given, the condition
`emitVariantStruct` stashes on. `objLit` builds the literal at that arm's record, and the
lowering's variant row lookup takes it (`variantStashRowAt`).

## 5. A list twin, box list or noted record as a field value

`fieldTakesAsIs` covers `listRetag`, `boxListRetag` and `recRetagNoted`, the retags the verifier's
`RRetag` already admits. A field value in one of these forms is stored as it stands, retagged with
no bytes written.

## Tests

The shadow test "a literal that drops or omits fields is built at its destination's row and
matches" covers a struct drop, an arm drop and a partial literal. All of them must match legacy's
bytes, with no uncovered row.

## Left in the family

Most of what remains of `object field coercion` is the IR's record rep disagreeing with legacy's
storage row:

- `i32>closure`: a function id that legacy's row stores, where the record rep says closure;
- `str>atom`: a lone-literal field;
- a few `list>list` and `record>record` shapes.

That is IR-N6's rowless/storage-row rule, so this batch does not build it twice.

The remaining const-cell `object layout` misses are union-box const cells
(`tagged-arm-nullable-field-literal`, `empty-object-all-nullable-runs`).
