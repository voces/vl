## Codegen, memory & runtime (Track B)

- **IR coverage, `map store value variant bare`:** a store into a map whose value is a union arm (a variant), of a value already in that variant's rep, is now built by the IR. That covers a `const`, a parameter, a call result, a field or element read, and a narrowed nullable read, through `m[k] = v` or `m.set(k, v)`. The value is written as itself, as legacy's `emitVariantPassThrough` writes it. A nullable niche the read does not recover, which legacy follows with `ref.as_non_null`, has no witness program and stays a named miss.

  tests/cases `map store value variant bare` goes from 16 functions to 0: 15 are built, and `arm-valued-map-values-forin` `cell` moves to `for in map element`.
