## Codegen, memory & runtime (Track B)

- **IR: a call through a tagged function set:** the IR builds the dispatch over a set's arms (the stashed id tested against each member's, a valued `if` per arm) from the same tails legacy writes (`tagStashTail`, `tagIsTail`), and holds a local or parameter whose type is still open when its rep is a set's `i32` id; 353 more corpus functions are built by the IR.
