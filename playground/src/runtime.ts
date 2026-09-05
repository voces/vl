// Run a wasm module the seed emitted, capturing its `print`/`log` output — the
// browser execution half of the playground's Run path. This is the pure
// `WebAssembly.instantiate` over VL's host-import ABI, lifted from
// `compiler/compile.ts`'s `runWasm` so the playground depends on NOTHING from the
// TS compiler (it compiles on the self-hosted seed; see `wasmCheckerBrowser.ts`).
// No binaryen, no front end — just the import object the emitted module expects.
//
// The seed's emitted module is byte-ABI-identical to the TS compiler's (the
// self-host fixpoint equivalence), so this import object — the same one the Node
// `runWasm` and the Rust host provide — runs it unchanged. The program runs as the
// module's START function, so a trap throws out of `instantiate`; the caller
// (`finishRun`) catches it and surfaces a runtime-error diagnostic.

/** Instantiate `wasm` and return the captured `print`/`log` lines. */
export const runWasmBytes = async (wasm: Uint8Array): Promise<string[]> => {
  const logs: string[] = [];
  // Accumulates the UTF-8 BYTES streamed by `__print_char__` until `__print_str_flush__`
  // (Stage 2c: a string's element is a byte, and the guest streams its storage verbatim).
  const printChars: number[] = [];
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536 });
  await WebAssembly.instantiate(wasm, {
    // The USER externs (`extern function`). A browser loader supplies this object; the
    // playground provides the same registry the native host does, so a program that runs
    // under `vl run` runs here. An extern outside it is a LinkError naming the function,
    // which is the enforcement the design leans on (docs/internals/extern-design.md §4).
    extern: {
      // `nowMillis(): i64` — a wasm i64 result must be returned as a JS bigint.
      nowMillis: () => BigInt(Date.now()),
    },
    imports: {
      memory,
      // Read `length` raw bytes at `offset` as a UTF-8 string (the byte form a
      // `__store_string__` writes from a GC string).
      __log_string__: (offset: number, length: number) => {
        logs.push(
          new TextDecoder().decode(new Uint8Array(memory.buffer, offset, length)),
        );
      },
      __log__: (offset: number, length: number) => {
        const view = new Int32Array(memory.buffer, offset, length / 4);
        const args: (number | bigint)[] = [];
        for (let i = 0; i < length / 4; i++) {
          if (view[i] === 1) {
            const low = BigInt(view[++i]) & BigInt(0xFFFFFFFF);
            const high = BigInt(view[++i]) << BigInt(32);
            args.push(high | low);
          } else if (view[i] === 2) {
            i++;
            args.push(new Float32Array(memory.buffer, offset + i * 4, 1)[0]);
          } else if (view[i] === 3) {
            const swap = new Int32Array(2);
            swap[0] = view[++i];
            swap[1] = view[++i];
            args.push(new Float64Array(swap.buffer, 0, 1)[0]);
          } else args.push(view[++i]);
        }
        logs.push(args.map((a) => a.toString()).join(" "));
      },
      // Direct value sinks for `print(x)`. A wasm i64 arrives as a JS bigint; the
      // rest as numbers. Booleans render as `true`/`false`.
      //
      // NO COLOR HERE, DELIBERATELY (Stage C0's twin; see the native host's
      // `Palette`). The native sink wraps a rendered VALUE in ANSI when stdout is a
      // terminal — this one has no terminal to ask about, and its `logs` land in
      // the DOM, where an escape sequence renders as literal garbage rather than as
      // color. If the playground ever wants colored output it wants SPANS, built
      // from the same type split this family already provides.
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
    },
  });
  return logs;
};
