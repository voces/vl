## Codegen, memory & runtime (Track B)

- **IR coverage: a spread copy called through its element.** Take a list a generic function was pushed into, spread it into a copy, and call through the copy's element, as in `ys[0](2)`. An instance runs a copy of that index read as its own statement, and the copy now takes the read's type. The IR claims it instead of missing it as `rep ?`. Legacy's bytes are unchanged.
