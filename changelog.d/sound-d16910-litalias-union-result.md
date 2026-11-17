## Codegen, memory & runtime (Track B)

- **D16910 closed:** a call through a closure that no producer reaches, whose result unions a string literal-union alias with a record or a list (`type K0 = "6" | "x"`, `f: () => K0 | {w: i32}`), runs. It was refused at emit after `vl check` passed it.
