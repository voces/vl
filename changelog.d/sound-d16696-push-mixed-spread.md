## Codegen, memory & runtime (Track B)

- **D16696 closed:** a push mixing a literal argument with a spread of a list of records or lists, such as `rs.push({ n: 1 }, ...[{ n: 2 }])`, runs. Before, emit refused it, after `vl check` had passed it.
- **D16701 closed:** a list literal spread into a list of a union or nullable element, such as `const u: (i32 | null)[] = [...[1]]`, runs. Before, it built a module that failed to validate. D16702 files the record-union spelling, which stays open.
