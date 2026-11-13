## Type system (Track A)

- **Step 7: the shape interner hands a `| null` literal-union field its non-null part.** `recordFieldElemRow`'s name fallback now reaches 18 programs, down from 32. Those are literal-union lists, which hand no element type by design, and D16061's hole-typed anonymous fields (filed here). Byte-identical over the sweep.
