## Codegen, memory & runtime (Track B)

- IR coverage, start functions (lane IR-M1).
  - A start body now writes the read-before-init progress cell as legacy does (new Rhs `RInitProgress`, lowered through legacy's `emitInitProgressAt`). A global whose initializer runs elsewhere still writes its progress. `start: progress cell` falls 31 → 0.
  - A boxed `T | null` global read at the box inside it is that box as it stands, with no recover.
