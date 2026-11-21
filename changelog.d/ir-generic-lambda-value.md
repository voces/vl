## Codegen, memory & runtime (Track B)

- **IR: untyped function values in generic holes:** a function literal or name with no type of its own (a generic hole's), delivered where a closure is expected, now builds at that destination's type. The IR also now builds an index read of a `??` whose default is a nested list literal. Byte-identical; armed `tests/cases` covers 70 more functions, all matching.
