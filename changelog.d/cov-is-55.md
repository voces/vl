## Codegen, memory & runtime (Track B)

- The IR boxes a nested list into a union whose matching list arm a twin spelling keyed
  (`i32[][]` under `K[][]`'s tag in `K[][] | i32[][] | string`), as legacy did.
