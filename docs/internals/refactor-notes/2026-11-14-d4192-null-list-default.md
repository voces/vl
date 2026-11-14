# D4192: a null-only list literal as a `??` default

**Change.** `coalListDefaultClash` (`wasmEmit.vl`) graded a literal default by its own type
(`exprListRep`), while `emitArr` builds it at the type the checker stamped on it (`adoptLitAt` to
the `??`'s result). A `[null]` default of a `(i32 | null)[]` operand was refused though it builds
as the operand's list. A literal is now graded at `arrLitTyAt`; `exprListRep`'s tail becomes the
exported `tyListRep(ty)` (`emit_classify.vl`), which both read.

**Measured.** `coalesce-null-only-list-default.matrix.vl` (new, 78 cells, 58 graded), master
fixpoint against this branch's: 58 move from a loud emit reject to runs in both faces; 0 runs →
not-runs, 0 silent.

**Size.** Net +7 compiler lines (one exported helper, one comment); pin-helper delta 0. Seed +39
bytes against the master fixpoint.
