## Self-hosting & modules (Track H)

- **The dead-read walk is gated:** `emitExpr` skips D16006's `never`-read walk unless the check bound a name at `never` or an instance binds a type parameter to it: plumb main −0.7%, L2 −0.2% guest fuel, byte-identical over 24,753 programs.
