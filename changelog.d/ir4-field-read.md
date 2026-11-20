## Codegen, memory & runtime (Track B)

- **IR coverage, a narrowed nullable field read:** a field typed `T | null` that the checker has
  narrowed past its `null` is now built in the IR at the narrowed type. Legacy's field tail writes
  the read's recover as it does for any member read. That covers 47 more corpus functions and 28
  in the self-compile. No emitted byte moves.
