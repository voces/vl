## Codegen, memory & runtime (Track B)

- **Step 7 (L6):** three box-kind reads (`memReadNarrowOp`, `spreadSrcBoxAtom`, `nulScalarBoxAtomOf`) take the tag from the type rather than parsing its spelling. An if-expression binding's union name now comes only from the checker, and the emitter's own atom-name fallback, which never produced a name, is deleted. No output moves.
