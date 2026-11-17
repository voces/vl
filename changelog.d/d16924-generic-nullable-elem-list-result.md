## Type system (Track A)

- **D16924 closed:** a lambda whose result is a list literal, handed to a generic whose function parameter returns `(T | null)[]` (`gen(() => [1])`), runs instead of being refused at check: the fresh literal is built at the bound list, as with `(T | boolean)[]` (D16918), now through the one delivery adapter both spellings reach.
