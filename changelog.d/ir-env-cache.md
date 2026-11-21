## Codegen, memory & runtime (Track B)

- **IR: a nested function's cached environment:** a capturing nested function declared by statement keeps its environment in a frame slot per activation (D7480). The IR now writes its drop where the declaration runs and its build at the first read, both through legacy's writers. Byte-identical; the `nested function env cache` blocker class is gone, 223 functions in `tests/cases` and 12 in the corpus.
