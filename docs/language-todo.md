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

## Block expressions

A braced block should be usable as an expression that evaluates to its last
expression. Today the parser commits to an OBJECT LITERAL on `{`, so the block
form is rejected:

```vl
const foo = { 1 }   // expected a field name but found `1`
print(foo)          // want: 1
```

Needs `{ … }` disambiguation in the parser (object literal vs block
`{ stmts; lastExpr }`), plus typecheck (the block's type is its tail
expression's) and emit. The tail-as-value rule already exists for function block
bodies, so the emitter groundwork is partly there.

**Disambiguation rule — prefer a valid object.** When `{ … }` is a valid object
literal it should parse as one; only the shapes that *can't* be an object
(`{ 1 }`, `{ stmt }`, `{ a; b }`) are blocks. The sharp edge is the bare-identifier
case `{ field }`: as an object it's the property shorthand `{ field: field }`, as
a block it's "the value of `field`." This DIRECTLY reverses #438
(`fix(parse): a braced bare identifier is a block, not a shorthand object`), which
made `{ x }` a block so a `{ x }` function/lambda body wasn't misread as `{x: x}`.
Reconcile the two into one coherent rule before implementing — "prefer object when
it's a valid object" wants `{ field }` to be the shorthand object (the opposite of
#438's fix), so block-expressions must re-derive how a bare-identifier body is
disambiguated (likely by position/context, not by shape alone). Keep it sensible
and predictable.

## Optional `else` on an if-expression

An `if` used as an expression currently REQUIRES an `else` arm (otherwise there's
no value when the condition is false):

```vl
const foo = if true { 1 }   // rejected: if-expression requires an else arm
```

Making the `else` optional needs a defined value for the missing arm — unit/void,
or an optional/`T?`. Design decision first. (Once this and block expressions land,
the `if c { x } else y` workaround — and its "branch never taken" lint on a
constant condition — go away; that lint is correct, it just bites the workaround.)

## Ban `export` inside functions / non-module scopes

`export` only makes sense at module top level, but it's currently accepted inside
a function (and presumably other nested scopes), where it's meaningless and
collision-prone:

```vl
function foo() {
  export const foo = 3   // should be an error
}
```

Add a checker error: `export` is only valid on a top-level declaration. Small and
self-contained (no parser/emit change — a scope check in typecheck/lint).
