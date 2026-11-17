## Type system (Track A)

- **D16905 closed:** a lambda returning a list literal where a list of a union holding a function arm is expected (`const v: () => ((() => i32) | boolean)[] = () => [false]`) runs instead of being refused at check: the literal is built at the expected union, at any list nesting and in any delivery position.
