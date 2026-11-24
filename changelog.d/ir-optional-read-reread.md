## Codegen, memory & runtime (Track B)

- **IR coverage: a standalone `?.` whose base is a module global or a field read.** The base is written again after its null test, as legacy re-emits an unstaged base. `optional read base`. No legacy bytes moved.
