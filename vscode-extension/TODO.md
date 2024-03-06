## is

Add "is" operator, where right side is a type

```vl
function foo<I extends string | number>(I foo) {
    if foo is string return foo
    return number.format(foo, "#.##")
}
```

Essentially it's a ducktype variant of instanceof, replacing the need of typeof
as well

## Explicit type variance

Add Readable and Writable generics. Should be applied automatically during
parameter inference.

Add Exact and Inexact. Parameters should be Inexact by default and values Exact.
Exactness is mostly a complication for when we want a function to accept an
interface, ignoring excess properties.

## Exact

For functions, it's helpful to pass arguments of objects with extra properties.
Right now, this isn't allowed, but it'd be helpful. This is a footgun, as
something like:

function foo(a, b) { a.foo = b }

Could be a problem if a is typed as `{foo: {}}

## Closures & memory management

- Top-level variables will be stored as globals if they are numbers or booleans;
  complex types will be stored in linear memory.
- Function variables will be stored as function variables if they are numbers or
  booleans; complex types will be stored in linear memory.
  - If the function variable is used within a child function (a closure), it
    will be stored in linear memory regardless of type. This use case must be
    detected during type analysis. We can do this by storing is declaration
    scope and, on references, comparing the current scope to the declaration
    scope. We'll store `memoryType` on the variable initially as `stack`, and
    switch it to `heap` as needed.
