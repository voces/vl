## Type system (Track A)

- **D16924 closed:** a lambda whose result is a list literal, handed to a generic whose function parameter returns `(T | null)[]` (`gen(() => [1])`), runs instead of being refused at check: the fresh literal is built at the bound list, as with `(T | boolean)[]` (D16918), now through the one delivery adapter both spellings reach.
- **D16917 closed:** a lambda returning a list literal of lambdas, handed to a generic whose function parameter returns `((() => T) | boolean)[]` (`gen(() => [() => 1])`), runs: `T` binds from the inner lambda and the list is built at the bound union. A bound list of lambdas there, which built an invalid module, is refused at check.
