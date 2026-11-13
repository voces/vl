## Type system (Track A)

- **Step 7: the value-union mint reads the type its spelling reads back as.** A
  value union whose type its spelling softens (a literal widened, a literal run
  grouped under its alias, a nested union joined) was minted from the spelling
  parsed back. `unionSpellingTyOf` builds that type from the spelling's own
  decisions instead, agreeing with the parse in all 219 programs that reached
  it. Byte-identical over the sweep.
