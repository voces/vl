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

## `extern let` and `extern const` — globals the host owns

A module can also import a wasm **global**: `extern let` for a mutable one, `extern const` for an
immutable one. It has a type and no initializer — whoever provides it sets its value.

```vl
extern let rax: i64      // read and written by this module and by its owner
extern const width: i32  // read only

function step(): void {
  rax = rax + (width as i64)
}
step()
print(rax)
```

Every read is a `global.get` and every write a `global.set` on the import itself, so a value the
host or another unit writes between two reads is what the second read sees — in a function, at
top level, or inside a closure. The types are the ones that cross for an `extern function`:
`i32`, `i64`, `f32`, `f64` and `boolean`. Globals live in the same `extern` namespace as extern
functions, so one name cannot be both. Declaring one global in two modules is one import, and the
two declarations must agree on the type and on `let` versus `const`.

From JavaScript, pass a `WebAssembly.Global` (an `i64` one holds a `BigInt`):

```js
const rax = new WebAssembly.Global({ value: "i64", mutable: true }, 0n);
const width = new WebAssembly.Global({ value: "i32", mutable: false }, 8);
await WebAssembly.instantiate(bytes, { imports: { /* print sinks */ }, extern: { rax, width } });
console.log(rax.value); // what the program last wrote
```

`vl run` gives an extern global the value you pass with `--extern NAME=VALUE`, once per global:
an integer for `i32`, `i64` and `boolean` (decimal, or hex with `0x`), a number for `f32` and
`f64`. Without one it refuses the program, even when nothing reads the global:

```sh
vl run test.vl --extern CTXB=0 --extern scale=2.5
```

To run against a real value another unit owns, build it with `vl build` and run it from a host,
or link it to the unit that exports the global.

## `export let` — a global another unit imports

In the module you build (the entry module), `export let` and `export const` of one of those
scalar types become wasm global exports, the way `export function` becomes a function export:

```vl
export let rax: i64 = 0     // a mutable global
export const width = 8      // an immutable global

export function incr(): void {
  rax = rax + 1
}
```

A separately built unit declaring `extern let rax: i64`, `extern const width: i32` and
`extern function incr(): void` links to these — by handing one instance's exports to the other's
`extern` imports, or through `wasm-merge` — and both units then read and write one global.

With `wasm-merge`, whatever satisfies an `extern` import must be the input named `extern`. For
two units, name the exporting one `extern`. For more, generate a small facade module that
imports each name from the unit that defines it and re-exports it, and merge it as `extern`:

```sh
wasm-merge facade.wasm extern ua.wasm ua ub.wasm ub -o linked.wasm --rename-export-conflicts \
  --enable-gc --enable-reference-types --enable-bulk-memory --enable-tail-call
```

After the merge every call is direct and every global access reads or writes the defining unit's
global; no `extern` import is left. The facade's exact shape is in
`docs/internals/cli-design.md`, "the facade recipe".

An `export const` with a constant initializer (`export const width = 8`) is published immutable,
so the importer must declare it `extern const`; an `extern let` of it fails to link. An `export
const` whose initializer is not constant (`export const seed = hash(1)`) is published MUTABLE:
its value is written by the module's start function, and wasm cannot initialise an immutable
global that way. Import that one with `extern let` — an `extern const` of it fails with a
`LinkError`. A binding named `memory` is not published in a module that uses linear memory,
because the memory export takes that name.

An `export let` in a
module you import rather than build stays an ordinary VL export, and one of any other type (a
string, a list, a struct) is not published to the host at all.

The design and its rationale: `docs/internals/extern-design.md`, and `DECISIONS.md` §"Globals
cross the wasm boundary".
