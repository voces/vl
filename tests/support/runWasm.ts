// Compiler-free wasm execution for the behavioral test corpus.
//
// `cases_wasm_test.ts` (the standing `.vl` corpus oracle — it COMPILES through the
// self-hosted seed, never the TS compiler) needs only to RUN the emitted module
// and capture `print`/`log` output, plus surface a trap as a typed error for
// `@trap` cases. This lifts exactly that — the host-import ABI + trap mapping —
// out of the old `compiler/compile.ts` so the corpus oracle carries no dependency
// on the TS compiler front end (which the kill-TS work deleted). It is a faithful
// copy of `compile.ts`'s `runWasm`/`VLRuntimeError`/`mapTrap`, minus the source-map
// path: the corpus passes no source map (it asserts trap REASONS, not positions —
// `@trap` position directives are skipped via `isTrapPosition`), so the VLQ /
// source-map decode machinery is omitted.

export type RunResult = {
  logs: string[];
  /**
   * The instantiated module's exports. Carries the P0.2 **exported linear memory**
   * as `exports.memory` for any program that uses linear memory at all (the emitter
   * gates the export on the memory existing, so a memory-free program has no such
   * entry) — plus the program's exported functions.
   *
   * DETACHMENT: a `__memory_grow__` in the guest DETACHES every view previously
   * taken on `memory.buffer`. Re-read `.buffer` after any call that can grow;
   * never cache a `Uint8Array`/`DataView` across a guest call. An indexed read of
   * a detached view returns `undefined` rather than throwing, which is why this is
   * called out here and not left to the reader.
   */
  exports: WebAssembly.Exports;
};

export class VLRuntimeError extends Error {
  /** The wasm function name (from the name section), when present in the trace. */
  readonly functionName?: string;
  /** The raw wasm trap reason (e.g. `unreachable`, `divide by zero`). */
  readonly reason: string;
  constructor(message: string, reason: string, functionName?: string) {
    super(message);
    this.name = "VLRuntimeError";
    this.reason = reason;
    this.functionName = functionName;
  }
}

// Pull the function name out of a V8/Deno wasm stack frame. The first wasm frame
// looks like:
//   at <name> (wasm://wasm/<hash>:wasm-function[<idx>]:0x<offset>)
// `<name>` is absent (anonymous) when the function is unnamed.
const parseWasmFrame = (
  stack: string | undefined,
): { functionName?: string } | undefined => {
  if (!stack) return undefined;
  for (const rawLine of stack.split("\n")) {
    const line = rawLine.trim();
    const m = line.match(
      /at\s+(?:([^\s(]+)\s+\()?wasm:\/\/[^\s:]+:wasm-function\[\d+\]:0x([0-9a-fA-F]+)/,
    );
    if (m) {
      const functionName = m[1] && m[1] !== "<anonymous>" ? m[1] : undefined;
      return { functionName };
    }
  }
  return undefined;
};

// Map a raw wasm trap message to a friendlier VL reason. V8 phrasing varies by
// version, so match on substrings.
const trapReason = (message: string): string => {
  const lower = message.toLowerCase();
  // LINEAR-MEMORY out-of-bounds, checked BEFORE the array branch below because
  // that branch matches any "out of bounds" text and would relabel this one.
  // Measured, V8 distinguishes the two precisely — "memory access out of bounds"
  // vs "array element access out of bounds" — and the old collapse reported a
  // linear-memory fault as "array index out of bounds", naming a data structure
  // the program need not even contain. That mislabel was unreachable while the
  // one page was almost unaddressable; with the load-width matrix and
  // `memory.grow` it is the ordinary way a raw address goes wrong, so it is
  // worth reporting as itself. (Array cases are untouched: their text has no
  // "memory access".)
  if (lower.includes("memory access out of bounds")) {
    return "memory access out of bounds";
  }
  if (lower.includes("out of bounds") || lower.includes("array")) {
    return "array index out of bounds";
  }
  if (lower.includes("divide by zero") || lower.includes("division")) {
    return "division by zero";
  }
  if (lower.includes("unreachable")) {
    // VL emits `unreachable` for a failed bounds check, so report that intent.
    return "array index out of bounds";
  }
  if (lower.includes("null")) return "null dereference";
  return message;
};

// Turn a caught wasm `RuntimeError` into a `VLRuntimeError` carrying the trap
// reason and (when present) a function-level name-section location. Non-wasm
// errors pass through unchanged.
const mapTrap = (err: unknown): unknown => {
  const isRuntime = err instanceof WebAssembly.RuntimeError ||
    (err instanceof Error && err.name === "RuntimeError");
  if (!isRuntime) return err;
  const e = err as Error;
  const reason = trapReason(e.message);
  const frame = parseWasmFrame(e.stack);
  if (frame?.functionName && frame.functionName !== "__program__") {
    return new VLRuntimeError(
      `runtime error in ${frame.functionName} — ${reason}`,
      reason,
      frame.functionName,
    );
  }
  return new VLRuntimeError(`runtime error — ${reason}`, reason);
};

/**
 * Instantiate compiled wasm with the VL host-import ABI (the `__print_*__` family),
 * capturing each emitted value as a formatted line. The entry runs as the module's
 * START function, so a trap throws during `instantiate` — it is rethrown as a
 * {@link VLRuntimeError}.
 *
 * NO `imports.memory`. The native emitter DEFINES the module's own linear memory
 * (`emit_sections.vl`'s section 5, gated on `memUsed`) and synthesizes an in-module
 * `__log__` decoder rather than importing one — so the memory this host used to
 * hand over was never the memory the guest wrote to. Censused over every corpus
 * module that builds (1,149 of them): **0 import a memory, 0 import `__log__` or
 * `__log_string__`**; the only imports any module declares are the seven
 * `__print_*__` sinks below. The dead `imports.memory` and the two sinks that
 * existed only to decode bytes out of it are gone — with P0.2 exporting the real
 * memory as `exports.memory`, keeping a second, unrelated memory in the import
 * object is an active trap (a host reads the one it provided and sees all zeros).
 * See `docs/internals/buffer-design.md` §B6.
 */
export const runWasm = async (wasm: Uint8Array): Promise<RunResult> => {
  const logs: string[] = [];
  // Accumulates the UTF-8 BYTES streamed by `__print_char__` until `__print_str_flush__`.
  // STAGE 2c: the guest hands over its storage bytes verbatim — the import's name is
  // historical, and the code-point spread this used to do rendered every multi-byte
  // character as its bytes read as Latin-1.
  const printChars: number[] = [];
  let exports: WebAssembly.Exports = {};
  try {
    // The `as BufferSource` picks the BYTES overload of `instantiate`, the one that
    // resolves to `{ module, instance }`. Without it TS resolves to the `Module`
    // overload — which returns a bare `Instance`, so destructuring `.instance` off it
    // is a type error. The cast is needed because a caller's `Uint8Array` is
    // `Uint8Array<ArrayBufferLike>` while `BufferSource`'s view is pinned to a
    // non-shared `ArrayBuffer`; that variance gap is invisible to this API, which
    // accepts either at runtime. The CALL is byte-for-byte what it was before the
    // exports were returned — no compile/instantiate split, so start-function traps
    // still surface here and map identically.
    //
    // Worth knowing: `deno task test` runs with `--no-check`, so the local gate does
    // NOT type-check this file. `ci-native`'s `deno test -A tests/cases_wasm_test.ts`
    // does, and it is what caught this.
    const { instance } = await WebAssembly.instantiate(wasm as BufferSource, {
      imports: {
        // Direct value sinks for the `print(x)` builtin. A wasm i64 arrives as a
        // JS bigint; the rest as numbers. Booleans render as `true`/`false`.
        __print_i32__: (v: number) => logs.push(String(v)),
        __print_i64__: (v: bigint) => logs.push(v.toString()),
        __print_f32__: (v: number) => logs.push(String(v)),
        __print_f64__: (v: number) => logs.push(String(v)),
        __print_bool__: (v: number) => logs.push(v ? "true" : "false"),
        // A string prints by streaming its code points (no shared memory); flush
        // assembles and emits the accumulated line.
        __print_char__: (code: number) => printChars.push(code),
        // ── the filesystem floor: STUBS THAT THROW, and why they cannot be more ──
        //
        // MEASURED against this Deno's V8 (14.9.207.2), not assumed. Two independent
        // walls, either of which alone would be fatal:
        //
        //   1. A WasmGC object is OPAQUE TO JS. A `(array (mut i8))` handed to an
        //      import arrives as `typeof "object"` with `.length === undefined`,
        //      `a[0] === undefined`, `Object.keys(a) === []`, and `String(a)` throws
        //      "Cannot convert object to primitive value". So `__fs_write__` cannot
        //      read the path it was given.
        //   2. JS CANNOT CONSTRUCT ONE. Returning a `Uint8Array`, an array, a number
        //      or `undefined` for a `(ref null $arr)` result is rejected with "type
        //      incompatibility when transforming from/to JS"; `null` is the ONLY value
        //      V8 accepts, and the VL floor's results are NON-NULL `(ref $bl8)`, so
        //      even that is unusable. `Object.keys(WebAssembly)` carries no GC
        //      constructor: compile, validate, instantiate, compileStreaming,
        //      instantiateStreaming, promising.
        //
        // The usual escape — drive the module's own exported accessors — is closed
        // twice: a VL program's top level runs as the START function, so an import
        // firing from it sees `instance === undefined` (measured directly), and a
        // plain VL program exports nothing at all (`Object.keys(inst.exports)` is
        // empty), so there is no accessor to reach even afterwards.
        //
        // Hence: throw, with the reason in the message. fs coverage lives in the
        // native suites (`tests/selfhost_native_*`), and a corpus fixture that uses
        // these carries `// @skip`, which this harness honors and the native
        // alignment suite deliberately does not. See `scripts/vl-host/src/main.rs`'s
        // `register_fs_imports` for the working implementation.
        ...Object.fromEntries(
          [
            "__fs_read__",
            "__fs_write__",
            "__fs_list__",
            "__fs_stat__",
            "__args_count__",
            "__args_get__",
            "__fs_errno__",
          ].map((name) => [name, () => {
            throw new Error(
              `${name} is not available under the V8 harness — WasmGC values are opaque to JS ` +
                `and cannot be constructed from it. Run this case through the native \`vl\` ` +
                `(tests/selfhost_native_align_test.ts), or mark the fixture \`// @skip\`.`,
            );
          }]),
        ),
        __print_str_flush__: () => {
          // `TextDecoder` takes the whole buffer, so the chunking this used to need is
          // gone with its cause: `String.fromCodePoint(...spread)` blew the JS
          // call-argument limit on very large prints. Lossy per §Validity — a string
          // sliced off a character boundary is a legal VL value and must print.
          logs.push(new TextDecoder().decode(new Uint8Array(printChars)));
          printChars.length = 0;
        },
      },
    });
    exports = instance.exports;
  } catch (err) {
    throw mapTrap(err);
  }
  return { logs, exports };
};
