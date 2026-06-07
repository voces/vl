// Runs the VL-in-VL wasm emitter (`compiler/wasmEmit.vl`) through the real VL
// toolchain and proves the bytes it emits are VALID WebAssembly. VL has no module
// system yet, so the sources are concatenated ahead of a `.vl` print-driver,
// compiled to wasm by the TS `compile()`, and run; the captured log is the
// emitted module as a comma-joined decimal byte string.
//
// The proof (Track H4 spike): the round-trip VL emits bytes -> real
// `WebAssembly.instantiate` runs them. The TS test parses the byte string back
// into a `Uint8Array`, instantiates it, and asserts the exported function
// behaves as designed (`main() === 42`; `id(x) === x`).
//
// This is a BOUNDED SPIKE: the emitter hand-builds two fixed modules (a constant
// function and an identity function) to exercise the LEB128 / section-framing /
// byte-array machinery a full codegen port will need. It does NOT consume the AST
// arena yet. Language/codegen gaps surfaced are in `docs/selfhost-gaps.md` under
// "Codegen self-host (H4)".

import { compile, runWasm } from "../compiler/compile.ts";

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

const ast = read("../compiler/ast.vl");
const wasmEmit = read("../compiler/wasmEmit.vl");

// Compile `ast.vl ++ wasmEmit.vl ++ driver`, run it, return the logs.
const runDriver = async (driver: string): Promise<string[]> => {
  const source = ast + "\n" + wasmEmit + "\n" + driver;
  const { wasm, diagnostics } = await compile(source);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0 || !wasm) {
    throw new Error(
      "self-hosted wasm emitter failed to compile: " +
        errors.map((d) => d.message).join("; "),
    );
  }
  const { logs } = await runWasm(wasm);
  return logs;
};

// Parse one `name: b0,b1,...` log line into [name, Uint8Array].
const parseLine = (line: string): [string, Uint8Array<ArrayBuffer>] => {
  const idx = line.indexOf(": ");
  const name = line.slice(0, idx);
  const rest = line.slice(idx + 2);
  const nums = rest.split(",").map((s) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      throw new Error(`byte out of range in emitter output: ${s}`);
    }
    return n;
  });
  return [name, new Uint8Array(nums)];
};

Deno.test("self-hosted wasm emit: VL emits a () -> i32 module that returns 42", async () => {
  const logs = await runDriver(read("./selfhost/wasm_emit_harness.vl"));
  const byName = new Map(logs.map(parseLine));

  const constBytes = byName.get("const");
  if (!constBytes) throw new Error("emitter did not print a `const:` line");

  // The exact byte stream is load-bearing — pin it so regressions are obvious.
  // header + type(()->i32) + func + export "main" + code(i32.const 42; end)
  const expected = [
    0, 97, 115, 109, 1, 0, 0, 0, // \0asm version 1
    1, 5, 1, 96, 0, 1, 127, // type section: () -> i32
    3, 2, 1, 0, // function section: func 0 : type 0
    7, 8, 1, 4, 109, 97, 105, 110, 0, 0, // export "main" func 0
    10, 6, 1, 4, 0, 65, 42, 11, // code: i32.const 42 ; end
  ];
  if (JSON.stringify([...constBytes]) !== JSON.stringify(expected)) {
    throw new Error(
      `emitted bytes mismatch:\n  got      ${[...constBytes]}\n  expected ${expected}`,
    );
  }

  // The real proof: instantiate the VL-emitted bytes as actual WebAssembly.
  const module = await WebAssembly.compile(constBytes);
  const instance = await WebAssembly.instantiate(module, {});
  const main = instance.exports.main as () => number;
  if (main() !== 42) throw new Error(`main() returned ${main()}, expected 42`);
});

Deno.test("self-hosted wasm emit: VL emits an (i32) -> i32 identity module", async () => {
  const logs = await runDriver(read("./selfhost/wasm_emit_harness.vl"));
  const byName = new Map(logs.map(parseLine));

  const idBytes = byName.get("id");
  if (!idBytes) throw new Error("emitter did not print an `id:` line");

  const module = await WebAssembly.compile(idBytes);
  const instance = await WebAssembly.instantiate(module, {});
  const id = instance.exports.id as (x: number) => number;
  if (id(7) !== 7) throw new Error(`id(7) returned ${id(7)}, expected 7`);
  if (id(0) !== 0) throw new Error(`id(0) returned ${id(0)}, expected 0`);
  if (id(-5) !== -5) throw new Error(`id(-5) returned ${id(-5)}, expected -5`);
});
