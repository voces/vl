# IR: element stores into atom, niche, union and nested lists, and `(string | null)[]` reads (2026-11-21, lane IR-N3)

`idxStorePlainWhy` refused every store legacy's `emitIdxStoreValue` writes through a seeded or
boxing arm, and `listIdxPlainWhy` refused a `(string | null)[]` read.

## The change

- **Seeded stores** (`store element seed`). An atom, nullable-atom, nullable-boolean, `null`-unit
  or nullable-string list's value is a bare `emitExpr` in legacy, under the recorded context. The
  builder delivers it at the element rep, which writes the same.
- **Union and nested lists** (`store element`). A union list's value goes through
  `emitUnionBoxAtRecord`. That is the IR's box delivery wherever the record boxes it, or where it
  is already a named union. A nested list's non-literal row builds as itself.
- **Atoms** (`store atom`). An atom stored into a string list decodes (`atomToStr`, legacy's
  `emitStrValue`). An atom into an atom list is its id.
- **Arm unbox** (`store arm`). Legacy's arm seat casts only at a store with a record row; at a
  union list's store it writes nothing, so the refusal is kept for record rows alone.
- **`(string | null)[]` reads** (`index nulstr`). These take the string list's read arm. The read
  is recovered non-null only where the checker types it so: `strListReadsNonNull` is one decision,
  which legacy's `emitIndex` and the IR's lowering both ask.

## Witnesses

`tests/cases/index/element-store-atom-niche-union-nested.vl` (and its row under
`tests/ir-shadow-rows/`). Under the merge-base seed, 3 functions miss on `store element` or
`store element seed`; all 4 are covered and matched after. On the 124 corpus cells holding these
classes, the armed shadow covers 265 = matched 265, and mode 3 and the armed A/B are clean.
