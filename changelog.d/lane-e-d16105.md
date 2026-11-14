## Codegen, memory & runtime (Track B)

- **D16105 closed:** a record wider than a name's own, written into the name under `&&`, `||` or a `while` condition and used as a value, is the value. `const t = k < 5 && yOf(a = nb()) > 0` prints `true`, the call runs once, and a field read of the value works too. The name's re-read of the stored object is cast back to the wider record's row, which its `sub` chain extends.
