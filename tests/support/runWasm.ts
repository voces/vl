// Compiler-free wasm execution for the behavioral test corpus.
//
// `cases_wasm_test.ts` (the standing `.vl` corpus oracle — it COMPILES through the
// self-hosted seed, never the TS compiler) needs only to RUN the emitted module
// and capture `print`/`log` output, plus surface a trap as a typed error for
// `@trap` cases. This lifts exactly that — the host-import ABI + trap mapping —
// out of `compiler/compile.ts` so the corpus oracle carries no dependency on the
// TS compiler front end (which the kill-TS work is deleting). It is a faithful
// copy of `compile.ts`'s `runWasm`/`VLRuntimeError`/`mapTrap`, minus the source-map
// path: the corpus passes no source map (it asserts trap REASONS, not positions —
// `@trap` position directives are skipped via `isTrapPosition`), so the VLQ /
// source-map decode machinery is omitted.

export type RunResult = { logs: string[] };

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
 * Instantiate compiled wasm with the VL host-import ABI (`memory` +
 * `__print_*__`/`__log*__`), capturing each emitted value as a formatted line.
 * The entry runs as the module's START function, so a trap throws during
 * `instantiate` — it is rethrown as a {@link VLRuntimeError}.
 */
export const runWasm = async (wasm: Uint8Array): Promise<RunResult> => {
  const logs: string[] = [];
  // Accumulates code points streamed by `__print_char__` until `__print_str_flush__`.
  const printChars: number[] = [];
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536 });
  try {
    await WebAssembly.instantiate(wasm, {
      imports: {
        memory,
        // Read `length` raw bytes at `offset` and render them as a UTF-8 string
        // (the byte form a `__store_string__` writes from a GC string).
        __log_string__: (offset: number, length: number) => {
          logs.push(
            new TextDecoder().decode(
              new Uint8Array(memory.buffer, offset, length),
            ),
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
  } catch (err) {
    throw mapTrap(err);
  }
  return { logs };
};
