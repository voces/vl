# `extern function` — calling the host

An `extern function` declares a function the **host** provides: whoever instantiates the
compiled module (a browser page, a Deno or Node script, the native `vl` runner) must supply it,
or the module fails to load naming what is missing. The declaration has no body.

```vl
extern function nowMillis(): i64
extern function drawRect(x: i32, y: i32, w: i32, h: i32): void

drawRect(0, 0, 10, 10)
print(nowMillis() > 0)
```

It may sit in any module and needs no flag or manifest file: the compiler collects every
declaration into the wasm import section, under the module name `extern`, and that section is
the manifest. Declaring one name in two modules is one import, provided the two signatures
agree. `export extern function …` lets one module own the host boundary while the rest import
the names like any other binding.

## Types that cross

Parameters and results are `i32`, `i64`, `f32`, `f64` or `boolean` (a `boolean` is an `i32`
holding 0 or 1 at the boundary). A string, list or struct does not cross, because a browser host
can neither read nor build one; pass bytes as a `Buf`'s `base` and `length` and read them
through the module's exported `memory`.

## The return type is required — write `: void` for "nothing"

An extern **always states its result**. A function that returns nothing is declared `: void`,
which compiles to an import with an empty result list:

```vl
extern function log(code: i32): void

log(1)                    // a statement
function report(x: i32) {
  log(x)                  // also fine as a function's last statement
}
const each = (x: i32) => log(x)
```

Leaving the return type off is an error, because an extern has no body for the compiler to
infer a result from:

```
extern `log` has no return type — an extern has no body to infer one from; write `: void`
for an extern that returns nothing
```

A `: void` extern's call is a statement. Using it where a value is needed is refused the same
way a `void` function's result is — `const x = log(1)`, `print(log(1))`, `return log(1)` from a
function declared to return `i32`, `log(1) == log(2)`, or passing it to a generic `id(log(1))`. `void` is a return type only; a parameter cannot be `void`.

## Providing the imports from JavaScript

```js
const { instance } = await WebAssembly.instantiate(bytes, {
  imports: { /* the print sinks the module declares */ },
  extern: {
    nowMillis: () => BigInt(Date.now()), // an i64 result is a BigInt
    drawRect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
    log: (code) => console.log(code), // `: void`, so its return value is ignored
  },
});
```

A VL module's `export function f(a: i32): void` is a wasm function with no result, so a unit
built separately can take it as the provider of its `extern function f(a: i32): void` —
through `wasm-merge`, or by handing one instance's exports to the other's `extern` imports.

The design and its rationale: `docs/internals/extern-design.md`.
