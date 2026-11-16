## Codegen, memory & runtime (Track B)

- **D16698 closed:** a spread binding of a generic function name in a generic body (`const src = [id]`) pushed onto a field or an element (`o.rs.push(...src)`, `ls[0].push(...src)`) or spread into an initialiser (`const rs: ((x: T) => T)[] = [...src]`) passed the check and trapped at its second instance; each runs at every instance. The delivery walk follows a push onto a field or element to its binding's slot, and a name the flow rewrite minted in an instance is built at the destination's element type.
