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

// Instantiate the VL-emitted bytes and call the export `name` with `args`.
const runExport = async (
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  ...args: number[]
): Promise<number> => {
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {});
  const fn = instance.exports[name] as (...a: number[]) => number;
  return fn(...args);
};

// Convenience for the zero-arg `main` export used by the trivial cases.
const runMain = (bytes: Uint8Array<ArrayBuffer>): Promise<number> =>
  runExport(bytes, "main");

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

Deno.test("self-hosted emit-program: a non-`main` function exports under its own name", async () => {
  // The export name is the source function's name, generalized beyond `main`.
  const logs = await runFor("function other(): i32 {\n  return 1\n}\n");
  const got = await runExport(bytesFromLog(logs), "other");
  if (got !== 1) throw new Error(`other() returned ${got}, expected 1`);
});

Deno.test("self-hosted emit-program: `return x` of an i32 param lowers to local.get", async () => {
  const logs = await runFor("function id(x: i32): i32 {\n  return x\n}\n");
  const got = await runExport(bytesFromLog(logs), "id", 7);
  if (got !== 7) throw new Error(`id(7) returned ${got}, expected 7`);
});

Deno.test("self-hosted emit-program: `return a + b` over two params lowers to i32.add", async () => {
  const logs = await runFor(
    "function add(a: i32, b: i32): i32 {\n  return a + b\n}\n",
  );
  const got = await runExport(bytesFromLog(logs), "add", 2, 3);
  if (got !== 5) throw new Error(`add(2, 3) returned ${got}, expected 5`);
});

Deno.test("self-hosted emit-program: `return x + x` reuses the same param twice", async () => {
  const logs = await runFor(
    "function double(x: i32): i32 {\n  return x + x\n}\n",
  );
  const got = await runExport(bytesFromLog(logs), "double", 21);
  if (got !== 42) throw new Error(`double(21) returned ${got}, expected 42`);
});

Deno.test("self-hosted emit-program: literal arithmetic `return 6 * 7` folds at runtime to 42", async () => {
  const logs = await runFor("function lit(): i32 {\n  return 6 * 7\n}\n");
  const got = await runExport(bytesFromLog(logs), "lit");
  if (got !== 42) throw new Error(`lit() returned ${got}, expected 42`);
});

Deno.test("self-hosted emit-program: nested params + ops `return a * b - c` evaluates correctly", async () => {
  const logs = await runFor(
    "function f(a: i32, b: i32, c: i32): i32 {\n  return a * b - c\n}\n",
  );
  const got = await runExport(bytesFromLog(logs), "f", 5, 4, 3);
  if (got !== 17) throw new Error(`f(5, 4, 3) returned ${got}, expected 17`);
});

Deno.test("self-hosted emit-program: a recursive `fib` compiles, calls itself, and runs", async () => {
  // Forces the full slice at once: an `if n < 2 { return n }` guard (comparison +
  // structured void `if` + `return`), then `return fib(n-1) + fib(n-2)` — two
  // recursive calls whose own index is resolved through the function-index map.
  const logs = await runFor(
    "function fib(n: i32): i32 {\n  if n < 2 { return n }\n  return fib(n - 1) + fib(n - 2)\n}\n",
  );
  const bytes = bytesFromLog(logs);
  const got = await runExport(bytes, "fib", 10);
  if (got !== 55) throw new Error(`fib(10) returned ${got}, expected 55`);
});

Deno.test("self-hosted emit-program: a recursive `fact` multiplies down to the base case", async () => {
  const logs = await runFor(
    "function fact(n: i32): i32 {\n  if n <= 1 { return 1 }\n  return n * fact(n - 1)\n}\n",
  );
  const got = await runExport(bytesFromLog(logs), "fact", 5);
  if (got !== 120) throw new Error(`fact(5) returned ${got}, expected 120`);
});

Deno.test("self-hosted emit-program: a two-function call chain links `main` to a helper", async () => {
  // Two top-level functions in one module: `main` calls `inc`. The export section
  // carries both, and the call resolves `inc` through the name→index map.
  const logs = await runFor(
    "function inc(x: i32): i32 {\n  return x + 1\n}\nfunction main(): i32 {\n  return inc(41)\n}\n",
  );
  const bytes = bytesFromLog(logs);
  const main = await runExport(bytes, "main");
  if (main !== 42) throw new Error(`main() returned ${main}, expected 42`);
  // Both functions are exported under their own names — `inc` is callable too.
  const inc = await runExport(bytes, "inc", 9);
  if (inc !== 10) throw new Error(`inc(9) returned ${inc}, expected 10`);
});

Deno.test("self-hosted emit-program: a non-recursive `if` branch picks a sign", async () => {
  // A void `if` whose then-branch `return`s `-1` (unary negation), with a fall-
  // through `return 1` — no recursion, no block result type.
  const logs = await runFor(
    "function sign(n: i32): i32 {\n  if n < 0 { return -1 }\n  return 1\n}\n",
  );
  const bytes = bytesFromLog(logs);
  const neg = await runExport(bytes, "sign", -5);
  if (neg !== -1) throw new Error(`sign(-5) returned ${neg}, expected -1`);
  const pos = await runExport(bytes, "sign", 5);
  if (pos !== 1) throw new Error(`sign(5) returned ${pos}, expected 1`);
});

Deno.test("self-hosted emit-program: `let`/`const` locals + assignment compile to wasm locals", async () => {
  // The slice's headline shape: a `let` initialized from an arithmetic expr over a
  // param, a `const`, then a reassignment that reads both — each lowering to a wasm
  // local (index after the param) via `local.set`/`local.get`.
  const logs = await runFor(
    "function f(n: i32): i32 {\n  let acc = n * 2\n  const bonus = 5\n  acc = acc + bonus\n  return acc\n}\n",
  );
  const got = await runExport(bytesFromLog(logs), "f", 10);
  if (got !== 25) throw new Error(`f(10) returned ${got}, expected 25`);
});

Deno.test("self-hosted emit-program: a local reused/reassigned across several statements", async () => {
  // `sum` accumulates across three reassignments — proves a single local slot is
  // read-modified-written repeatedly (local.get then local.set to the same index).
  const logs = await runFor(
    "function acc3(a: i32, b: i32, c: i32): i32 {\n  let sum = a\n  sum = sum + b\n  sum = sum + c\n  return sum\n}\n",
  );
  const got = await runExport(bytesFromLog(logs), "acc3", 4, 5, 6);
  if (got !== 15) throw new Error(`acc3(4, 5, 6) returned ${got}, expected 15`);
});

Deno.test("self-hosted emit-program: a local feeds a call argument", async () => {
  // A local computed in `main`, then passed to `inc` — the local.get supplies the
  // call argument across the function-index map.
  const logs = await runFor(
    "function inc(x: i32): i32 {\n  return x + 1\n}\nfunction main(): i32 {\n  let base = 40\n  let plus = base + 1\n  return inc(plus)\n}\n",
  );
  const got = await runExport(bytesFromLog(logs), "main");
  if (got !== 42) throw new Error(`main() returned ${got}, expected 42`);
});

Deno.test("self-hosted emit-program: a local drives an `if` condition", async () => {
  // The local `t` (a comparison against the param) is read into the void `if`'s
  // condition; the then-branch returns one value, the fall-through another.
  const logs = await runFor(
    "function clamp(n: i32): i32 {\n  let over = n > 100\n  if over { return 100 }\n  return n\n}\n",
  );
  const bytes = bytesFromLog(logs);
  const hi = await runExport(bytes, "clamp", 250);
  if (hi !== 100) throw new Error(`clamp(250) returned ${hi}, expected 100`);
  const lo = await runExport(bytes, "clamp", 7);
  if (lo !== 7) throw new Error(`clamp(7) returned ${lo}, expected 7`);
});

Deno.test("self-hosted emit-program: a non-i32 local init fails loudly, not with garbage bytes", async () => {
  // A `let` whose initializer is a string literal is outside this slice (i32 locals
  // only): `emitProgram` must take the unsupported path (set `emitErr`, emit no
  // bytes) rather than emit a wrong local type.
  const logs = await runFor(
    'function bad(): i32 {\n  let s = "hi"\n  return 0\n}\n',
  );
  const errLine = logs.find((l) => l.startsWith("err: "));
  if (!errLine) {
    throw new Error(`expected an \`err:\` line for the non-i32 local; got ${JSON.stringify(logs)}`);
  }
  if (!errLine.includes("i32 locals")) {
    throw new Error(`unexpected emitter error message: ${errLine}`);
  }
});

Deno.test("self-hosted emit-program: an unsupported shape fails loudly, not with garbage bytes", async () => {
  // Division is outside this slice (only `+`/`-`/`*`): `emitProgram` must take
  // the unsupported path (set `emitErr`, emit no bytes) rather than produce a
  // wrong module.
  const logs = await runFor("function bad(a: i32): i32 {\n  return a / 2\n}\n");
  const errLine = logs.find((l) => l.startsWith("err: "));
  if (!errLine) {
    throw new Error(`expected an \`err:\` line for the unsupported shape; got ${JSON.stringify(logs)}`);
  }
  if (!errLine.includes("operator")) {
    throw new Error(`unexpected emitter error message: ${errLine}`);
  }
});
