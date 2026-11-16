## Codegen, memory & runtime (Track B)

- **Slot store part D2:** the delivery walk's last readers (whether a value reaches a return, a value's one call, a lambda's delivered parameters and parameter types) read the place classes; a name read keeps the declaration it resolved to when the classes were built, so a later rename leaves its place. The walk has no caller (D16768).
