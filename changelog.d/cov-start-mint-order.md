## Codegen, memory & runtime (Track B)

- Records: a record literal holding another, built in an instance of an un-annotated maker (`function mk(f) { return { r: { f: f } } }`), finds its inner record's row; two such rows ran as `object literal field count does not match struct` before (D17128, D17171).
