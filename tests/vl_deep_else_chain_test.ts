// A LONG `else if` CHAIN COSTS NO COMPILER STACK (D1990).
//
// A `match` desugars to an if/else chain whose `else` holds the next `if`, so an N-arm match
// is an AST N levels deep, and a hand-written `else if` chain is the same shape. Every pass
// that recursed into the else ran out of stack past ~2,500 links — natively under wasmtime's
// guest stack, and in the editor under V8's. The passes now loop along the chain's spine.
//
// The native half runs the seed on wasmtime's default stack (`VL_SEED_STACK=default`), the stack
// the recursive passes fell on: the host's own stack is large enough to hide a recursion (D2182),
// and a control proves the small one is in force by refusing a 1,000-deep `if` NEST there. The
// `match` and both chains run at 10,000 links, past every depth a recursive pass fell at, and
// cheap to check because a link no longer walks the chain below it (D4557). Each witness prints
// three values only the right arm produces, so a chain that dispatched wrongly cannot pass.
//
// GATING: the native half is env-gated (`SELFHOST_NATIVE_ALIGN=1`) and needs the binary; both
// halves need the seed, and register as ignored without it. The br_table-count case ALSO
// needs `wasm-dis` (at `node_modules/.bin`, not on PATH, per CLAUDE.md's "Disassembly" note)
// — `ci-native` installs no npm deps, so it self-ignores there; the `ci-release-shape` job
// names this file and runs it with npm deps.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists, binaryen, hostWasmDis, isaEnv } from "./support/tree.ts";
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import { runProgram } from "../playground/src/playground.ts";

const N = 10_000;
const HAVE_SEED = exists(COMPILER);
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const NATIVE = GATED && HAVE_SEED && exists(VL);
if (GATED && !NATIVE) console.warn("[deep-else-chain] skipped — missing vl binary or seed wasm.");

const WASM_DIS = binaryen("wasm-dis");
const HAVE_WASM_DIS = exists(WASM_DIS);

// A dense integer `match` in return position: the shape the br_table lowering serves.
const genMatch = (n: number): string => {
  const arms: string[] = [];
  for (let i = 0; i < n; i++) arms.push(`${i} => ${i * 3 + 1}`);
  return `function f(x: i32): i32 {\n  return match x { ${arms.join(", ")}, _ => -1 }\n}\n`;
};

// The same dispatch as a hand-written statement chain, one link per line.
const genElseIf = (n: number): string => {
  const o = ["function f(x: i32): i32 {", "  if x == 0 { return 1 }"];
  for (let i = 1; i < n; i++) o.push(`  else if x == ${i} { return ${i * 3 + 1} }`);
  o.push("  else { return -1 }", "}");
  return o.join("\n") + "\n";
};

// An `if` expression chain in value position, which the value emitters lower.
const genIfExpr = (n: number): string => {
  const links: string[] = [];
  for (let i = 0; i < n; i++) links.push(`if x == ${i} { ${i * 3 + 1} } else`);
  return `function f(x: i32): i32 {\n  const r = ${links.join(" ")} { -1 }\n  return r\n}\n`;
};

const probes = (n: number) => `print(f(7))\nprint(f(${n - 1}))\nprint(f(${n + 5}))\n`;
const want = (n: number) => ["22", String((n - 1) * 3 + 1), "-1"];

// [name, generator, links natively, links under V8]
const PROGRAMS: [string, (n: number) => string, number, number][] = [
  ["match", genMatch, N, N],
  ["else-if statement chain", genElseIf, N, N],
  ["if-expression chain", genIfExpr, N, N],
];

// The same `if` nested rather than chained: the compiler recurses once per level.
const genNest = (n: number): string =>
  `function f(a: i32): i32 {\n  let acc = 0\n  ${"if a > 0 { acc = acc + 1; ".repeat(n)}${"} ".repeat(n)}\n  acc\n}\nprint(f(1))\n`;

const SMALL_STACK = { VL_SEED_STACK: "default" };

const vl = async (args: string[], extra: Record<string, string> = {}) => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    stdout: "piped",
    stderr: "piped",
    cwd: ROOT,
    env: {
      RUST_BACKTRACE: "0",
      NO_COLOR: "1",
      VL_STD: `${ROOT}/std`,
      // binaryen's `wasm-dis` for `--wat`, which is a node script, hence PATH.
      VL_WASM_DIS: hostWasmDis(),
      PATH: Deno.env.get("PATH") ?? "",
      ...isaEnv(),
      ...extra,
      // node cannot start on Windows without it.
      ...(Deno.build.os === "windows" ? { SYSTEMROOT: Deno.env.get("SYSTEMROOT") ?? "" } : {}),
    },
    clearEnv: true,
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

for (const [name, gen, n] of PROGRAMS) {
  const src = gen(n) + probes(n);
  const WANT = want(n);
  Deno.test({ name: `deep chain (native): a ${n}-link ${name} checks, runs and formats`, ignore: !NATIVE }, async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl-deep-chain-" });
    try {
      const file = `${dir}/main.vl`;
      await Deno.writeTextFile(file, src);
      // Three independent processes over one file, run side by side.
      const [chk, run, fmt] = await Promise.all([
        vl(["check", file, "--compiler", COMPILER], SMALL_STACK),
        vl(["run", file, "--compiler", COMPILER], SMALL_STACK),
        vl(["fmt", "--check", file, "--compiler", COMPILER], SMALL_STACK),
      ]);
      if (chk.code !== 0) throw new Error(`vl check: want rc 0, got ${chk.code}\n${chk.err.slice(0, 600)}`);
      const got = run.out.trim().split("\n");
      if (run.code !== 0 || JSON.stringify(got) !== JSON.stringify(WANT)) {
        throw new Error(`vl run: want rc 0 and ${WANT}, got rc ${run.code} and ${got}\n${run.err.slice(0, 600)}`);
      }
      // `--check` answers 0 or 1 (formatted or not); a compiler trap is 70.
      if (fmt.code !== 0 && fmt.code !== 1) {
        throw new Error(`vl fmt --check: want rc 0 or 1, got ${fmt.code}\n${fmt.err.slice(0, 600)}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });
}

// The control: were `VL_SEED_STACK` ignored, the chains above would prove nothing about recursion.
Deno.test({ name: "deep chain (native): the small stack refuses a 1,000-deep if NEST with exit 70", ignore: !NATIVE }, async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl-deep-chain-" });
  try {
    const file = `${dir}/main.vl`;
    await Deno.writeTextFile(file, genNest(1_000));
    const chk = await vl(["check", file, "--compiler", COMPILER], SMALL_STACK);
    if (chk.code !== 70 || !chk.err.includes("call stack")) {
      throw new Error(`vl check: want rc 70 and a call-stack report, got ${chk.code}\n${chk.err.slice(0, 600)}`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test({
  name: `deep chain (native): the ${N}-arm dense match still lowers to one br_table`,
  ignore: !NATIVE || !HAVE_WASM_DIS,
}, async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl-deep-chain-" });
  try {
    const file = `${dir}/main.vl`;
    await Deno.writeTextFile(file, genMatch(N) + probes(N));
    const b = await vl(["build", file, "-o", `${dir}/main.wasm`, "--wat", "--compiler", COMPILER]);
    if (b.code !== 0) throw new Error(`vl build: want rc 0, got ${b.code}\n${b.err.slice(0, 600)}`);
    // `--wat` is skipped, with a note, where the disassembler is absent.
    if (!exists(`${dir}/main.wat`)) return;
    const tables = (await Deno.readTextFile(`${dir}/main.wat`)).split("br_table").length - 1;
    if (tables !== 1) throw new Error(`want exactly one br_table in the module, got ${tables}`);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

// The editor half: the same seed under V8, whose stack is the LSP's and the playground's.
const checker = () => {
  const inst = new WebAssembly.Instance(new WebAssembly.Module(Deno.readFileSync(COMPILER) as BufferSource), {});
  return createWasmChecker(() => inst.exports as unknown as Exports);
};

for (const [name, gen, , n] of PROGRAMS) {
  const src = gen(n) + probes(n);
  const WANT = want(n);
  Deno.test({ name: `deep chain (V8): a ${n}-link ${name} checks, formats and runs in the editor`, ignore: !HAVE_SEED }, async () => {
    const c = checker();
    const diags = await c.check(src, "/tmp/main.vl", () => undefined);
    const errs = diags.filter((d) => d.severity === "error");
    if (errs.length !== 0) throw new Error(`check: want no errors, got ${JSON.stringify(errs).slice(0, 600)}`);
    if (c.formatSrc(src) === undefined) throw new Error("formatSrc: want a rendering, got undefined");
    const r = await runProgram(src, c);
    if (!r.compiled || JSON.stringify(r.logs) !== JSON.stringify(WANT)) {
      throw new Error(`run: want ${WANT}, got compiled=${r.compiled} logs=${JSON.stringify(r.logs)}`);
    }
  });
}
