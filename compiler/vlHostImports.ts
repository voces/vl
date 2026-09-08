// The VL host-import ABI for running an emitted module in JavaScript — the
// `print` sinks and the `extern` registry both JS hosts provide: the browser
// playground (`playground/src/runtime.ts`) and the Deno test host
// (`tests/support/runWasm.ts`). The native host is Rust (`scripts/vl-host`) and
// is necessarily separate.
//
// A program that uses linear memory DEFINES and exports its own, and no emitted
// module imports the legacy `__log__`/`__log_string__` decoders or a host memory
// (censused 0 of 1,149 building modules), so the SEVEN `__print_*__` sinks plus
// `extern.nowMillis` are the whole shared ABI. A host that needs more — the Deno
// harness's throwing fs/proc stubs — MERGES them into the returned `imports`.
//
// Dependency-free and host-agnostic on purpose, so it sits beside `vlSrcSection.ts`
// in `compiler/` and both the playground and the test tree import the one copy.

/** The two import namespaces an emitted module declares. */
export type VlHostImports = {
  extern: WebAssembly.ModuleImports;
  imports: WebAssembly.ModuleImports;
};

/**
 * Build the shared host-import object, appending each printed line to `logs` —
 * the caller owns `logs` (a test compares it against expected strings; the
 * playground renders it into the DOM). `__print_char__` streams a string's UTF-8
 * bytes into a per-call buffer that `__print_str_flush__` decodes as one line.
 *
 * `declared` TREE-SHAKES the `imports` namespace: pass the `imports`-module names a
 * module actually declares (`WebAssembly.Module.imports(m)`) and only those sinks
 * are built, so a print-free program instantiates against an EMPTY `imports`
 * object rather than seven stubs it never calls — the zero-glue browser host
 * veldt asked for (surprise #4). Omit it to build all seven (the default; extra
 * imports a module does not declare are harmless).
 *
 * NO COLOR HERE, DELIBERATELY (Stage C0's twin; see the native host's `Palette`).
 * Neither JS host has a terminal to ask about, and plain output is what makes the
 * two hosts' `logs` comparable — several suites depend on that.
 */
export const vlHostImports = (
  logs: string[],
  declared?: Iterable<string>,
): VlHostImports => {
  const printChars: number[] = [];
  // Every `print` sink this host knows how to provide. `declared` selects a subset.
  const allPrintSinks: WebAssembly.ModuleImports = {
    // Direct value sinks for `print(x)`. A wasm i64 arrives as a JS bigint; the
    // rest as numbers. Booleans render as `true`/`false`.
    __print_i32__: (v: number) => logs.push(String(v)),
    __print_i64__: (v: bigint) => logs.push(v.toString()),
    __print_f32__: (v: number) => logs.push(String(v)),
    __print_f64__: (v: number) => logs.push(String(v)),
    __print_bool__: (v: number) => logs.push(v ? "true" : "false"),
    // A string prints by streaming its UTF-8 bytes; flush decodes the line.
    __print_char__: (code: number) => printChars.push(code),
    __print_str_flush__: () => {
      logs.push(new TextDecoder().decode(new Uint8Array(printChars)));
      printChars.length = 0;
    },
  };
  const imports = declared === undefined
    ? allPrintSinks
    : Object.fromEntries(
      [...declared]
        .filter((name) => name in allPrintSinks)
        .map((name) => [name, allPrintSinks[name]]),
    );
  return {
    // The USER externs (`extern function`), under their own module name — scalars
    // only, the same registry the native host provides so a program that runs
    // under `vl run` runs here. An extern outside it is a LinkError naming the
    // function (docs/internals/extern-design.md §4).
    extern: {
      // `nowMillis(): i64` — a wasm i64 result must be handed back as a JS bigint.
      nowMillis: () => BigInt(Date.now()),
    },
    imports,
  };
};
