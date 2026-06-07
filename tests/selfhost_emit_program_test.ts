// Proves the FIRST AST-driven slice of the VL-in-VL back end: `emitProgram`
// (`compiler/wasmEmit.vl`) walks the real arena AST and emits a valid module —
// unlike the fixed-bytes spike (`selfhost_wasm_emit_test.ts`), which never reads
// the arena.
//
// The pipeline runs entirely through the real VL toolchain, from raw SOURCE TEXT:
// the genuine lexer (`compiler/lexer.vl`) tokenizes the string, the genuine parser
// (`compiler/parser.vl`) builds the `compiler/ast.vl` arena, and `emitProgram`
// reads that arena to produce the module bytes. The TS runner parses the emitted
// byte string back into a `Uint8Array` and hands it to the real
// `WebAssembly.instantiate` — so the proof is SOURCE → arena → bytes → real engine,
// asserting the exported `main()` returns the source's integer literal.
//
// VL has no module system yet, so the sources are concatenated ahead of a `.vl`
// print-driver, compiled to wasm, and run. Like `selfhost_pipeline_test.ts`, the
// lexer and parser/ast were ported separately and define COLLIDING names (`Tok`,
// `Diag`, `advance`); the runner renames the lexer's three in its SOURCE TEXT
// before concatenation (glue only — no `.vl` compiler file is edited).

import { compile, runWasm } from "../compiler/compile.ts";

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

// The lexer, with its three names that collide with `ast.vl`/`parser.vl` renamed
// in the SOURCE TEXT (the parser only sees `tokenize`/`LexResult`). Pure glue: the
// on-disk `lexer.vl` is untouched. `\b…\b` keeps `Tok` from matching `tokens`/
// `toks` and `Diag` from matching `diags`/`gDiags`; `advance` is its own word.
const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");

const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const wasmEmit = read("../compiler/wasmEmit.vl");

// The driver glue: lex `src` into the parser's `P.toks`, parse to an arena root,
// run `emitProgram` over it, and print either the emitted bytes or the emitter's
// unsupported-shape message. (`emitProgram` returns -1 and sets `emitErr` on any
// shape it doesn't handle; on success it leaves the module in `W.bytes`.)
const prelude = `
function loadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i })
    i = i + 1
  }
  P.toks.length
}
function report(src: string): i32 {
  loadToks(src)
  let root = parseProgram()
  let rc = emitProgram(root)
  if rc < 0 {
    print("err: " + emitErr)
  } else {
    print("main: " + bytesToStr())
  }
  0
}
`;

// Compile `lexer.vl ++ ast.vl ++ parser.vl ++ wasmEmit.vl ++ driver`, run it, and
// return the logs. Order matters: `ast.vl` defines `P`/the node types/`mk*` the
// parser builds and `wasmEmit.vl` reads; the lexer is independent and goes first.
const runFor = async (src: string): Promise<string[]> => {
  const driver = prelude + `\nreport(${JSON.stringify(src)})\n`;
  const source = lexer + "\n" + ast + "\n" + parser + "\n" + wasmEmit + "\n" +
    driver;
  const { wasm, diagnostics } = await compile(source);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0 || !wasm) {
    throw new Error(
      "self-hosted emit-program driver failed to compile: " +
        errors.map((d) => d.message).join("; "),
    );
  }
  const { logs } = await runWasm(wasm);
  return logs;
};

// Parse the single `main: b0,b1,...` log line into a byte array.
const bytesFromLog = (logs: string[]): Uint8Array<ArrayBuffer> => {
  const line = logs.find((l) => l.startsWith("main: "));
  if (!line) {
    throw new Error(`emitter did not print a \`main:\` line; got ${JSON.stringify(logs)}`);
  }
  const nums = line.slice("main: ".length).split(",").map((s) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      throw new Error(`byte out of range in emitter output: ${s}`);
    }
    return n;
  });
  return new Uint8Array(nums);
};

// Instantiate the VL-emitted bytes and call the exported `main()`.
const runMain = async (bytes: Uint8Array<ArrayBuffer>): Promise<number> => {
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {});
  const main = instance.exports.main as () => number;
  return main();
};

Deno.test("self-hosted emit-program: arena walk of `main(): i32 { return 42 }` instantiates to main()===42", async () => {
  const logs = await runFor("function main(): i32 {\n  return 42\n}\n");
  const bytes = bytesFromLog(logs);
  const got = await runMain(bytes);
  if (got !== 42) throw new Error(`main() returned ${got}, expected 42`);
});

Deno.test("self-hosted emit-program: a different literal flows from source through the arena", async () => {
  // The value is READ from the arena's `NumLit`, not hard-coded — a different
  // source literal must yield a different `main()`.
  const logs = await runFor("function main(): i32 {\n  return 7\n}\n");
  const got = await runMain(bytesFromLog(logs));
  if (got !== 7) throw new Error(`main() returned ${got}, expected 7`);
});

Deno.test("self-hosted emit-program: an unsupported shape fails loudly, not with garbage bytes", async () => {
  // No `main`: `emitProgram` must take the unsupported path (set `emitErr`,
  // emit no bytes) rather than produce a wrong module.
  const logs = await runFor("function other(): i32 {\n  return 1\n}\n");
  const errLine = logs.find((l) => l.startsWith("err: "));
  if (!errLine) {
    throw new Error(`expected an \`err:\` line for the unsupported shape; got ${JSON.stringify(logs)}`);
  }
  if (!errLine.includes("main")) {
    throw new Error(`unexpected emitter error message: ${errLine}`);
  }
});
