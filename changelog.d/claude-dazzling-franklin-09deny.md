## Type system (Track A)

- **D17063 fixed: a mutable module `let` of a union no longer makes the checker quadratic.** Every call after a narrowed module cell asks whether it can reach the cell's writer; `crInfoOf` answered by rescanning every function against every handle per round, and now walks a worklist over an index of mentions. A 400-function call chain to the writer: 2.52G → 0.41G fuel (the `const` spelling 0.40G). IR-N1's `let fitRecvO: Opnd` witness: +9.4% → +1.9% over the `const` stack. L2 self-compile 117.54G → 116.21G (−1.14%). Output byte-identical.
