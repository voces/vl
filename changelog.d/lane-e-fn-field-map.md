## Type system (Track A)

- **D15801 closed:** a map whose entries are record literals, or lists of them, with a function field holding un-annotated functions whose results differ, runs the member stored in the entry read: `m["k"] = [{ f: inc0 }, { f: half }]; const v = m["k"]; if v != null { print(v[1].f(3)) }` prints `1.5`. Entries can be written by index or `set`, and read by index, `get` or over `keys()`. D15806, D9370 and D15194 run with it. An entry written from a named record, a record pushed through a read of an entry, and a call through `?.` are still refused at check.
