## Codegen, memory & runtime (Track B)

- **D16906 and D16907 closed:** a closure parameter no function is ever handed to, whose record result holds a nullable `string` or `boolean` field or a function field, can be read and called through, for example `function use(p: () => {f: () => i32}) { print(p().f()) }`. Each was refused at emit after `vl check` passed it.
