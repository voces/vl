## Type system (Track A)

- **`validateCompArgCstr` asks through `fitsExpr`** (review medium 3, stage C2). A path proof shows
  `joinLitsFitAt` reaches only the arena and the relation's memo, so its quiet bracket goes. The
  planned `Refused` variant is dropped: neither the IR nor L2 consumes refusals. `inferQuiet` hidden
  scopes go from 14 to 13. Byte-identical over 20,410 programs.
