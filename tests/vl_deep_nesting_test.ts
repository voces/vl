// A FUNCTION NESTED 10,000 LEVELS DEEP COMPILES AND RUNS (D2182).
//
// Generated code nests `{`, labelled loops and `if`s as deep as its control flow goes, and the
// compiler recurses once per level. Natively that stack is now bounded by memory rather than by
// the engine's default (the host gives every seed engine a large stack), and the passes that
// re-walked a level's whole subtree once per level are linear (D2190). Each witness proves it ran
// the right code: an `if` level only runs when `a > 0`, and the innermost statement breaks
// straight out of the outermost labelled loop when `a < 0`.
//
// `vl fmt` runs at 2,000 levels: its output is quadratic in the depth (each level is indented
// once more), so at 10,000 the rendering is hundreds of megabytes. The editor half runs at
// 600: V8's stack is fixed near 1 MiB, and a cold start still caps nesting near 800 (D2189).
//
// GATING: the native half is env-gated (`SELFHOST_NATIVE_ALIGN=1`) and needs the binary; both
// halves need the seed and register as ignored without it. No node_modules tool is used.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import { runProgram } from "../playground/src/playground.ts";

const N = 10_000;
const FMT_N = 2_000;
const V8_N = 600;
const HAVE_SEED = exists(COMPILER);
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const NATIVE = GATED && HAVE_SEED && exists(VL);
if (GATED && !NATIVE) console.warn("[deep-nesting] skipped — missing vl binary or seed wasm.");

type Level = "bare" | "loop" | "if";
const SHAPES: [string, (k: number) => Level][] = [
  ["bare block", () => "bare"],
  ["labelled while loop", () => "loop"],
  ["if", () => "if"],
  ["mix of all three", (k) => (["bare", "loop", "if"] as Level[])[k % 3]],
];

const levels = (pick: (k: number) => Level, n: number): Level[] => Array.from({ length: n }, (_, k) => pick(k));

// One function whose body is `n` levels deep. A loop level adds one on the way in and one on the
// way out, then breaks its own label; the innermost statement leaves the OUTERMOST loop when
// `a < 0`, skipping every way-out increment below it.
const gen = (ls: Level[]): string => {
  const open: string[] = [];
  const close: string[] = [];
  ls.forEach((l, k) => {
    if (l === "bare") {
      open.push("{ const m = acc + 1; acc = m; ");
      close.push("} ");
    } else if (l === "loop") {
      open.push(`L${k}: while true { acc = acc + 1; `);
      close.push(`acc = acc + 1; break L${k} } `);
    } else {
      open.push("if a > 0 { acc = acc + 1; ");
      close.push("} ");
    }
  });
  const outer = ls.indexOf("loop");
  const inner = outer >= 0 ? `if a < 0 { break L${outer} } ` : "";
  return [
    "function f(a: i32): i32 {",
    "  let acc = 0",
    `  ${open.join("")}${inner}${close.reverse().join("")}`,
    "  acc",
    "}",
    "print(f(1))",
    "print(f(0))",
    "print(f(-1))",
    "",
  ].join("\n");
};

// What `f(a)` returns, by walking the levels the way the program does.
const expect = (ls: Level[], a: number): number => {
  let acc = 0;
  let depth = 0;
  while (depth < ls.length && !(ls[depth] === "if" && !(a > 0))) {
    acc += 1;
    depth += 1;
  }
  // `exitBelow`: loop levels at or past it were left by the innermost break.
  const outer = ls.indexOf("loop");
  const exitBelow = depth === ls.length && a < 0 && outer >= 0 ? outer : ls.length;
  for (let k = Math.min(depth, exitBelow) - 1; k >= 0; k--) if (ls[k] === "loop") acc += 1;
  return acc;
};

const want = (ls: Level[]) => [1, 0, -1].map((a) => String(expect(ls, a)));

const vl = async (args: string[]) => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    stdout: "piped",
    stderr: "piped",
    cwd: ROOT,
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std`, PATH: Deno.env.get("PATH") ?? "" },
    clearEnv: true,
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

const withFile = async (src: string, body: (file: string) => Promise<void>) => {
  const dir = await Deno.makeTempDir({ prefix: "vl-deep-nesting-" });
  try {
    const file = `${dir}/main.vl`;
    await Deno.writeTextFile(file, src);
    await body(file);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

for (const [name, pick] of SHAPES) {
  const ls = levels(pick, N);
  const WANT = want(ls);
  Deno.test({ name: `deep nesting (native): ${N} levels, ${name}, checks and runs`, ignore: !NATIVE }, async () => {
    await withFile(gen(ls), async (file) => {
      const chk = await vl(["check", file, "--compiler", COMPILER]);
      if (chk.code !== 0) throw new Error(`vl check: want rc 0, got ${chk.code}\n${chk.err.slice(0, 600)}`);
      const run = await vl(["run", file, "--compiler", COMPILER]);
      const got = run.out.trim().split("\n");
      if (run.code !== 0 || JSON.stringify(got) !== JSON.stringify(WANT)) {
        throw new Error(`vl run: want rc 0 and ${WANT}, got rc ${run.code} and ${got}\n${run.err.slice(0, 600)}`);
      }
    });
  });

  Deno.test({ name: `deep nesting (native): ${FMT_N} levels, ${name}, formats`, ignore: !NATIVE }, async () => {
    await withFile(gen(levels(pick, FMT_N)), async (file) => {
      // `--check` answers 0 or 1 (formatted or not); a trap is 70, and a host error is 1 with
      // an `Error:` report, so the report is read too.
      const fmt = await vl(["fmt", "--check", file, "--compiler", COMPILER]);
      if ((fmt.code !== 0 && fmt.code !== 1) || fmt.err.includes("Error")) {
        throw new Error(`vl fmt --check: want rc 0 or 1 and no error, got ${fmt.code}\n${fmt.err.slice(0, 600)}`);
      }
    });
  });
}

// The editor half: the same seed under V8, whose stack is the LSP's and the playground's.
const checker = () => {
  const inst = new WebAssembly.Instance(new WebAssembly.Module(Deno.readFileSync(COMPILER) as BufferSource), {});
  return createWasmChecker(() => inst.exports as unknown as Exports);
};

for (const [name, pick] of SHAPES) {
  const ls = levels(pick, V8_N);
  const src = gen(ls);
  const WANT = want(ls);
  Deno.test({ name: `deep nesting (V8): ${V8_N} levels, ${name}, checks, formats and runs`, ignore: !HAVE_SEED }, async () => {
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
