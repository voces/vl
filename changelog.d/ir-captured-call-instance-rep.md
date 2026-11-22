## Codegen, memory & runtime (Track B)

- **IR: a capturing nested generic called directly:** a direct call of a nested generic function that captures now builds in the IR. Its closure is typed as the instance legacy calls closes the declaration (`capturedCalleeTy`). Byte-identical; `tests/cases`'s `captured call closure rep` count falls from 112 to 56.
