## Type system (Track A)

- **D16736 closed:** two recursive records that store a field differently are refused at a shared
  delivery whichever field comes first, instead of exhausting the compiler's call stack. The storage
  comparison stops at a record pair it is already inside, not after eight levels per record.
