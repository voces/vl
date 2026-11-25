## Codegen, memory & runtime (Track B)

- **IR claims reads of a global whose own type has no rep:** a global bound to a hole instance's result (`const r = ret(u)`, `ret(a)` reading a shared field of mixed types) is read at its cell's rep, as a local is read at its variable's, in start bodies and functions alike. `rep unsup of read` falls 5 → 0 on its programs.
