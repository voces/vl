# Method calls

`v.f(a)` is a call of a free function `f(v, a)` whose first parameter is named `self`. VL has
no `impl` block. Which `f` the call finds depends on `v`'s type.

## Where `v.f(…)` looks

1. **The names in scope in the calling module**: functions declared in the module, and
   functions it imports. This is the only place a call on a built-in type looks. A list, a
   string, a map, a number or an anonymous record `{ … }` has no home module.
2. **The module that declares `v`'s named type.** For `type Rng = { … }` or `type Id = new i32`,
   a `self`-function declared beside that type is found from `v` alone. Importing the
   type, or getting a value of it from another call, is enough.

So the import a call needs depends on whose method it is:

```vl
import { rng } from "./rng"        // rng(): Rng; `range(self: Rng, …)` sits beside `type Rng`
const r = rng()
print(r.range(1, 6))               // found through Rng's home module: no import of `range`

import { includes } from "std:array"
const xs: i32[] = [1, 2, 3]
print(xs.includes(3))              // i32[] is built in: `includes` must be imported
```

Without the import, the error names the module and the line to add, and `vl check --fix`
adds it:

```
'includes' is not imported — a free `includes(self: …)` accepting i32[] is exported by
"std:array"; a UFCS call resolves only names in scope, so import `includes` from there —
add `import { includes } from "std:array"`
```

A function in scope wins over one found through the type's home module.
