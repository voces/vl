# wasmtime parity: does VL's WasmGC output run off V8?

> Status: **spike confirmed — wasmtime runs VL's WasmGC output correctly,
> with one feature flag and a tiny host shim.** This de-risks the runtime
> target named in `docs/binaryen-transition.md` ("getting off V8"): VL emits
> WasmGC (structs / arrays / strings as GC heap values), and the only runtime
> VL has ever executed on is V8 (via Deno's `WebAssembly`). This doc records an
> empirical check that a VL-compiled `.wasm` instantiates and runs on
> **wasmtime**, producing the same results as the V8/Deno path. It is a spike,
> not a landed dependency — the compiler was not touched.

## TL;DR

**wasmtime is a viable off-V8 target for VL's current output**, with two
caveats: (X) WasmGC must be enabled — it is off by default on the version
tested, via `-W gc` on the CLI or `Config::wasm_gc(true)` in an embedder; and
(Y) VL has no WASI — its program output flows through `imports::*` host
functions (`__print_i32__`, `__print_char__`, `__log__`, …) and its top-level
runs as the module `start` function, so wasmtime needs a host that supplies
those imports (the `wasmtime run` CLI alone cannot — it has no way to define
custom JS-shaped imports). A ~120-line wasmtime-crate host covers it.

Across **83** runnable struct/array/string/union test programs, wasmtime output
matched the V8/Deno reference **83/83** (0 mismatches). The only diffs observed
were float-to-string formatting artifacts of the host stub, not wasm semantics
(see Gaps).

## Environment

- **wasmtime 45.0.1** (`83166ba31`, 2026-06-05), x86_64 linux release tarball
  from `github.com/bytecodealliance/wasmtime/releases/download/v45.0.1/`.
  (The official `wasmtime.dev/install.sh` failed with an unexpanded `{}`
  version template; the release tarball worked.)
- WasmGC stabilized around wasmtime v27. On **v45 it is still off by default**:
  running a VL module raw rejects with
  `struct indexed types not supported without the gc feature (at offset 0xb)`.
  Enabling it: `-W gc` (or `--wasm gc`) on the CLI, or `Config::wasm_gc(true)`
  in an embedder. VL's output also uses typed function references, so the host
  additionally enables `Config::wasm_function_references(true)`.

## What VL emits (the relevant shape)

A VL program compiles to a module whose **top-level body is the wasm `start`
function** — there is no exported `main`. There is no WASI. Output happens
through host-function imports under the `imports` namespace. Representations:

- **structs** → WasmGC `(struct …)` with `struct.new` / `struct.get`
- **arrays** → WasmGC `(array …)` with `array.new_fixed` / `array.get`
- **strings** → a GC `(array (mut i32))` of code points (so a string is, at the
  wasm level, an i32 array; `s[i]` is `array.get`, `s.length` is `array.len`)
- **output** → `imports::__print_i32__` / `__print_i64__` / `__print_f32__` /
  `__print_f64__` / `__print_bool__`, the streaming string pair
  `__print_char__` + `__print_str_flush__`, and the linear-memory log path
  `__log__` / `__log_string__` (these last two also import `imports::memory`)

Note the binaryen optimizer (`optimize()`, which the normal `build` path runs)
scalarizes non-escaping structs (Heap2Local) and constant-folds dead array/
string ops, so a too-simple program emits no GC instructions at all. The probe
program below forces real `struct.new` / `array.new_fixed` / `array.get` to
survive by routing them through runtime-varying indices and an array-of-structs
that escapes scalarization (verified in the `.wat`).

## Exact commands

**1. Compile a VL `.wasm` that genuinely exercises WasmGC** (struct + array +
string, all surviving optimization), using VL's normal build path:

```
deno task build probe.vl -o probe.wasm --wat
```

where `probe.vl` is:

```vl
type Point = { x: i32, y: i32 }
const pts: Point[] = [ { x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 } ]
const label: string = "vital"
function pickX(ps: Point[], i: i32): i32 { return ps[i].x }
let total = 0
total = total + pickX(pts, 0)        // 1
total = total + pickX(pts, 1)        // 3
total = total + pickX(pts, 2)        // 5  -> 9
total = total + label.length         // + 5 = 14
total = total + label[total - 14]    // label[0] 'v' = 118 -> 132
print(total)                         // 132
```

The emitted `.wat` contains real GC ops: `struct.new $0`, `struct.get`,
`array.new_fixed $1 3` (the `Point[]`), and `array.new_fixed $3 5` with the
code points of `"vital"` (118 105 116 97 108) — i.e. the string is a live GC
i32-array read by `array.get`.

**2a. Reference (V8/Deno):**

```
deno task run probe.vl          # -> 132
```

**2b. wasmtime.** The bare CLI gets as far as GC parsing but cannot supply the
host imports:

```
wasmtime run probe.wasm
#   struct indexed types not supported without the gc feature
wasmtime run -W gc probe.wasm
#   unknown import: `imports::__print_i32__` has not been defined
```

So run it through a tiny wasmtime-crate host that defines `imports::*` and
enables GC (`scripts/wasmtime-host.rs`, see below):

```
cargo run --release -- probe.wasm   # -> 132
```

**3. Parity confirmed:** both print `132`.

## Results

| program(s)                          | V8/Deno | wasmtime | match |
|-------------------------------------|---------|----------|-------|
| probe (struct + array + string)     | 132     | 132      | yes   |
| string char-sum + length            | 532 / 5 | 532 / 5  | yes   |
| `tests/cases/types` + `…/soundness` `@run` set | — | — | **83 / 83** |

The 83-program sweep covers recursive structs (`recursive-tree`,
`recursive-binary-tree-sound`, `recursive-linked-list-sound`), union arrays
(`union-in-array-widen-sound`, `is-union-array-element-narrow`), struct-union
dispatch, nullable narrowing, and string printing — i.e. the struct / array /
string / union GC surface. Every one matched the V8/Deno reference output.

Four programs were skipped, none a runtime gap: two `xfail-*` cases error at
**compile time on V8 too** (a type error and a codegen recursion-limit case),
so they never reach wasmtime; the rest were build-side skips.

## Feature flags / host required

- **GC feature:** required. `-W gc` (CLI) or `Config::wasm_gc(true)`
  (embedder). Off by default on v45.
- **Function references:** `Config::wasm_function_references(true)` in the host
  (VL emits typed function refs). On the CLI this rides along with `-W gc` for
  the programs tested.
- **Host imports:** required — VL has no WASI. The host must define the
  `imports::*` print/log functions and (for the `__log__` buffer path) an
  `imports::memory`. The host re-implements exactly what `runWasm` in
  `compiler/compile.ts` does on the V8 side. The `wasmtime run` CLI by itself
  is **not** sufficient because it cannot define these custom imports; a thin
  embedder (or a WASI shim, if VL ever emits one) is needed.

## Gaps / rejections observed

- **No instantiation or execution rejections** once GC is enabled and the
  imports are supplied. Every GC instruction VL emits
  (`struct.new`/`struct.get`, `array.new_fixed`/`array.get`/`array.len`) was
  accepted and executed correctly. No module needed binaryen-specific
  post-processing beyond the `optimize()` the normal `build` path already runs.
- **The only diffs were host-side float formatting, not wasm semantics.** VL's
  `__log__` path tags an `f32` and the V8 reference renders it by widening to a
  JS number (`12.300000190734863`), whereas the Rust host's `f32::to_string()`
  prints the shortest round-trip (`12.3`). Same bits, different
  number-to-string; an artifact of the throwaway host, not of wasmtime or the
  module. A production off-V8 runtime would pick its own float formatting
  anyway. (Seen only in `samples/logging.vl`'s `__log__` path; the
  `__print_*` direct-value path matched exactly.)

## Reproducing / the host

The host used for the spike lives at `scripts/wasmtime-host.rs` (standalone; it
depends only on the `wasmtime` crate). To run it:

```
mkdir host && cd host && cargo init --name vl-wasmtime-host
# add `wasmtime = "45"` to Cargo.toml, copy scripts/wasmtime-host.rs to src/main.rs
deno task build probe.vl -o probe.wasm
cargo run --release -- probe.wasm
```

## Bottom line

**wasmtime is a viable off-V8 runtime for VL's current WasmGC output** — every
struct/array/string/union program tested ran and matched V8 — provided the GC
feature is enabled (X) and a thin host supplies VL's `imports::*` functions
since VL emits no WASI and runs its body as the module `start` (Y).
