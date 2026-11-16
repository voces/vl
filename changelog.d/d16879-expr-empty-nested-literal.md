## Type system (Track A)

- **D16879 closed:** a list literal holding an empty list, read in place rather than bound (`print([[]].length)`, `[[]][0].length`, `f([[]])`), runs: the empty list takes the read-only default at the program's end, after any write to it. Emit used to refuse it with "a list literal's element type gives its list no element rep".
