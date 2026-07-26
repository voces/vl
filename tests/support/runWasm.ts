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
  // Accumulates code points streamed by `__print_char__` until `__print_str_flush__`.
  const printChars: number[] = [];
  let exports: WebAssembly.Exports = {};
  try {
    const { instance } = await WebAssembly.instantiate(wasm, {
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
        __print_str_flush__: () => {
          // Chunk the code-point→string conversion: `String.fromCodePoint(...spread)`
          // blows the JS call-argument limit on very large prints — build the line
          // in bounded slices instead.
          let s = "";
          for (let i = 0; i < printChars.length; i += 8192) {
            s += String.fromCodePoint(...printChars.slice(i, i + 8192));
          }
          logs.push(s);
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
