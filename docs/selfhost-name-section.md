# WebAssembly `name` custom section in the self-hosted emitter

The self-hosted emitter (`compiler/wasmEmit.vl`) can now append a WebAssembly
"name" custom section (section id 0, name `"name"`) so a wasmtime trap backtrace
shows real function names instead of `<wasm function N>`.

## What it emits

Per the WebAssembly name-section appendix, `emitNameSection` writes:

```
section: id 0, ULEB(size), wName("name"), <subsections>
  module-name   subsection (id 0): ULEB(size), wName("vl")
  function-name subsection (id 1): ULEB(size), namemap
    namemap = ULEB(count), then count * { ULEB(funcidx), wName(name) }
```

The function-name map covers **both** the imported print family at their
hardcoded indices 0..3 (`__print_i32__`, `__print_bool__`, `__print_char__`,
`__print_str_flush__`) **and** every user function at its real wasm index
(`gImports + i`). Indices are emitted in increasing order, as the spec requires.
(The synthetic start function — the last index, which runs top-level statements —
is intentionally left unnamed; it has no source name.)

All bytes go through the existing writer helpers (`wU8`/`wULEB`/`wBytes`/`wName`/
`wSection`/`wTarget`), the same length-prefixed name emitter the export section
uses.

## OFF by default — goldens stay byte-identical

The section is **off by default**, gated behind a module-level flag `gEmitNames`
(initial value `0`) and an exported opt-in `setEmitNames(on: i32)`. A name section
appended unconditionally would change every emitted module and break the goldens
and both fixpoints. So:

- The compiler driver (`scripts/vl-compiler-driver.vl`) **never** calls
  `setEmitNames` — the goldens, `selfhost_emit_fixpoint_test.ts`, the full/native
  fixpoints and the self-typecheck all exercise this default path and are
  byte-for-byte unchanged.
- Only the native `vl` host (`scripts/vl-host/src/main.rs`) opts in: `vl run`
  always enables it (legible traps are the point), and `vl build --names` enables
  it on demand. The host looks up `setEmitNames` defensively, treating a missing
  export (older compiler modules) as a no-op.

## Proof: byte-identity (the hard constraint)

`deno test -A --no-check tests/selfhost_emit_fixpoint_test.ts` — all 14 goldens
emit byte-identical with the change in place (names default OFF):

```
running 14 tests from ./tests/selfhost_emit_fixpoint_test.ts
emit-fixpoint: M_self emits g_min byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_arith byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_locals byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_struct byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_union byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_multiunion byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_i32list byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_reflist byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_string byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_strlist byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_map byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_maparray byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_globals byte-identical to the host golden ... ok
emit-fixpoint: M_self emits g_kitchen byte-identical to the host golden ... ok
ok | 14 passed | 0 failed (1m7s)
```

The native fixpoint also holds (stage3 == stage4, names off on the `vl build`
self-rebuild path):

```
NATIVE FIXPOINT HOLDS: stage3 == stage4 byte-for-byte (225277 bytes)
```

## Proof: the feature (before / after trap backtrace)

Program (`trap.vl`) — divide-by-zero inside a named function:

```
function divideByZero(a: i32, b: i32): i32 { a / b }
function compute(): i32 { divideByZero(42, 0) }
print(compute())
```

**Before** (names OFF — `vl build` without `--names`, then `vl run` the module):

```
Error: error while executing at wasm backtrace:
    0:     0xba - <unknown>!<wasm function 4>
    1:     0xc3 - <unknown>!<wasm function 5>
    2:     0xc9 - <unknown>!<wasm function 6>

Caused by:
    wasm trap: integer divide by zero
```

**After** (names ON — `vl run trap.vl`, or `vl build --names` then run):

```
Error: error while executing at wasm backtrace:
    0:     0xba - vl!divideByZero
    1:     0xc3 - vl!compute
    2:     0xc9 - vl!<wasm function 6>

Caused by:
    wasm trap: integer divide by zero
```

`divideByZero` and `compute` now appear by name; the module name is `vl`. Function
index 6 is the synthetic start function (4 imports + 2 user functions), which has
no source name. A non-trapping named build still executes correctly (the section
is semantically inert), confirming the encoding is valid — wasmtime parses it.
