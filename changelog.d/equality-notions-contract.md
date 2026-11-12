## Codegen, memory & runtime (Track B)

- **D15952, D15953, D15954 closed:** a record whose list field holds a nested union layer
  (`(i32 | string) | f64`) can be handed where the flat spelling is declared, and so can a
  record whose field is a declared intersection alias (`{a: i32} & {b: i32}`) where the plain
  record is declared. A `{tag: string}` record built beside a `{tag: "a"}` union arm no longer
  takes the arm's row. All three were check-clean invalid modules. `tySame` flattens union
  layers, the canon key reads an alias's one-member wrapper as its member, and the whole-shape
  row lookup asks `tyEq`. ARCHITECTURE.md §3.3 states the seven type-equality notions' lines.
