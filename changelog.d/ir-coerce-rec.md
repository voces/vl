## Codegen, memory & runtime (Track B)

- **IR coverage, record copies read once:** the IR builder now builds a record copied into another row whose source is read once (a call), through `RCoerce` and one copy entry legacy shares (`emitRecCopyInto`, `recCopyReReads`). tests/cases +3 functions and +6 start bodies, byte-identical.
