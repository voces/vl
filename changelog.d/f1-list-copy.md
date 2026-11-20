## Codegen, memory & runtime (Track B)

- **IR: a list delivery that owes no copy:** a `listCopy` delivery whose pair needs no record copy, numeric convert, retag or widen is the value as built, one decision legacy's copy tail shares (`listCopyOwesNothing`); the IR now builds those functions.
