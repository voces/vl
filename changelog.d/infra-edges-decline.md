## Infrastructure (Track F)

- **I8 edges: 20 of 24 proven:** the IR declines where it would hand legacy an operand node to re-read (a record compare's place side, element receiver or index with no IR read, an optional-chain side's null test, a record copy's source), which proves emitChainRead, emitIdxIndex, refListReadAt, emitNulIsNullTest→emitOptChainIsNull and rcReadSource; no program moves (sweep 27,677 same, self-build byte-identical).
