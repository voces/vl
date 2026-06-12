// Runs the VL-in-VL wasm emitter (`compiler/wasmEmit.vl`) through the real VL
// module-graph toolchain and proves the bytes it emits are VALID WebAssembly.
//
// The proof (Track H4 spike): the round-trip VL emits bytes → real
// `WebAssembly.instantiate` runs them. The TS test parses the byte string back
// into a `Uint8Array`, instantiates it, and asserts the exported function
// behaves as designed (`main() === 42`; `id(x) === x`).
//
// This is a BOUNDED SPIKE: the emitter hand-builds two fixed modules (a constant
// function and an identity function) to exercise the LEB128 / section-framing /
// byte-array machinery a full codegen port will need. It does NOT consume the AST
// arena yet. Language/codegen gaps surfaced are in `docs/selfhost-gaps.md` under
// "Codegen self-host (H4)".
//
// REAL MODULES (H0): `ast.vl` `export`s its public surface, and the on-disk
// `compiler/wasmEmit.vl` is inlined into the in-memory DRIVER module that
// `import`s `P`/`i32ToStr` from `./ast`. The old glue — string-concatenating
// `ast.vl ++ wasmEmit.vl ++ driver` and caching via `compileCached` — is GONE:
// per-module name isolation means the driver's private names no longer need the
// whole-compile cache tier, and `compileProgram` drives the module graph.
//
// PERF (compile-once): both test cases drive the IDENTICAL module; the driver is
// compiled and run ONCE (memoized). The logs carry a `const:` line and an `id:`
// line; each `Deno.test` pulls its own line. binaryen `optimize()` still runs
// once — whole-compile cached via `compileProgramCached`.

import { runWasm } from "../compiler/compile.ts";
import { compileProgramCached } from "./_selfhost_cache.ts";

// Reuse binaryen's `optimize()` output across runs for any module whose
// pre-optimize bytes are unchanged (~40% of a compile). Keyed on unoptimized
// bytes + binaryen version; a compiler change busts only the modules whose
// codegen output changed.

// Resolved keys for the on-disk modules and the in-memory driver.
const compilerUrl = (name: string) =>
  new URL(`../compiler/${name}`, import.meta.url).pathname;
const AST = compilerUrl("ast.vl");
const WASM_EMIT = compilerUrl("wasmEmit.vl");

// The synthetic entry: the driver module. Its `./ast` specifier resolves to the
// real on-disk `compiler/ast.vl`; the body of `wasmEmit.vl` is inlined because
// `wasmEmit.vl` does not yet export its functions (it is pre-module-system code
// that uses `P`/`i32ToStr` from `ast.vl` implicitly). Inlining it here gives the
// merged compiler a single compilation unit with `import { P, i32ToStr } from
// "./ast"` at the top, which is exactly the shape `compileProgram` expects.
const DRIVER = compilerUrl("__wasm_emit_driver__.vl");

// Compile the driver module ONCE (memoized), returning the log lines from the run.
// The driver invokes `reportConst()` and `reportId()` to print two log lines:
//   const: <comma-joined decimal bytes>
//   id:    <comma-joined decimal bytes>
let fixtureLogs: Promise<string[]> | undefined;
const runFixture = (): Promise<string[]> =>
  fixtureLogs ??= (async () => {
    const wasmEmitSrc = Deno.readTextFileSync(WASM_EMIT);
    // The driver: import the public surface of ast.vl, then the wasmEmit body
    // (all its functions/globals use P and i32ToStr via the import above), then
    // the two reporter functions and their calls.
    // Import P, i32ToStr (values) plus all node-variant types that wasmEmit.vl
    // narrows with `is` checks — the module system resolves these to ast.vl's
    // exported surface.
    const driverSrc =
      `import { P, i32ToStr, mkStr, mkTypeRef, mkParam, mkFunc, mkIdent, mkCall, mkCallN, mkMember, mkBinary, hasNamedArgs, orderArgsByParamNames } from "./ast"\n` +
      `import {\n` +
      `  ArrayLit,\n` +
      `  BinExpr,\n` +
      `  Block,\n` +
      `  BoolLit,\n` +
      `  BreakStmt,\n` +
      `  ContinueStmt,\n` +
      `  Call,\n` +
      `  CharLit,\n` +
      `  FieldDef,\n` +
      `  FieldInit,\n` +
      `  ForRange,\n` +
      `  ForIn,\n` +
      `  FuncDecl,\n` +
      `  Ident,\n` +
      `  IfStmt,\n` +
      `  Index,\n` +
      `  IsExpr,\n` +
      `  LetDecl,\n` +
      `  Member,\n` +
      `  NumLit,\n` +
      `  NullLit,\n` +
      `  ObjLit,\n` +
      `  OptMember,\n` +
      `  Param,\n` +
      `  Paren,\n` +
      `  Program,\n` +
      `  RetStmt,\n` +
      `  StrLit,\n` +
      `  TypeDecl,\n` +
      `  TypeRef,\n` +
      `  Unary,\n` +
      `  UnionDecl,\n` +
      `  WhileStmt,\n` +
      `} from "./ast"\n\n` +
      wasmEmitSrc +
      `\nfunction reportConst(): i32 {\n` +
      `  buildConstModule()\n` +
      `  print("const: " + bytesToStr())\n` +
      `  0\n` +
      `}\n` +
      `function reportId(): i32 {\n` +
      `  buildIdentityModule()\n` +
      `  print("id: " + bytesToStr())\n` +
      `  0\n` +
      `}\n` +
      `reportConst()\n` +
      `reportId()\n`;

    const sources: Record<string, string> = {
      [DRIVER]: driverSrc,
      [AST]: Deno.readTextFileSync(AST),
    };
    const { wasm, diagnostics } = await compileProgramCached(DRIVER, sources);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "self-hosted wasm emitter failed to compile: " +
          errors.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    return logs;
  })();

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
  const logs = await runFixture();
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
  const logs = await runFixture();
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
