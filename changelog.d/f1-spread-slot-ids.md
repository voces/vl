## Codegen, memory & runtime (Track B)

- **Spread literal slots are a function of the literal:** each `[...a, x, ...b]` literal's item-group, destination and join-temporary frame slots are keyed by an ordinal the collect pass records per literal and per group (`spreadSlotIdOf`, `spreadGroupSlotIdOf`), on their own scratch codes, in place of the frame's slot count at emission; the join temporaries no longer share `widenTmpSlot`'s key space with the `3000 +` and `4000` users. Prerequisite for the IR's spread lowering.
