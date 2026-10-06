// SCALING SHAPE: two programs, the same amount of work, one axis reshaped.
//
// A pass that re-derives a module-wide answer per ENTITY is O(entities x nodes) and is
// invisible to a wall-clock budget, because the budget has to be loose enough for the
// slowest box that runs it. A RATIO is not: machine speed, JIT warm-up and box load
// multiply both arms, so they cancel. #2419 is the worked instance — two module-wide
// predicates re-derived once per emitted FUNCTION were 59% of a self-compile, and the
// functions pair below reads 5.81x on that compiler against 1.02x after.
//
// A compile pair's ratio is of the compiler's guest FUEL (`$VL_FUEL=1`), a count of guest
// instructions that box load cannot move; the runtime pairs are of the child's CPU. The two
// CONTROLS at the end are pairs that must red, one per grader, so a grader that stopped
// measuring cannot pass in silence.
//
// One pair per axis a pass could accidentally multiply over. The "many" arm spreads the
// same work over N entities, the "one" arm over N/K. Method and profiles:
// docs/internals/profiling-the-compiler.md.
//
// @test-timing instrument

// A COMPILE BAR IS THE FAMILY DEFAULT 2.5, OR 1.25x THE AXIS'S FUEL RATIO WHERE THAT IS
// HIGHER; an axis whose bar is deliberately tighter keeps it. A fuel ratio is the same on
// every run, so the margin pays only for the compiler changing, not for the box. Four axes
// sit above the default because they are super-linear today — `types`, `reads after many
// closed sibling shadows`, `list concat chain length`, `if joins nested deep` —
// and that is recorded DEBT, not tolerance: lower a bar when the thing it names stops
// multiplying. Five are GROWTH pairs, the same shape at `n` against `n/4`, so linear reads 4
// rather than 1: `many distinct captured sibling blocks`, `list concat chain length`,
// `in-function value writes` and the two `if joins` pairs. The CPU readings quoted
// beside individual pairs below predate fuel grading.

import { ROOT, VL, exists } from "./support/tree.ts";

const COMPILER = Deno.env.get("VL_SCALING_COMPILER") ?? `${ROOT}/build/vl-compiler.wasm`;
const ENABLED = exists(VL) && exists(COMPILER);
if (!ENABLED) console.warn("[scaling-shape] skipped — missing vl binary or seed wasm.");

// Statements every pair repeats verbatim on BOTH sides. They damp the source-byte
// asymmetry the extra declarations introduce and lift the cheaper arm clear of the
// process-start floor, so the ratio stays a ratio rather than becoming a budget.
const fill = (out: string[], i: number, n: number) => {
  for (let j = 0; j < n; j++) out.push(`acc = acc + ${(i + j) % 13} * ${j % 7} - ${j % 5}`);
};

// ── the pairs ────────────────────────────────────────────────────────────────
// `many(N)` and `one(N)` of each axis lower the same statements; only the count of the
// axis entity differs. Each returns the whole program text.

const genFunctions = (nf: number, ns: number): string => {
  const o: string[] = [];
  for (let i = 0; i < nf; i++) {
    o.push(`function f${i}(k: i32): i32 {`, "  let t = k");
    for (let j = 0; j < ns; j++) o.push(`  t = t + ${j % 13} * k - ${j % 7}`);
    o.push("  t", "}");
  }
  o.push("let acc = 0");
  for (let i = 0; i < 40; i++) o.push(`acc = acc + f${i}(${i % 5})`);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// N struct types used once each, against N/K used K times each. Distinct FIELD names,
// because two structurally identical shapes intern to one row and the axis would vanish.
const genTypes = (n: number, k: number): string => {
  const m = Math.max(1, Math.floor(n / k));
  const o: string[] = [];
  for (let i = 0; i < m; i++) o.push(`type S${i} = { v${i}: i32 }`);
  o.push("let acc = 0");
  for (let i = 0; i < n; i++) {
    const t = i % m;
    o.push(`let a${i}: S${t} = { v${t}: ${i % 97} }`, `acc = acc + a${i}.v${t}`);
    fill(o, i, 6);
  }
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// The string-keyed union registry's lookup axis: N distinct unions against N/K.
const genUnions = (n: number, k: number): string => {
  const m = Math.max(1, Math.floor(n / k));
  const o: string[] = [];
  for (let i = 0; i < m; i++) {
    o.push(`type A${i} = { p${i}: i32 }`, `type B${i} = { q${i}: string }`, `type U${i} = A${i} | B${i}`);
  }
  o.push("let acc = 0");
  for (let i = 0; i < n; i++) {
    const t = i % m;
    o.push(`let u${i}: U${t} = { p${t}: ${i % 97} }`, `if u${i} is A${t} { acc = acc + u${i}.p${t} }`);
    fill(o, i, 6);
  }
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// The literal-union registry's axis (D2150): N functions typed with an inline string-literal
// set, spread over N distinct sets in the many arm and N/K in the one arm. Each distinct set
// registers a hidden alias, so a lookup that scans the registry is quadratic in the sets.
const genLitSets = (n: number, k: number): string => {
  const m = Math.max(1, Math.floor(n / k));
  const o: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i % m;
    o.push(
      `function f${i}(k: "a${t}" | "b${t}" | "c"): i32 { if k == "c" { return 1 } if k == "a${t}" { return 2 } 3 }`,
      `function g${i}(b: boolean): "a${t}" | "b${t}" | "c" { if b { return "c" } "b${t}" }`,
    );
  }
  o.push("let acc = 0");
  for (let i = 0; i < n; i++) o.push(`acc = acc + f${i}(g${i}(${i % 2 === 0}))`);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// N call sites either way; the many arm spreads them over N callees, the one arm over
// N/K. Both DECLARE N functions, so only the callee distribution differs.
// `n` value-position writes to a wider name, each a binding of its own, at module scope or in
// one function. D2398 moves each ahead of its binding and keys the start function's order.
const genValueWrites = (n: number, inFn: boolean): string => {
  const o: string[] = ["function h(i: i32): i32 { i }", "let a: f64 = 0"];
  if (inFn) o.push("function main() {");
  const pad = inFn ? "  " : "";
  for (let i = 0; i < n; i++) o.push(`${pad}const y${i} = (a = h(${i}))`);
  if (inFn) o.push("}", "main()");
  return o.join("\n") + "\n";
};

// `if` branches and `match` arms: empty ones and a labelled block, which are blocks, and ones
// whose braces are an object literal, which are the arm's value (D3276).
const genArmBodies = (n: number): string => {
  const o: string[] = ["let t = 0"];
  for (let i = 0; i < n; i++) {
    o.push(`function f${i}(c: boolean) {`, "  if c {} else { t = t + 1 }", "  match t { 1 => {} _ => {} }");
    o.push("  if c { @L { t } } else { t = t + 2 }");
    o.push("  const o = if c { a: t } else { a: t + 2 }", "  t = t + o.a", "}");
  }
  o.push("f0(false)", "print(t)");
  return o.join("\n") + "\n";
};

const genCallSites = (n: number, k: number): string => {
  const m = Math.max(1, Math.floor(n / k));
  const o: string[] = [];
  for (let i = 0; i < n; i++) o.push(`function g${i}(x: i32): i32 { x + ${i % 13} }`);
  o.push("let acc = 0");
  for (let i = 0; i < n; i++) {
    o.push(`acc = acc + g${i % m}(${i % 5})`);
    fill(o, i, 6);
  }
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// EXPORTS: N functions in the entry file, every one `export`-marked, against N/K of them. Both
// arms declare and call the same N functions; only the size of the export table differs.
const genExports = (n: number, k: number): string => {
  const o: string[] = [];
  for (let i = 0; i < n; i++) {
    const ex = i % k === 0 ? "export " : "";
    o.push(`${ex}function f${i}(x: i32): i32 { if x > ${i} { x * ${i} + f${i > 0 ? i - 1 : 0}(x - 1) } else { x + ${i} } }`);
  }
  return o.join("\n") + "\n";
};

// CALLBACK SLOTS: N higher-order functions each taking a callback, against N/K taking the
// same N callbacks over K call sites each. Both arms declare N callbacks and place N call
// sites; only the number of function-TYPED PARAMETER SLOTS differs, and that is the entity
// the `??`-merge family's resolvers are asked about once each (`anonLeafCloSlotMark`).
const genCallbacks = (n: number, k: number): string => {
  const m = Math.max(1, Math.floor(n / k));
  const o: string[] = [];
  for (let i = 0; i < n; i++) o.push(`function cb${i}(x: i32): i32 { x + ${i % 13} }`);
  for (let i = 0; i < m; i++) {
    o.push(`function hof${i}(fn${i}: (i32) => i32, x: i32): i32 { fn${i}(x) + ${i % 7} }`);
  }
  o.push("let acc = 0");
  for (let i = 0; i < n; i++) {
    o.push(`acc = acc + hof${i % m}(cb${i}, ${i % 5})`);
    fill(o, i, 6);
  }
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// GETTER CALLEES: N getters each calling a helper that calls a second helper, against the
// same N getters calling N/K such chains. Both arms declare the same 2N helpers and read every
// getter once; only how many distinct callee chains the getter check summarises differs, which
// is the entity the per-function summary (D2135) is computed for, once each.
const genGetterCallees = (n: number, k: number): string => {
  const m = Math.max(1, Math.floor(n / k));
  const o: string[] = ["type V = new { n: i32 }"];
  for (let i = 0; i < n; i++) {
    o.push(`function k${i}(x: i32): i32 { x * ${(i % 5) + 2} }`);
    o.push(`function h${i}(x: i32): i32 { if x > ${i % 11} { k${i}(x) } else { x + 1 } }`);
  }
  for (let i = 0; i < n; i++) o.push(`get g${i}(self: V): i32 { h${i % m}(self.n) }`);
  o.push("const v: V = { n: 3 }", "let acc = 0");
  for (let i = 0; i < n; i++) o.push(`acc = acc + v.g${i}`);
  // Keeps every helper reached, so neither arm drops declarations the other emits.
  for (let i = 0; i < n; i++) o.push(`acc = acc + h${i}(${i % 5})`);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

const genClosures = (n: number, k: number): string => {
  const m = Math.max(1, Math.floor(n / k));
  const o: string[] = [];
  for (let i = 0; i < m; i++) o.push(`const c${i} = (x: i32) => x + ${i % 13}`);
  o.push("let acc = 0");
  for (let i = 0; i < n; i++) {
    o.push(`acc = acc + c${i % m}(${i % 5})`);
    fill(o, i, 6);
  }
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// GENERIC PINS against hand-written monomorphic twins. Both arms declare N types, bind N
// values and emit N one-expression functions — the many arm as N instantiations of one
// generic, the one arm as N ordinary functions — so the emitted function count matches
// and the only difference is that one side went through the monomorphizer.
const genPins = (n: number, many: boolean): string => {
  const o: string[] = many ? ["function idg<T>(x: T): T x"] : [];
  for (let i = 0; i < n; i++) o.push(`type P${i} = { w${i}: i32 }`);
  if (!many) for (let i = 0; i < n; i++) o.push(`function idm${i}(x: P${i}): P${i} x`);
  o.push("let acc = 0");
  for (let i = 0; i < n; i++) {
    o.push(`let p${i}: P${i} = { w${i}: ${i % 97} }`);
    o.push(`acc = acc + ${many ? "idg" : `idm${i}`}(p${i}).w${i}`);
    fill(o, i, 30);
  }
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// COVARIANT BINDINGS: N delivery functions either way, `cov` of them binding a covariant
// list handle (`const b: Shape[] = a`) and the rest binding the same list at its own type.
// The alias-closure answer is memoised per (root name, frame), so only the covariant ones
// are a query, and the index behind them is what keeps a query off the whole arena (D1657).
const genCovar = (n: number, cov: number): string => {
  const o: string[] = [
    "type Circle = { r: i32 }",
    "type Sq = { s: i32 }",
    "type Shape = Circle | Sq",
    "type Box = { xs: readonly Shape[] }",
    "type CBox = { xs: Circle[] }",
    // the unrelated write that makes the analysis run at all (`cwProgramHasWrite`)
    "function other() {",
    "  const w: Shape[] = []",
    "  w.push({ s: 3 })",
    "  print(w.length)",
    "}",
  ];
  for (let i = 0; i < n; i++) {
    const wide = i < cov;
    o.push(
      `function d${i}() {`,
      `  const a${i}: Circle[] = [{ r: 7 }]`,
      `  const b${i}: ${wide ? "readonly Shape" : "Circle"}[] = a${i}`,
      `  const s${i}: ${wide ? "Box" : "CBox"} = { xs: b${i} }`,
      `  print(s${i}.xs.length)`,
      "}",
    );
  }
  o.push("let acc = 0");
  for (let i = 0; i < n; i++) fill(o, i, 6);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// MODULES: `mods` files of `per` functions each, every function `body` statements long,
// all of them imported and called by one main. Holding `mods * per` fixed makes the two
// arms the same program cut into a different number of files — they emit the same bytes.
const writeModules = (dir: string, mods: number, per: number, body: number): string => {
  Deno.mkdirSync(dir, { recursive: true });
  for (let j = 0; j < mods; j++) {
    const o: string[] = [];
    for (let t = 0; t < per; t++) {
      const i = j * per + t;
      o.push(`export function h${i}(x: i32): i32 {`, "  let v = x");
      for (let s = 0; s < body; s++) o.push(`  v = v + ${(i + s) % 13} * x - ${s % 7}`);
      o.push("  v", "}");
    }
    Deno.writeTextFileSync(`${dir}/mod${j}.vl`, o.join("\n") + "\n");
  }
  const main: string[] = [];
  for (let j = 0; j < mods; j++) {
    const names: string[] = [];
    for (let t = 0; t < per; t++) names.push(`h${j * per + t}`);
    main.push(`import { ${names.join(", ")} } from "./mod${j}"`);
  }
  main.push("let acc = 0");
  for (let i = 0; i < mods * per; i++) main.push(`acc = acc + h${i}(${i % 5})`);
  main.push("print(acc)");
  Deno.writeTextFileSync(`${dir}/main.vl`, main.join("\n") + "\n");
  return `${dir}/main.vl`;
};

// D2914's pair: `nl` un-annotated lists of object literals, each adopted `per` times by a
// declared record list, beside an annotated record of the same field names, so every list takes
// the destination's record as its type (D3339) and its reads are checked at it.
const genAdoptedLists = (nl: number, per: number): string => {
  const o = ["const i: { f: i32 } = { f: 4 }", "type I = { f: i64 | null }"];
  for (let k = 0; k < nl; k++) {
    o.push(`const il${k} = [{ f: ${k % 13} }]`);
    for (let j = 0; j < per; j++) {
      o.push(`const ic${k}_${j}: I[] = il${k}`, `print((il${k}[0].f ?? 0) + ${j % 7})`);
    }
  }
  o.push("print(i.f)");
  return o.join("\n") + "\n";
};

// The same-name twin: `nf` functions, each binding its own `il` and adopting it, so a use check
// that walked every identifier of the name program-wide would read each function's lists.
const genAdoptedListsFn = (nf: number): string => {
  const o = ["const i: { f: i32 } = { f: 4 }", "type I = { f: i64 | null }"];
  for (let k = 0; k < nf; k++) {
    o.push(`function h${k}(): i32 {`, `  const il = [{ f: ${k % 13} }]`, "  const ic: I[] = il");
    o.push("  if (il[0].f ?? 0) > 5 { ic.length + 1 } else { ic.length }", "}");
  }
  o.push("let acc = 0");
  for (let k = 0; k < nf; k++) o.push(`acc = acc + h${k}()`);
  o.push("print(acc)", "print(i.f)");
  return o.join("\n") + "\n";
};

// D2933's same-name twin: `nf` functions, each binding its own record literal `r` and handing an
// alias of it to a declared record of the same field names, so each literal is re-seated.
const genReseatedRecordsFn = (nf: number): string => {
  const o = ["type J = { f: i32 | null }", "type I = { f: i32 }", "function use(j: J): i32 { j.f ?? 0 }"];
  for (let k = 0; k < nf; k++) {
    o.push(`function h${k}(): i32 {`, `  const r = { f: ${k % 13} }`, "  const q = r", "  use(q) + r.f", "}");
  }
  o.push("let acc = 0");
  for (let k = 0; k < nf; k++) o.push(`acc = acc + h${k}()`);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// D2922's DEPTH twin: a chain of `k` un-annotated functions, each returning the previous one's
// call from three `return`s, over a record literal a declared record of its field names could
// re-seat, so a use walk that followed each call once per path would read 3^k calls.
const genReturnChain = (k: number): string => {
  const o = ["type J = { f: i32 | null }", "type I = { f: i32 }", "const r = { f: 7 }", "function g0(n: i32) { return r }"];
  for (let i = 1; i <= k; i++) {
    o.push(`function g${i}(n: i32) {`, `  if n > 2 { return g${i - 1}(n - 1) }`);
    o.push(`  if n > 1 { return g${i - 1}(n - 2) }`, `  return g${i - 1}(n)`, "}");
  }
  o.push(`print(g${k}(3).f)`);
  return o.join("\n") + "\n";
};

// ── the runner ───────────────────────────────────────────────────────────────

// A COMPILE PAIR IS GRADED ON GUEST FUEL. `$VL_FUEL=1` makes the host meter the compiler in
// wasmtime fuel, about one unit per guest instruction: a count, identical on every run of the
// same seed over the same source however busy the box is. A CPU ratio is not that — the two
// arms run at different moments and a burst inflates one alone, so one axis read 2.1 - 2.75
// against a 2.5 bar across gate runs while its fuel ratio was 2.705 every time. A fuel ratio
// needs no retry round and no floor, and its two arms can run at once.
//
// A RUNTIME pair (the string-append axes, the control) is graded on the child's CPU, because
// fuel meters only the compiler: that cost lands in the emitted program, which runs unmetered.
type Cost = { wall: number; cpu: number; fuel: number };

// `times`' SECOND line is the shell's reaped children — this spawn's `vl` and nothing
// else, the shell's own cost being the first line. A POSIX builtin, so this needs no
// `/usr/bin/time` on the box; `gate.sh` reads its own rows' CPU the same way.
const childCpu = (out: string): number => {
  const rows = out.trimEnd().split("\n").filter((l) => /\dm[\d.]+s/.test(l));
  let s = 0;
  for (const m of (rows[rows.length - 1] ?? "").matchAll(/(\d+)m([\d.]+)s/g)) {
    s += Number(m[1]) * 60 + Number(m[2]);
  }
  return s;
};

const spawn = async (what: string, argv: string[], fuel: boolean): Promise<Cost> => {
  const t0 = Date.now();
  const env: Record<string, string> = { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` };
  if (fuel) env.VL_FUEL = "1";
  const { code, stdout, stderr } = await new Deno.Command("/bin/sh", {
    args: ["-c", '"$@"; rc=$?; times; exit $rc', "sh", VL, ...argv],
    stdout: "piped",
    stderr: "piped",
    env,
  }).output();
  const wall = (Date.now() - t0) / 1000;
  const err = new TextDecoder().decode(stderr);
  if (code !== 0) throw new Error(`vl ${what} failed: ${err.slice(0, 400)}`);
  const m = err.match(/^\[fuel\] guest: (\d+)$/m);
  if (fuel && !m) {
    throw new Error(`vl ${what} printed no \`[fuel]\` line: this host predates $VL_FUEL; rebuild scripts/vl-host`);
  }
  return { wall, cpu: childCpu(new TextDecoder().decode(stdout)), fuel: m ? Number(m[1]) : 0 };
};

const build = (src: string, out: string): Promise<Cost> =>
  spawn(`build on ${src}`, ["build", src, "-o", out, "--compiler", COMPILER], true);

// The floor on a RUNTIME pair's denominator keeps one spike on a sub-second arm from
// dominating the quotient. A fuel pair has none: no spike can land on a count.
const RUN_FLOOR = 0.05;
const VERBOSE = Deno.env.get("VL_SCALING_VERBOSE") === "1";

const fail = (axis: string, bar: number, note: string, reading: string, why: string): never => {
  throw new Error(
    `${axis}: the many-entity arm cost ${reading} for the same work reshaped (bar ${bar}) — ` +
      `something is being re-derived per ${axis} entity. ${note} Profile it with ` +
      `docs/internals/profiling-the-compiler.md and bank the answer. ${why}`,
  );
};

// A compile pair: both arms at once, graded on the ratio of their guest fuel.
const gradeFuel = async (
  axis: string,
  bar: number,
  note: string,
  many: () => Promise<Cost>,
  one: () => Promise<Cost>,
): Promise<number> => {
  const [m, o] = await Promise.all([many(), one()]);
  if (!(m.fuel > 0 && o.fuel > 0)) throw new Error(`${axis}: an arm read no fuel (${m.fuel}, ${o.fuel})`);
  const ratio = m.fuel / o.fuel;
  const reading = `${m.fuel.toExponential(3)} fuel against ${o.fuel.toExponential(3)} ` +
    `(ratio ${ratio.toFixed(3)}; ${m.cpu.toFixed(2)}s / ${o.cpu.toFixed(2)}s cpu)`;
  if (VERBOSE) console.log(`[scaling] ${axis}: ${reading} bar ${bar}`);
  if (ratio > bar) {
    fail(axis, bar, note, reading, "(The ratio is of guest fuel, a count, so box load cannot move it.)");
  }
  return ratio;
};

// A runtime pair, on CPU. A suspicious ratio buys one more INTERLEAVED round — many, one,
// many, one — and takes the per-side minimum, so a burst that hits one arm is dropped
// rather than being divided by an arm it missed. A spike does not repeat, a quadratic does.
const grade = async (
  axis: string,
  bar: number,
  note: string,
  many: () => Promise<Cost>,
  one: () => Promise<Cost>,
  floor: number,
): Promise<void> => {
  const ms = [await many()], os = [await one()];
  const least = (xs: Cost[], f: (c: Cost) => number) => Math.min(...xs.map(f));
  const ratio = () => least(ms, (c) => c.cpu) / Math.max(least(os, (c) => c.cpu), floor);
  if (ratio() > bar) {
    ms.push(await many());
    os.push(await one());
  }
  const say = (xs: Cost[]) =>
    `${least(xs, (c) => c.cpu).toFixed(2)}s cpu (${least(xs, (c) => c.wall).toFixed(2)}s wall)`;
  const reading = `${say(ms)} against ${say(os)} (ratio ${ratio().toFixed(2)})`;
  if (VERBOSE) console.log(`[scaling] ${axis}: ${reading} bar ${bar}`);
  if (ratio() > bar) {
    fail(
      axis,
      bar,
      note,
      reading,
      "(The ratio is of CPU, which cancels a uniform slowdown but NOT a burst that lands on " +
        "one arm; it read over the bar in two interleaved rounds, which a burst rarely does twice. " +
        "Wall far above cpu means only that the run was starved.)",
    );
  }
};

const gradePair = async (
  axis: string,
  bar: number,
  note: string,
  mk: (dir: string) => Promise<[string, string]> | [string, string],
): Promise<number> => {
  const dir = await Deno.makeTempDir({ prefix: `vl_scale_${axis}_` });
  try {
    const [manySrc, oneSrc] = await mk(dir);
    return await gradeFuel(
      axis,
      bar,
      note,
      () => build(manySrc, `${dir}/many.wasm`),
      () => build(oneSrc, `${dir}/one.wasm`),
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const twoFiles = (dir: string, many: string, one: string): [string, string] => {
  Deno.writeTextFileSync(`${dir}/many.vl`, many);
  Deno.writeTextFileSync(`${dir}/one.vl`, one);
  return [`${dir}/many.vl`, `${dir}/one.vl`];
};

const axis = (name: string, bar: number, note: string, mk: (d: string) => [string, string]) =>
  Deno.test({
    name: `scaling shape: ${name}`,
    ignore: !ENABLED,
    fn: async () => {
      await gradePair(name, bar, note, mk);
    },
  });

// Measured 2026-09-03, box load 3 to 101 — absolute times moved 3x over that range while
// the LINEAR axes' ratios moved under 0.12 (1.02/1.02/1.03, 1.19/1.17/1.18,
// 1.13/1.02/1.01). The super-linear ones move up to 0.76 (2.22/1.77/2.21, 2.47/1.99/2.58,
// 3.61/4.13/4.37), which is the other reason their bars sit well clear of the measurement.
// Each line below is many/one/ratio; `unions` carries its own, re-measured reading.

// 0.75 / 0.74 / 1.02, and 5.39 / 0.93 / 5.81 on the pre-#2419 compiler. The #2419 pair,
// folded in from tests/vl_module_predicate_scan_test.ts: 32,000 statements either way,
// 20x the functions, so a per-function module scan is the only thing that can separate
// the two arms. The worst case for such a scan is a module with NO matching node, because
// then every scan runs to the end — which is the compiler's own source.
axis(
  "functions",
  2.5,
  "Memoise it on an arena prefix the way `moduleHasUnionAs` does (compiler/emit_classify.vl), clearing the memo in `emitProgram`.",
  (d) => twoFiles(d, genFunctions(1600, 20), genFunctions(80, 400)),
);

// D2150's pair: a registry lookup that scans every registered set made the many arm
// quadratic in the sets; the member-set index keeps it linear.
axis("literal-union sets", 2.5, "A literal-union lookup is scanning the union registry.", (d) =>
  twoFiles(d, genLitSets(3000, 1), genLitSets(3000, 20)));

// 1.37 / 1.15 / 1.19.
axis("types", 2.8, "A per-declaration cost is scaling with the type table.", (d) =>
  twoFiles(d, genTypes(2500, 1), genTypes(2500, 20)));

// The pair moved 800 -> 2,400 because at 800 the cheap arm ran 0.16 s under a 0.25 s floor:
// the floor was the denominator, so the reading was an absolute budget and a constant-factor
// regression was invisible. At 2,400 the cheap arm is 0.6 to 1.2 s, 2.4 to 3.2x the floor, so
// the reading is a ratio again — median 1.28 to 1.40 over 44 interleaved rounds spanning load
// 22 to 235, against master's 1.42 to 1.48 beside it. The arms have converged, so the bar is
// the family default (fuel reads 1.88); the pre-#2630 compiler — still carrying the scans
// since taken off this axis — read 4.42 here on CPU.
axis(
  "unions",
  2.5,
  "No frame is above 5% on this axis any more — profile the many arm before naming a cause.",
  (d) => twoFiles(d, genUnions(2400, 1), genUnions(2400, 20)),
);

// D2398's pair: the start function orders each top-level node, and a moved write keyed by a
// list scan made the module-scope arm quadratic (0.96 s at 8,000, 3.82 s at 16,000).
axis(
  "module-scope value writes",
  2.5,
  "The start function's merge (`startStmtOrd`, compiler/emit_sections.vl) is scanning per step.",
  (d) => twoFiles(d, genValueWrites(12000, false), genValueWrites(12000, true)),
);

// D2872's GROWTH pair: the in-function arm at `n` against `n/4`, so linear reads 4 and
// quadratic 16. Fuel reads 4.02; master read 14.97, from a per-name scan of every local in
// scope (`igWalk`) and a list shift per moved write (`asvList`).
axis(
  "in-function value writes",
  5.0,
  "`igWalk`'s shadow lookup (compiler/emit_sections.vl) or `asvList`'s rewrite (compiler/emit_rewrite.vl) is scanning per write.",
  (d) => twoFiles(d, genValueWrites(12000, true), genValueWrites(3000, true)),
);

// D3276's GROWTH pair, 8,000 functions of arm and branch bodies against 2,000, so linear reads 4.
// A per-block scan of the object-looking arms once read 9.5x master at 8,000.
axis(
  "object-looking arm bodies",
  5.0,
  "A per-block or per-function pass is scanning the arm bodies (compiler/parser.vl `parseArmBody`).",
  (d) => twoFiles(d, genArmBodies(8000), genArmBodies(2000)),
);

// D2914's GROWTH pair, 400 re-seated lists against 100, so linear reads 4 and quadratic 16. A
// known super-linear axis: fuel reads 8.42 on master `a41bd80e8`, before the use check existed,
// and 8.33 with it, so the bar is 1.25x that. A check that walked the program once per list
// read 15.4 here.
axis(
  "adopted record lists",
  10.5,
  "A re-seated list's use check (`rsNarrowUseRefuse`, compiler/emit_classify.vl) is walking the program per list.",
  (d) => twoFiles(d, genAdoptedLists(400, 1), genAdoptedLists(100, 1)),
);

// D2914's same-name GROWTH pair: 800 functions each adopting its own `il` against 200, so
// linear reads 4 and quadratic 16. Fuel reads 4.03 on master `e91e04a8f` and with the use check
// alike, so the bar is 1.25x that; the check that walked every `il` in the program read 5.78.
axis(
  "adopted record lists sharing a name",
  5.0,
  "A re-seated list's use check (`rsUsesOf`, compiler/emit_classify.vl) is reading other functions' identifiers.",
  (d) => twoFiles(d, genAdoptedListsFn(800), genAdoptedListsFn(200)),
);

// D2933's same-name GROWTH pair: 800 functions each re-seating its own `r` against 200, so
// linear reads 4 and quadratic 16. Fuel reads 3.94 on master `8615a730d` and with the re-seat
// alike, so the bar is 1.25x that.
axis(
  "re-seated record literals sharing a name",
  5.0,
  "A record literal's re-seat (`objLitBindDestRow`, compiler/emit_classify.vl) is reading other functions' identifiers.",
  (d) => twoFiles(d, genReseatedRecordsFn(800), genReseatedRecordsFn(200)),
);

// D2922's DEPTH pair: a return chain 200 functions deep against 50, so linear reads 4. Fuel reads
// 3.96 on master `8615a730d` and 3.95 with the call walk, so the bar is 1.25x that; a walk with
// no per-query visited set traps the compiler on both arms.
axis(
  "records returned through a deep call chain",
  5.0,
  "A re-seated value's return walk (`rsRetCallUse`, compiler/emit_classify.vl) is re-walking a function's calls per path.",
  (d) => twoFiles(d, genReturnChain(200), genReturnChain(50)),
);

// D3051's DEPTH pair: module const chains 200 deep against 50, each const naming the one
// before it twice, so linear reads 4 and a classifier re-walking a named const's initializer
// reads 2^150. Fuel reads 3.43; master `0b618d160` traps on both arms, and with the f64 and i64
// answers memoised but not the string one it read 6.31.
const genConstChain = (depth: number): string => {
  const o: string[] = [];
  for (const [p, a0] of [["A", "3"], ["F", "3.0"], ["L", "3 as i64"]]) {
    o.push(`const ${p}0 = ${a0}`);
    // The chain holds its value: an exact constant past 64 bits is refused where it is read, and
    // one that grows is computed at its full width, which is not what this axis measures.
    for (let i = 1; i <= depth; i++) o.push(`const ${p}${i} = ${p}${i - 1} * 3 - ${p}${i - 1} * 2`);
  }
  o.push(`function g() { print(A${depth}) print(F${depth}) print(L${depth}) }`, "g()");
  return o.join("\n") + "\n";
};

axis(
  "module const chain depth",
  5.0,
  "A float, i64 or string classifier (`globalReadAsk`, compiler/emit_classify.vl) is re-walking a named global's initializer per mention.",
  (d) => twoFiles(d, genConstChain(200), genConstChain(50)),
);

// 1.09 / 0.97 / 1.13.
axis("call sites", 2.5, "Callee resolution is scaling with the number of callees.", (d) =>
  twoFiles(d, genCallSites(6000, 1), genCallSites(6000, 20)));

// The entry file's export table: deduping the staged names and resolving each one's target
// scanned per export. Fuel reads 1.01; master `4179e4b36` read 4.23 here, and 8x the fuel at
// 20,000 exports.
axis(
  "exports",
  2.5,
  "The export staging (`compileSrc`, compiler/driver.vl) or `emitExportSection`'s tables (compiler/emit_sections.vl) are scanning per export.",
  (d) => twoFiles(d, genExports(8000, 1), genExports(8000, 20)),
);

// Fuel reads 1.07, so the bar is the family default. It read 3.2 while `modIndexOfKey` and
// `modRecomputePending` (compiler/driver.vl) scanned the module table by string compare once
// per commit: a key is an absolute path, so that ratio also grew with the length of $TMPDIR
// (4.15 under an 80-character one). Each function carries 30 statements so the linear half
// is not startup-dominated.
axis("modules", 2.5, "The module merge is scaling with the file count.", (d) => [
  writeModules(`${d}/many`, 400, 2, 30),
  writeModules(`${d}/one`, 200, 4, 30),
]);

// Fuel reads 1.27, so the bar is the family default. `fnStmtsPosOf` (compiler/emit_classify.vl)
// is the scan that once made this axis super-linear: `fnStmts` walked once per closure.
axis("closures", 2.5, "`fnStmtsPosOf` scans `fnStmts` once per closure.", (d) =>
  twoFiles(d, genClosures(3000, 1), genClosures(3000, 20)));

// 2.06 / 1.03 / 1.92, stable over three runs (1.92 / 1.89 / 1.97) and holding at load 57.
// D1514's axis, and the one the whole family was blind to: `anonLeafCloSlotMark` asks
// `anonLeafParamFnTarget` of every callback-typed parameter, that asks `anonLeafParamFnTargetAt`
// of every `Param` sharing the name, and THAT scanned every `Call` in the arena asking
// `anonLeafOneDeclNamed` — itself a whole-arena scan. Cubic in the node count, and the
// compiler's own source has no callback-typed parameter, so `self-compile-time.sh` never saw
// it. On the pre-D1514 compiler this pair is red at a SEVENTH of N: at 40 the many arm does
// not finish in 200 s against 0.037 s for the one arm, where the fixed compiler reads
// 0.035 / 0.029. The residual ~1.9 here is the many arm's extra function declarations.
axis(
  "callback slots",
  2.5,
  "`anonLeafCloSlotMark` / `anonLeafParamFnTargetAt` are scaling with the callback-parameter count (D1514).",
  (d) => twoFiles(d, genCallbacks(300, 1), genCallbacks(300, 20)),
);

// 0.94 – 0.99 idle against master's 2.16 – 2.39, and 0.71 – 1.59 over fourteen more rounds at
// box load 33 to 101 against master's 3.61 – 3.69. With `collectA` resuming on the arena
// prefix the many arm costs what the one arm costs, so the pair stopped moving with load —
// both sides clamp on the same floor. The bar comes off the super-linear ladder to the family
// default, 2.5: 1.6x the worst of nineteen rounds, 8 of 8 green with a fanned-out gate beside
// it, and master red at any load. Still super-linear in N (200/400/800 reads 0.17/0.41/1.18 s
// where master reads 0.28/0.86/3.57), so a bigger pair needs its own bar. `buildFnMap` then
// went 18.6 - 20.4% inclusive -> 0.25 - 1.58% by re-seeding its prefix from a row cache, taking
// the pair to 0.80 - 1.06 against 0.88 - 1.20; both arms clamp on `FLOOR` at 400 pins, so the
// bar STAYS at the family default rather than tracking a number the harness cannot measure.
axis("generic pins", 2.5, "`monoRebuild` re-runs a whole-program pass per minted instance.", (d) =>
  twoFiles(d, genPins(400, true), genPins(400, false)));

// 0.78 / 0.91 / 0.86, against 36.51 / 2.82 / 12.95 on the pre-D1657 compiler — the axis the
// family was blind to. Each covariant binding is one `covarValueWriteState` query, and every
// query walked the whole arena a dozen times over. Both arms declare the same functions and
// lower the same statements; only how many of them WIDEN differs, so the query count is the
// only thing that moves. The many arm is the CHEAPER one here (the widened cells emit less),
// which is why the bar is the family default rather than something above a measurement.
axis(
  "covariant bindings",
  2.5,
  "The `cw*` alias closure is being re-derived per covariant binding rather than read off `cwIxBuild`'s index (D1628/D1657).",
  (d) => twoFiles(d, genCovar(1400, 1400), genCovar(1400, 70)),
);

// NARROWED MODULE BINDINGS read by top-level functions. Both arms declare `n` nullable module
// `let`s, assign each once and declare `n` functions reading one each; only whether the
// functions come after the assignments, and so are checked under their narrowings, differs.
// A per-function pass over every narrowed binding is quadratic in the many arm (D2529).
const genNarrowedGlobals = (n: number, after: boolean): string => {
  const lets: string[] = [];
  const asg: string[] = [];
  const fns: string[] = [];
  for (let i = 0; i < n; i++) {
    lets.push(`let g${i}: i32 | null = null`);
    asg.push(`g${i} = ${i % 13}`);
    fns.push(`function f${i}() { return (g${i} ?? 0) + 1 }`);
  }
  const o = after ? [...lets, ...asg, ...fns] : [...lets, ...fns, ...asg];
  o.push("let acc = 0");
  for (let i = 0; i < n; i++) o.push(`acc = acc + f${i}()`);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

axis(
  "narrowed module bindings",
  2.5,
  "A top-level function is asking about every narrowed module binding, not only the ones it reads (D2529).",
  (d) => twoFiles(d, genNarrowedGlobals(600, true), genNarrowedGlobals(600, false)),
);

// UN-ANNOTATED CALLBACK LAMBDAS. `n` lambdas `(g) => g(out)`, each called once with a
// function, either all in one function over one list or one per function. A list handed to an
// un-annotated parameter used as the callee asks which function each call of the lambda passes
// it (D2748); asked by walking the scope once per lambda, the one-function arm is quadratic.
const genCallbackLambdas = (n: number, oneFn: boolean): string => {
  const o: string[] = [
    "type Circle = { r: i32 }",
    "type Sq = { s: i32 }",
    "type Shape = Circle | Sq",
    "function sum(xs: Shape[]): i32 { xs.length * 3 }",
    "function lenC(xs: Circle[]): i32 { xs.length * 5 }",
    "function main() {",
    "  const sh: Shape[] = [{ r: 1 }]",
    "  print(sum(sh))",
  ];
  if (oneFn) o.push("  const out = [{ r: 3 }]");
  for (let i = 0; i < n; i++) {
    if (oneFn) o.push(`  const ap${i} = (g) => g(out)`, `  print(ap${i}(lenC))`);
  }
  o.push("}", "main()");
  for (let i = 0; i < n && !oneFn; i++) {
    o.push(
      `function f${i}() {`,
      "  const out = [{ r: 3 }]",
      `  const ap${i} = (g) => g(out)`,
      `  print(ap${i}(lenC))`,
      "}",
      `f${i}()`,
    );
  }
  return o.join("\n") + "\n";
};

axis(
  "un-annotated callback lambdas per function",
  2.5,
  "The lambda's calls are being found by a scope walk per lambda rather than off `dslEnsure`'s per-scope index (D2748).",
  (d) => twoFiles(d, genCallbackLambdas(120, true), genCallbackLambdas(120, false)),
);

// CAPTURED NARROWED LOCALS. One function narrows `n` nullable locals by assignment and makes a
// closure after each; in the many arm each closure captures its own local, in the other every
// closure captures the first. Both arms make the same closures in one frame, so the emitter's
// per-frame cost cancels and only the per-name capture question moves: a walk of the frame per
// captured name is quadratic in the many arm (D2529).
const genNarrowedCaptures = (n: number, distinct: boolean): string => {
  const o: string[] = ["let acc = 0", "function m() {"];
  for (let i = 0; i < n; i++) {
    o.push(`  let g${i}: i32 | null = null`, `  g${i} = ${i % 13}`);
    o.push(`  const h${i} = () => (g${distinct ? i : 0} ?? 0) + 1`, `  acc = acc + h${i}()`);
  }
  o.push("}", "m()", "print(acc)");
  return o.join("\n") + "\n";
};

axis(
  "captured narrowed locals",
  2.5,
  "A closure is re-walking its frame per captured name (D2529).",
  (d) => twoFiles(d, genNarrowedCaptures(400, true), genNarrowedCaptures(400, false)),
);

// `n` calls handing one record to a function that reads a parameter field `n` times. `wide`
// declares the parameter with a field wider than the record's, so every call is a covariant
// delivery whose write analysis walks the parameter's uses; the other arm delivers the record at
// its own type. Without a memo per (parameter, widened slots) the wide arm is calls x uses (D2060).
const genRecordCovar = (n: number, wide: boolean, recursive = false, filler = 4): string => {
  const o = [
    `type P = { x: ${wide ? "i32 | string" : "i32"}, n: i32 }`,
    `function g(p: P${recursive ? ", k: i32" : ""}): i32 {`,
    "  let s = 0",
  ];
  for (let i = 0; i < n; i++) o.push("  s = s + p.n");
  if (recursive) o.push("  if k > 0 { s = s + g(p, k - 1) }");
  o.push("  s", "}", "let acc = 0", "function main() {", "  const q = { x: 1, n: 1 }", "  let t = 0");
  for (let i = 0; i < n; i++) {
    o.push(recursive ? "  t = t + g(q, 1)" : "  t = t + g(q)");
    fill(o, i, filler);
  }
  o.push("  print(t)", "}", "main()", "print(acc)");
  return o.join("\n") + "\n";
};

// Both arms hand the same record to the same body the same number of times; only whether the
// field widens differs, so the delivery analysis is the only thing that moves.
axis(
  "covariant record deliveries",
  2.5,
  "The D2060 record write analysis is re-walking the parameter's uses per delivery instead of reading `rcwMemo`.",
  (d) => twoFiles(d, genRecordCovar(3500, true), genRecordCovar(3500, false)),
);

// The same pair through a callee that calls itself: the recursion cuts a cycle under every
// delivery's first question, and an answer computed under a cut must still be banked at the
// outermost question, or each delivery re-walks the uses (D2060).
axis(
  "covariant record deliveries to a recursive callee",
  2.5,
  "The D2060 memo is declining to bank a cut answer at the outermost open question (`rcwMemoPut`).",
  (d) => twoFiles(d, genRecordCovar(5000, true, true, 0), genRecordCovar(5000, false, true, 0)),
);

// One function of `n` sibling blocks, each binding five temps and folding them into `acc` —
// the shape a machine-code translator emits, one block per instruction. `temps` picks how
// the temps are bound: `same` redeclares the same names in every block, `unique` gives each
// block its own, and `hoisted` declares them once at function scope and assigns them. The
// fifth temp alternates `f64` and `i32`, so same-named slots of two reps interleave.
const genSiblingBlocks = (n: number, temps: "same" | "unique" | "hoisted"): string => {
  const o = ["let g = 3", "function f(a: i32): i32 {", "  let acc = 0"];
  if (temps === "hoisted") {
    o.push("  let m = 0", "  let x = 0", "  let y = 0", "  let r = 0", "  let vf = 0.0", "  let vi = 0");
  }
  for (let i = 0; i < n; i++) {
    const s = temps === "unique" ? `_${i}` : "";
    const d = temps === "hoisted" ? "" : "const ";
    const v = temps === "hoisted" ? (i % 2 ? "vf" : "vi") : `v${s}`;
    o.push(
      `  { ${d}m${s} = a + g + ${i}; ${d}x${s} = m${s} * 3; ${d}y${s} = x${s} - acc; ` +
        `${d}r${s} = y${s} ^ m${s}; acc = acc + r${s}; ${d}${v} = ${i % 2 ? "1.5" : i}; print(${v}) }`,
    );
  }
  o.push("  acc", "}", "print(f(7))");
  return o.join("\n") + "\n";
};

// 0.69 / 0.59 / 1.17 at 2,500 blocks. Master is cubic here: on the four-temp shape it read
// 44 s at 250 blocks and ran past 300 s at 500, where the hoisted arm read 0.06 s (D2090).
// Every same-named slot made the scope-less detection sweep run once more, and each lookup
// scanned the frame; without the sweep dedupe the interleaved f64/i32 temp is quadratic alone.
axis(
  "sibling blocks redeclaring locals",
  2.5,
  "`dupScanRun` is sweeping once per same-named slot, or `declaredSlotOf` is scanning the frame (D2090).",
  (d) => twoFiles(d, genSiblingBlocks(2500, "same"), genSiblingBlocks(2500, "hoisted")),
);

// 0.63 / 0.65 / 0.97 at 2,500 blocks, against master's 168 s / 0.59 s at 4,000: a frame of
// distinct locals, each read resolved by a linear scan of the frame and of `capScan`'s bound
// list (D2090).
axis(
  "locals per function",
  2.5,
  "A per-read lookup is scanning every local of the frame — `declaredSlotOf`, `capIsBound` (D2090).",
  (d) => twoFiles(d, genSiblingBlocks(2500, "unique"), genSiblingBlocks(2500, "hoisted")),
);

// `genSiblingBlocks` with five temps whose reps alternate on their OWN periods (2, 3, 5, 7,
// 11 blocks), as a translator's `const m = 5` beside `const m = rax + 8` does. The tuple of
// classes the five names resolve to at a slot position then repeats only every 2,310 blocks.
const genSiblingReps = (n: number, temps: "same" | "hoisted"): string => {
  const periods = [2, 3, 5, 7, 11];
  const o = ["function f(a: i32): i32 {", "  let acc = 0"];
  if (temps === "hoisted") {
    for (let j = 0; j < periods.length; j++) o.push(`  let t${j}f = 0.0`, `  let t${j}i = 0`);
  }
  for (let i = 0; i < n; i++) {
    const parts: string[] = [];
    for (let j = 0; j < periods.length; j++) {
      const isF = i % periods[j] === 0;
      const name = temps === "same" ? `t${j}` : `t${j}${isF ? "f" : "i"}`;
      const d = temps === "same" ? "const " : "";
      parts.push(`${d}${name} = ${isF ? "1.5" : `a + ${i % 97}`}`);
      parts.push(isF ? `print(${name})` : `acc = acc + ${name}`);
    }
    o.push(`  { ${parts.join("; ")} }`);
  }
  o.push("  acc", "}", "print(f(7))");
  return o.join("\n") + "\n";
};

// The sweep dedupe above keys on the whole tuple, so here it re-swept the body once per
// distinct tuple: 2,310 sweeps of a 2,500-block body. Sweeping each name's rep classes
// instead of its slot positions takes two (D2309).
axis(
  "same-named locals of several reps",
  2.5,
  "`dupScanRun` is sweeping once per slot position or class tuple rather than per class (D2309).",
  (d) => twoFiles(d, genSiblingReps(2500, "same"), genSiblingReps(2500, "hoisted")),
);

// A value-union declared once, then `n` top-level statements (so `startStmts` holds `n`
// entries in the many arm, one wrapping bare block in the one arm), plus `n` reads of the
// union-returning function `g` bound to a local INSIDE `h` — a name `startBlockLetOfAt`'s
// fallback never finds at start scope. D2326: `startBlockLetRowOfAt` rebuilt
// `parentLetOfAt`'s whole per-function plan once per top-level statement, on every such
// miss, instead of gating the search on the cheap memoized "bound nowhere" answer first.
const genTopStmtsUnionMiss = (n: number, many: boolean): string => {
  const o = ["type U = i32 | string", "function g(x: i32): U {", "  if x % 2 == 0 { return x }", '  "s"', "}"];
  if (many) {
    for (let i = 0; i < n; i++) o.push(`print(${i})`);
  } else {
    const inner: string[] = [];
    for (let i = 0; i < n; i++) inner.push(`print(${i})`);
    o.push(`{ ${inner.join("; ")} }`);
  }
  o.push("function h(): i32 {", "  let t = 0");
  for (let i = 0; i < n; i++) {
    o.push(`  const f${i} = g`, `  const r${i} = f${i}(${i})`, `  if r${i} is i32 { t = t + r${i} }`);
  }
  o.push("  t", "}", "print(h())");
  return o.join("\n") + "\n";
};

axis(
  "top-level statements before a union-name miss",
  2.5,
  "`startBlockLetRowOfAt` is rebuilding `parentLetOfAt`'s plan once per top-level statement on every miss (D2326).",
  (d) => twoFiles(d, genTopStmtsUnionMiss(3000, true), genTopStmtsUnionMiss(3000, false)),
);

// `n` sibling blocks each shadowing `v`, all closed, then `n` reads of the OUTER `v` — the
// many arm's duplicate chain for `v` has length `n`; the one arm's has length 1. A declared
// union type is load-bearing here, not scenery: `uDeclared` gates whether an ordinary read
// re-enters `parentLetOfAt` through the union ladder at all, and only THAT path calls
// `plBestDupAt`; the same shape with no union in the program never reaches it. Because the
// shadows are SIBLINGS, every one closes before the next opens, so a fixed answer of "no
// enclosing declaration" should make the search past the first miss O(1). D2326:
// `plBestDupAt`'s walk past a binary-search miss stepped to the previous SIBLING instead of
// jumping via `plSortedSkip` to the nearest ENCLOSING one, re-walking the whole closed chain
// on every one of the `n` reads.
const genManyClosedSiblingReads = (n: number, many: boolean): string => {
  const o = ["type U = i32 | string", "function h(): i32 {", "  let t = 0", "  let v = 1"];
  const shadows = many ? n : 1;
  for (let i = 0; i < shadows; i++) o.push(`  { const v = ${i}`, `    t = t + v }`);
  for (let i = 0; i < n; i++) o.push("  t = t + v");
  o.push("  t", "}", "print(h())");
  return o.join("\n") + "\n";
};

axis(
  "reads after many closed sibling shadows",
  3.4,
  "`plBestDupAt` is stepping past every closed sibling instead of jumping via `plSortedSkip` (D2326).",
  (d) => twoFiles(d, genManyClosedSiblingReads(12000, true), genManyClosedSiblingReads(12000, false)),
);

// `n` top-level `if true` blocks, each declaring `const u` and a closure reading it — the
// SAME shape as the axis above, but a rewrite gives each block's `u` a unique spelling
// (`u`, `u$s1`, …) once it is captured, so `startBlockLetRowOfSid` is asked about `n` DISTINCT
// sids rather than one. Its own per-sid scan of every start statement made that O(n) per sid,
// O(n²) overall — the query-side fix above does not touch this, since each sid is asked once
// (D2326). A GROWTH pair — `n` blocks against `n/4` — because a one-block arm is an empty
// compile, and a ratio against it is a budget. Linear reads 4 and quadratic 16; today it reads
// 7.14, and with `startBlockLetRowOfSid`'s memo disabled 15.3.
const genManyCapturedSiblingBlocks = (n: number, many: boolean): string => {
  const o = ["type U = i32 | string", "function g(x: i32): U {", "  if x % 2 == 0 { return x }", '  "s"', "}"];
  const blocks = many ? n : 1;
  for (let i = 0; i < blocks; i++) {
    o.push(
      "if true {",
      `  const u: U = g(${i})`,
      "  const k = () => {",
      "    if u is i32 { return u }",
      "    0",
      "  }",
      "  k()",
      "}",
    );
  }
  o.push("print(1)");
  return o.join("\n") + "\n";
};

axis(
  "many distinct captured sibling blocks",
  8.9,
  "`startBlockLetRowOfSid` re-scans every start statement per DISTINCT sid (D2326).",
  (d) => twoFiles(d, genManyCapturedSiblingBlocks(3000, true), genManyCapturedSiblingBlocks(750, true)),
);

// `n` loops walking one name, each binding a copy of its loop variable that a closure
// captures. A capture's binding and its enclosing loop are found by position among every loop
// of that name in the frame, so a per-capture walk over all of them is O(n) per capture and
// O(n²) overall; round 2 of #3281 was that, and trapped the compiler at n = 300 (D3139). A
// GROWTH pair, `n` loops against `n/4`: linear reads 4 and quadratic 16. It reads 4.9, as
// master before the positional lookup did, and 15.1 on the regressed compiler.
const genLoopCaptures = (n: number): string => {
  const o = ["function run(xs: i32[]) {"];
  for (let i = 0; i < n; i++) {
    o.push("  for q in xs {", "    const c = q", "    const f = () => c", "    print(f())", "  }");
  }
  o.push("}", "run([1])");
  return o.join("\n") + "\n";
};

axis(
  "loops each capturing a copy of one loop variable",
  6.2,
  "A capture is resolving its loop or binding by scanning every loop of its name (D3139).",
  (d) => twoFiles(d, genLoopCaptures(200), genLoopCaptures(50)),
);

// `n` closures made under a narrowing of the module global `g`, each called by name. With a
// top-level function writing `g`, every closure is asked whether it escapes its body and every
// call whether it reads a narrowing a writer may have ended; without it neither is asked. Both
// walks are once per body, not per closure (D2402). A closure-written LOCAL would price the
// emitter's cell captures instead, which is not this axis.
const genCapturedNarrowings = (n: number, writer: boolean): string => {
  const o = ['let g: string | null = "ab"'];
  if (writer) o.push("function setG() { g = null }");
  o.push("function f(): i32 {", "  let t = 0", "  if g != null {");
  for (let i = 0; i < n; i++) o.push(`    const c${i} = (): i32 => g.length`, `    t = t + c${i}()`);
  o.push("  }", "  t", "}", "print(f())");
  return o.join("\n") + "\n";
};

// The bar sits under the others' because the cheap arm is itself super-linear in closures
// elsewhere, which compresses the ratio: the per-closure walk this guards read 2.2 here.
axis(
  "closures under a narrowing some function may end",
  1.8,
  "A closure made under a narrowing re-walks its enclosing body, or a call scans every capture record (D2402).",
  (d) => twoFiles(d, genCapturedNarrowings(1600, true), genCapturedNarrowings(1600, false)),
);

// One `match` of `n` arms, each reading the module global `k`, written as a closure's body or
// as a top-level function's. Every arm's read asks whether `k` is a capture of the frame, which
// a top-level function answers without a walk. Both arms share `fill` statements so the cheap
// arm clears `FLOOR` and the reading stays a ratio.
const genLongBody = (n: number, closure: boolean): string => {
  const o = ["const k = 1000"];
  o.push(closure ? "const g = (y: i32) => match y {" : "function g(y: i32): i32 {\n  match y {");
  for (let i = 0; i < n; i++) o.push(`  ${i} => k + ${i % 97}`);
  o.push("  _ => -1", "}");
  if (!closure) o.push("}");
  o.push("let acc = 0");
  for (let i = 0; i < 2400; i++) fill(o, i, 6);
  o.push("print(acc + g(3))");
  return o.join("\n") + "\n";
};

// 0.59 / 0.54 / 1.09 at 1,500 arms, against master's 38.73 / 0.46 / 84.20: every read of `k`
// re-walked the whole closure body to learn its capture set until `captureNamesOf` kept the
// walk for the pass (D2017). The fill is shared and reads no global set from `g`, which would
// price a different per-read walk (D2130).
axis(
  "closure body length",
  2.5,
  "A closure's capture set is being re-walked per read inside its own body (D2017).",
  (d) => twoFiles(d, genLongBody(1500, true), genLongBody(1500, false)),
);

// `n` sibling blocks, each calling a top-level function inside a binary, written as one
// function or spread over `fns`. Each bare block is rewritten to an `if` (a mint, which drops
// the capture memo), and each call asks whether its callee is a captured loop variable.
const genCallBlocks = (n: number, fns: number): string => {
  const per = Math.floor(n / fns);
  const o = ["let g = 3", "function h(x: i32): i32 { x * 2 + g }"];
  for (let f = 0; f < fns; f++) {
    o.push(`function f${f}(a: i32): i32 {`, "  let acc = 0");
    for (let i = 0; i < per; i++) o.push(`  { const m = h(a + ${i}) + g; acc = acc + m }`);
    o.push("  acc", "}");
  }
  o.push("let acc = 0");
  for (let i = 0; i < 2400; i++) fill(o, i, 6);
  for (let f = 0; f < fns; f++) o.push(`acc = acc + f${f}(${f % 7})`);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// Every call site in the one-function arm walked that whole function for its capture set,
// because the loop-variable rung asked the capture set before asking whether any enclosing
// frame binds the name as a loop variable (D2180, plumb PL-019).
axis(
  "call sites per function",
  2.5,
  "A per-call-site question is walking the whole enclosing function — `loopVarCloSigKey`'s capture test (D2180).",
  (d) => twoFiles(d, genCallBlocks(2500, 1), genCallBlocks(2500, 50)),
);

// `n` distinct locals bound at function scope, so all of them are live on the scope stack at
// once, written as one function or spread over `fns`.
const genFrameLocals = (n: number, fns: number): string => {
  const per = Math.floor(n / fns);
  const o = ["let g = 3"];
  for (let f = 0; f < fns; f++) {
    o.push(`function f${f}(a: i32): i32 {`, "  let acc = 0");
    for (let i = 0; i < per; i++) o.push(`  const m${i} = a + ${i}`, `  acc = acc + m${i} * g`);
    o.push("  acc", "}");
  }
  o.push("let acc = 0");
  for (let i = 0; i < 2400; i++) fill(o, i, 6);
  for (let f = 0; f < fns; f++) o.push(`acc = acc + f${f}(${f % 7})`);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

// Every read resolved its slot by scanning the live scope stack, which holds every local of
// the frame once they are all bound at function scope (D2181).
axis(
  "live locals in one scope",
  2.5,
  "`scopeSlotOf` is scanning the live scope stack instead of reading its name index (D2181).",
  (d) => twoFiles(d, genFrameLocals(2500, 1), genFrameLocals(2500, 50)),
);

// N levels of blocks, labelled loops and `if`s, nested in one arm and side by side in the
// other: the same statements, only the depth differs.
const genNesting = (n: number, nested: boolean): string => {
  const open: string[] = [];
  const close: string[] = [];
  for (let k = 0; k < n; k++) {
    const kind = k % 3;
    open.push(
      kind === 0
        ? "{ const m = acc + 1; acc = m; "
        : kind === 1
        ? `@L${k} while true { acc = acc + 1; `
        : "if a > 0 { acc = acc + 1; ",
    );
    close.push(kind === 1 ? `acc = acc + 1; break @L${k} } ` : "} ");
  }
  const body = nested
    ? open.join("") + [...close].reverse().join("")
    : open.map((o, k) => o + close[k]).join("");
  return `function f(a: i32): i32 {\n  let acc = 0\n  ${body}\n  acc\n}\nprint(f(1))\n`;
};

// A pass that re-walked a level's whole subtree once per level was quadratic in the depth:
// a guard's `stmtAlwaysExits`, a scope-chain lookup, a loop's hoist scan (D2190). Measured
// 2026-09-23: 0.62 / 0.56 / 1.11, and 6.60 / 0.39 / 16.50 on the seed before D2190. The many
// arm needs a host whose compiler stack holds 6,000 levels (D2182).
axis(
  "nesting depth",
  2.5,
  "A pass is re-walking each nested statement's whole subtree once per level (D2190).",
  (d) => twoFiles(d, genNesting(6000, true), genNesting(6000, false)),
);

// `stmts` bindings of a `depth`-deep nest of if-expressions in the THEN arm, against
// `stmts * depth` one-level ones: the same `if` nodes either way, only how deep they sit.
const genIfNest = (stmts: number, depth: number, nested: boolean): string => {
  const o = ["function t(): boolean { 1 == 1 }", "function f(a: i32): i32 {", "  let acc = 0"];
  const n = nested ? stmts : stmts * depth;
  for (let i = 0; i < n; i++) {
    let s = `a + ${i % 13}`;
    for (let k = 0; k < (nested ? depth : 1); k++) s = `if t() { ${s} } else { 2 }`;
    o.push(`  const v${i} = ${s}`, `  acc = acc + v${i}`);
  }
  o.push("  acc", "}", "print(f(1))");
  return o.join("\n") + "\n";
};

// Every arm predicate of `ifExprRefKind` asked it again of the inner join, so a nest cost
// ~2^depth: this pair read 1.53 on the seed before #3094's first head (already ~1.8^depth,
// merely slow at depth 6), 7.27 on that head, whose f32 rung added a third asker, and 0.41
// with the per-query memo and the scalar-join exit (D2271).
axis(
  "if-expression nesting depth",
  2.5,
  "An arm predicate is re-classifying the inner join once per path — `ifExprRefKind`'s memo or its scalar-join exit (D2271).",
  (d) => twoFiles(d, genIfNest(1200, 6, true), genIfNest(1200, 6, false)),
);

const genConcatChains = (chains: number, len: number): string => {
  const o = [
    "type P = { x: i32 }",
    "function f(): i32 {",
    "  const a: i32[] = [1]",
    "  const b: f64[] = [1.5]",
    "  const c: P[] = [{ x: 1 }]",
    "  let acc = 0",
  ];
  for (let i = 0; i < chains; i++) {
    for (const v of ["a", "b", "c"]) {
      o.push(`  const ${v}${i} = ${Array(len).fill(v).join(" + ")}`, `  acc = acc + ${v}${i}.length`);
    }
  }
  o.push("  acc", "}", "print(f())");
  return o.join("\n") + "\n";
};

// A GROWTH pair: one 300-operand concat per element type against one 75-operand one, so
// linear reads 4, quadratic 16 and cubic 64. Asking a concat's list rep walked its whole left
// operand when the recorded type did not settle it, and the per-query memo was a linear scan,
// so the long arm cost ~n^3 and trapped at n = 1000 (D2275). Quadratic today.
axis(
  "list concat chain length",
  17.3,
  "A concat's list rep is re-derived from its operands instead of its recorded type, or `exprListRep`'s memo stopped being indexed by node (D2275).",
  (d) => twoFiles(d, genConcatChains(1, 300), genConcatChains(1, 75)),
);

// D2445's GROWTH pair: one `n`-term `+` chain per operand width (i32, f32, f64, i64, string)
// at 2,000 against 500, so linear reads 4 and quadratic 16. Each operator's emission asked its
// operands' width, and each answer re-walked the whole left subtree, so the long arm was cubic
// and trapped past about 600 terms; the arithmetic classifiers now memoise per node.
const genOperatorChains = (n: number): string => {
  const o: string[] = [];
  for (const [f, ty, arg] of [["i", "i32", "1"], ["g", "f32", "0.25"], ["d", "f64", "0.5"], ["l", "i64", "3"], ["s", "string", '"ab"']]) {
    o.push(`function ${f}(a: ${ty}): ${ty} {`, `  ${Array(n).fill("a").join(" + ")}`, "}");
    o.push(f === "s" ? `print(${f}(${arg}).length)` : `print(${f}(${arg}))`);
  }
  // The same chains as the operand of a comparison, a condition and a `&&`, where the parser's
  // mark has to land on the chain's own root rather than on the operator that wraps it.
  const c = Array(n).fill("a").join(" + ");
  o.push(
    `function ceq(a: i32) { ${c} == 0 }`,
    "print(ceq(1))",
    `function cif(a: i32, limit: i32) { if ${c} > limit { return 1 } 0 }`,
    "print(cif(1, 3))",
    `function cand(b: boolean, a: i32) { b && ${c} > 3 }`,
    "print(cand(true, 1))",
    `function clt(a: f64) { ${c} < 0.5 }`,
    "print(clt(0.5))",
    `function cseq(a: string) { ${c} == \"x\" }`,
    "print(cseq(\"x\"))",
  );
  return o.join("\n") + "\n";
};

axis(
  "arithmetic operator chain length",
  5.0,
  "An operand-width classifier re-walks its subtree per level (`exprIsF64`/`exprIsF32`/`exprIsI64`/`exprIsStrConcat`, compiler/emit_classify.vl); see D2445.",
  (d) => twoFiles(d, genOperatorChains(2000), genOperatorChains(500)),
);

// D3417's GROWTH pair: one `n`-element literal per element kind (i32, f64, i64, a record) at
// 40,000 against 10,000, so linear reads 4 and quadratic 16; it reads 2.9, the fixed cost of a
// compile riding the short arm. A scalar literal past the operand cap is a data segment, and
// each element is asked its width once per classification.
const genArrayLiterals = (n: number): string => {
  const o: string[] = [];
  const els = (f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join(", ");
  o.push(`const a: i32[] = [${els((i) => `${(i * 7919) % 2001 - 1000}`)}]`);
  o.push(`const b = [${els((i) => `${i % 97}.5`)}]`);
  o.push(`const c: i64[] = [${els((i) => `${i * 3}`)}]`);
  o.push(`function mk() {\n  return [${els((i) => `{ k: ${i % 89} }`)}]\n}`);
  o.push("print(a[a.length - 1] + mk()[1].k)", "print(b[3])", "print(c[c.length - 1])");
  return o.join("\n") + "\n";
};

axis(
  "array literal length",
  5.0,
  "A literal's elements are re-scanned per element, or a scalar literal past the operand cap stopped lowering as a data segment (`arrLitNumKind`, `arrLitDataBuild`; D3417).",
  (d) => twoFiles(d, genArrayLiterals(40000), genArrayLiterals(10000)),
);

// A chain of `depth` generics, each calling the next, every body carrying deferred
// constraints over its `T`; `calleeFirst` declares the chain bottom-up.
const genGenericChain = (depth: number, calleeFirst: boolean): string => {
  const fns: string[] = [];
  for (let i = 0; i < depth; i++) {
    const body = [`function g${i}<T>(x: T) {`, "  const a: i32 = x + 1", "  takes(x * 2)", "  print(x - a)"];
    if (i + 1 < depth) body.push(`  g${i + 1}(x)`);
    body.push("}");
    fns.push(body.join("\n"));
  }
  if (calleeFirst) fns.reverse();
  return ["function takes(n: i32) { print(n) }", ...fns, "g0(3)"].join("\n") + "\n";
};

// D3062's ORDER pair: one chain declared callee-first against caller-first. Each order's
// constraints are recorded once before a caller is checked; a callee-first body walked twice
// read 2.13 here, and fuel reads 0.60 without that.
axis(
  "generic chain declared callee-first",
  1.25,
  "A generic body is walked for its constraints and then again for real (`cstrProbeBefore`, compiler/typecheck.vl).",
  (d) => twoFiles(d, genGenericChain(60, true), genGenericChain(60, false)),
);

// D3101's GROWTH pair: the caller-first chain at depth 60 against 15, so linear reads 4 and
// quadratic 16. Known super-linear: every call re-validates each constraint its callee
// inherited from the rest of the chain. Fuel reads 17.7, so the bar is 1.25x that.
axis(
  "generic chain depth",
  22.2,
  "A call re-validates its callee's inherited constraints (`validate*Cstrs`, compiler/typecheck.vl); see D3101.",
  (d) => twoFiles(d, genGenericChain(60, false), genGenericChain(15, false)),
);

// D3253's GROWTH pair: a caller-first generic chain whose every body also hands `[x]` to a
// concrete list parameter, at depth 160 against 40, so linear reads 4. A composite argument's
// demand re-noted to every caller up the chain read 82 here; resolved once at its pin it reads
// 7.42, the same as master's 7.41 without the demand, so the bar is 1.25x that.
const genCompArgChain = (depth: number): string => {
  const o = ["function h(a: f64[]) { return a.length }"];
  for (let i = 0; i < depth; i++) {
    const next = i + 1 < depth ? `g${i + 1}(x) + ` : "";
    o.push(`function g${i}<T>(x: T): i32 { return ${next}h([x]) }`);
  }
  o.push("print(g0(1.5))");
  return o.join("\n") + "\n";
};

axis(
  "generic chain with list-literal arguments",
  9.3,
  "A composite argument's demand (`ACF_COMP`, compiler/typecheck.vl) is being moved out to every caller instead of resolved at its pin.",
  (d) => twoFiles(d, genCompArgChain(160), genCompArgChain(40)),
);

// D3246's GROWTH pair: a chain of `n` literal bindings, each stored into the next, the first from
// an `i64`, at 400 against 100, so linear reads 4 and quadratic 16. Every link takes `i64` from
// the one before it, so the solve must carry the answer down the whole chain. Fuel reads 3.97,
// so the bar is 1.25x that.
const genLiteralChain = (n: number): string => {
  const o = ["function big() { 3000000000 }", "let a0 = 0", "a0 = big()"];
  for (let i = 1; i < n; i++) o.push(`let a${i} = 0`, `a${i} = a${i - 1}`);
  o.push(`print(a${n - 1} + a0)`);
  return o.join("\n") + "\n";
};

// The flow-narrowing join at an `if` (DECISIONS.md, "Flow narrowing: per-path facts meet at
// joins") folds the ledger rows of its own subtree once, and hands its enclosing join one
// summary row per key. Two GROWTH pairs, `n` against `n/4`, so linear reads 4 and quadratic 16:
// `n` sequential joins of one name in one function, and joins nested `n` deep. Sequential reads
// 3.98. Nested reads 5.26 and is super-linear in DEPTH, not size: a write walks the name's
// narrowing layer per enclosing block (`narWriteStorage`, `narBindDepthOf`), as a nested
// straight-line write already did on master `296e1141d` (8.2 there, 4.6 here). The ratio keeps
// climbing with depth (8.0 at 400 against 100), so its bar, 1.25x the reading, records DEBT.
const genSeqJoins = (n: number): string => {
  const o = [
    "function nn(v: i32): i32 | null {",
    "  if v < 0 { return null }",
    "  return v",
    "}",
    "function f(k: i32): i32 {",
    "  let acc = 0",
    "  let x = nn(k)",
  ];
  for (let i = 0; i < n; i++) {
    o.push(`  x = nn(k - ${i % 3})`, `  if x == null { x = ${i % 7} } else { x = x + 1 }`, "  acc = acc + x");
  }
  o.push("  acc", "}", "print(f(1))");
  return o.join("\n") + "\n";
};

const genNestedJoins = (n: number): string => {
  const o = [
    "function nn(v: i32): i32 | null {",
    "  if v < 0 { return null }",
    "  return v",
    "}",
    "function f(k: i32, c: boolean): i32 {",
    "  let acc = 0",
    "  let x = nn(k)",
  ];
  for (let i = 0; i < n; i++) {
    const pad = "  ".repeat(i + 1);
    o.push(`${pad}x = nn(k - ${i % 3})`, `${pad}if x == null { x = ${i % 7} }`, `${pad}acc = acc + x`, `${pad}if c {`);
  }
  for (let i = n - 1; i >= 0; i--) o.push(`${"  ".repeat(i + 1)}}`);
  o.push("  acc", "}", "print(f(1, true))");
  return o.join("\n") + "\n";
};

axis(
  "literal binding store chain",
  5.0,
  "The literal-binding solve (`lbiSettleEdges`, compiler/typecheck.vl) is re-solving every binding per link.",
  (d) => twoFiles(d, genLiteralChain(400), genLiteralChain(100)),
);

axis(
  "sequential if joins of one name",
  5.0,
  "An `if`'s arm join (`applyArmJoins`, compiler/typecheck.vl) is folding ledger rows outside its own subtree.",
  (d) => twoFiles(d, genSeqJoins(1200), genSeqJoins(300)),
);

axis(
  "if joins nested deep",
  6.6,
  "An enclosing `if`'s join re-folds its inner joins' rows (`narCompactIf`, compiler/typecheck.vl).",
  (d) => twoFiles(d, genNestedJoins(120), genNestedJoins(30)),
);

// ── the one RUNTIME axis ─────────────────────────────────────────────────────
// Every pair above grades COMPILE time, because every cost above is the compiler's. String
// building is the exception: the cost lands in the EMITTED program, so this pair builds
// nothing and times `vl run` on two programs that produce the same 800 KB string — one by
// appending in a loop, one through std's hand-rolled code-point builder (`str.join`), which
// has always been linear. The builder arm is the baseline the append arm has to match.
//
// `vl run` compiles too — the VL compile always, the engine's compile unless the module
// cache hits — and that fixed cost lands on BOTH arms alike, so it dilutes the ratio
// rather than inflating it — the bar is an upper bound and dilution can only make this
// weaker, never a false red. The floor is the pair's own (0.05 s, not `FLOOR`): both arms
// finish well under 0.4 s now, and `FLOOR` would divide the append arm by 0.4 and pass a
// quadratic. Measured 2026-09-03 at 40,000 appends: **16.10 on master, 0.32 after** (the
// append arm 0.805 s -> 0.02 s against the builder arm 0.028 s / 0.03 s). Bar 2.5.
const runProg = (src: string): Promise<Cost> =>
  spawn(`run on ${src}`, ["run", src, "--compiler", COMPILER], false);

const genAppendLoop = (n: number): string =>
  [
    "function build(n: i32): string {",
    '  let s = ""',
    "  let i = 0",
    '  while i < n { s = s + "0123456789abcdefghij"; i = i + 1 }',
    "  return s",
    "}",
    `print(build(${n}).length)`,
    "",
  ].join("\n");

const genJoinBuild = (n: number): string =>
  [
    'import { join } from "std:str"',
    "function build(n: i32): string {",
    "  let parts: string[] = []",
    "  let i = 0",
    '  while i < n { parts.push("0123456789abcdefghij"); i = i + 1 }',
    '  return join(parts, "")',
    "}",
    `print(build(${n}).length)`,
    "",
  ].join("\n");

Deno.test({
  name: "scaling shape: string append loop",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_scale_strappend_" });
    try {
      const [manySrc, oneSrc] = twoFiles(dir, genAppendLoop(40000), genJoinBuild(40000));
      await grade(
        "string append loop",
        2.5,
        "40,000 appends against the same 800 KB string through std's builder: the " +
          "loop-local accumulator lowering (`strAccScan` / `emitStrAccAppend`, " +
          "compiler/wasmEmit.vl) stopped firing, so every append allocates an exact-fit " +
          "backing and copies the whole prefix again. Check what disqualified the binding.",
        () => runProg(manySrc),
        () => runProg(oneSrc),
        RUN_FLOOR,
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// The same axis at MODULE scope, where the accumulator is a wasm CELL rather than a slot.
// `strAccScan` ran per function body and `emitStartFnCode` never called it, so a top-level
// `let s = ""` kept the pairwise concat: 200,000 appends cost 0.844 s CPU against 400,000's
// 3.530 s, a 4.18 ratio over a 2x input (ROADMAP row 26). Both arms build the same 800 KB
// string, so the append arm has only to match the builder.
const genGlobalAppendLoop = (n: number): string =>
  [
    'let s = ""',
    "let i = 0",
    `while i < ${n} { s = s + "0123456789abcdefghij"; i = i + 1 }`,
    "print(s.length)",
    "",
  ].join("\n");

const genGlobalJoinBuild = (n: number): string =>
  [
    'import { join } from "std:str"',
    "let parts: string[] = []",
    "let i = 0",
    `while i < ${n} { parts.push("0123456789abcdefghij"); i = i + 1 }`,
    'print(join(parts, "").length)',
    "",
  ].join("\n");

Deno.test({
  name: "scaling shape: module-global string append loop",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_scale_gstrappend_" });
    try {
      const [manySrc, oneSrc] = twoFiles(
        dir,
        genGlobalAppendLoop(40000),
        genGlobalJoinBuild(40000),
      );
      await grade(
        "module-global string append loop",
        2.5,
        "40,000 appends to a TOP-LEVEL `let s = \"\"` against the same string built " +
          "through std's builder: the accumulator lowering (`strAccScanStart` / " +
          "`emitStrAccAppend`, compiler/wasmEmit.vl) stopped reaching the start function, so " +
          "every append allocates an exact-fit backing and copies the whole prefix again. " +
          "The function-scope pair above is the control for which half broke.",
        () => runProg(manySrc),
        () => runProg(oneSrc),
        RUN_FLOOR,
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// The same axis at a PLACE the binding proof does not cover: a field, a list cell, a map value
// and a prepend, each appended `n` times in one loop, against the same four strings built
// through std's builder. Each place copied its whole prefix per append before the site-cached
// lowering (D2625), which made the many arm quadratic in any one of the four.
const genPlaceAppendLoop = (n: number): string =>
  [
    "function build(n: i32): string {",
    '  const o = { s: "" }',
    '  const xs = ["", ""]',
    "  const m: {[i32]: string} = Map()",
    '  let p = ""',
    "  let i = 0",
    "  while i < n {",
    '    o.s = o.s + "0123456789"',
    '    xs[1] = xs[1] + "0123456789"',
    '    m[0] = (m[0] ?? "") + "0123456789"',
    '    p = "0123456789" + p',
    "    i = i + 1",
    "  }",
    '  return o.s + xs[1] + (m[0] ?? "") + p',
    "}",
    `print(build(${n}).length)`,
    "",
  ].join("\n");

const genPlaceJoinBuild = (n: number): string =>
  [
    'import { join } from "std:str"',
    "function build(n: i32): string {",
    "  let parts: string[] = []",
    "  let i = 0",
    '  while i < 4 * n { parts.push("0123456789"); i = i + 1 }',
    '  return join(parts, "")',
    "}",
    `print(build(${n}).length)`,
    "",
  ].join("\n");

Deno.test({
  name: "scaling shape: place string append loop",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_scale_pstrappend_" });
    try {
      const [manySrc, oneSrc] = twoFiles(dir, genPlaceAppendLoop(20000), genPlaceJoinBuild(20000));
      await grade(
        "place string append loop",
        2.5,
        "20,000 appends each to a field, a list cell, a map value and a prepended local, " +
          "against the same strings through std's builder: the site-cached lowering " +
          "(`strSiteArm` / `emitStrSiteCat`, compiler/wasmEmit.vl) stopped firing for at least " +
          "one of the four, so its appends copy the whole prefix again (D2625).",
        () => runProg(manySrc),
        () => runProg(oneSrc),
        RUN_FLOOR,
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// 1.27 / 1.13 / 1.12 (wall, idle-ish box). GETTER CALLEES (D2135): the per-function summary is
// one walk per callee instance, memoised, so N distinct callee chains cost what N/K chains read
// K times each do. A summary that scans the program per callee separates the two arms.
axis(
  "getter callees",
  2.5,
  "The effects summary is doing whole-program work per callee instance rather than one memoised walk (`esRowFor`).",
  (d) => twoFiles(d, genGetterCallees(1600, 1), genGetterCallees(1600, 20)),
);

// `n` calls of a top-level `function w` in one function whose frame also binds `w` out of the
// calls' scope (a closed block's `const w` and an ended `for w`), against the same function with
// those bindings named `v`. Every call asks whether a binding of its callee's name is in scope at
// it, and that answer comes off a per-sid index of the frame's bindings, not a body walk (D2289).
// At 16,000 calls: 0.38 / 0.34 / 0.95 here, 15.66 / 0.36 / 39.15 on #3135's round-3 cut, and
// 0.72 / 0.36 / 1.80 on master, whose `blockDeclaresStmt` scanned the body's statements per read.
const genShadowedCallee = (n: number, shadow: boolean): string => {
  const b = shadow ? "w" : "v";
  const o = ["function w(): i32 { return 1 }", "function g(): i32 {", "  let acc = 0"];
  o.push(`  if acc > 5 {\n    const ${b} = 3\n    acc = acc + ${b}\n  }`);
  o.push(`  for ${b} in [1, 2] { acc = acc + ${b} }`);
  for (let i = 0; i < n; i++) o.push(`  acc = acc + w() * ${i % 97}`);
  o.push("  acc", "}", "print(g())");
  return o.join("\n") + "\n";
};

axis(
  "calls under a same-named binding",
  2.5,
  "A call's shadow test is walking the frame body per call (`chainShadowsAt`, D2289).",
  (d) => twoFiles(d, genShadowedCallee(20000, true), genShadowedCallee(20000, false)),
);

// `fns` functions of `arms` sibling blocks, each binding its function's one list name to a
// literal and returning it, against the same program with every binding annotated `i32[]`.
// The declared union is load-bearing: it is what makes the emitter look for a destination
// that would re-type an un-annotated literal. A later same-named binding had no known scope
// there and scanned the whole arena, so each cost the program (D2685). At 4 x 1,200: 7.49 /
// 0.53 / 14.13 on the seed before D2685, 0.52 / 0.46 / 1.13 after.
const genListLits = (fns: number, arms: number, annotated: boolean): string => {
  const t = annotated ? ": i32[]" : "";
  const o = ["type U = i32 | string"];
  for (let f = 0; f < fns; f++) {
    o.push(`function f${f}(n: i32): i32[] {`);
    for (let a = 0; a < arms; a++) {
      o.push(`  if n == ${a} {`, `    const out${f}${t} = [n, n + ${a}]`, `    return out${f}`, "  }");
    }
    o.push(`  const out${f}${t} = [n]`, `  out${f}`, "}");
  }
  o.push("let acc = 0");
  for (let f = 0; f < fns; f++) o.push(`acc = acc + f${f}(${f}).length`);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

axis(
  "un-annotated list literals",
  2.5,
  "An un-annotated list literal's destination scan (`dsScopeRootOf`, compiler/emit_classify.vl) lost its binding's scope and walked the arena (D2685).",
  (d) => twoFiles(d, genListLits(4, 1200, false), genListLits(4, 1200, true)),
);

// `n` callees returning a list, each called once from ONE caller, with the returns inferred
// against annotated. Asking about an inferred-return callee's body used to evict the caller's
// let plan, which the caller's next question rebuilt, so each call cost the caller (D2687).
const genInferredCallees = (n: number, annotated: boolean): string => {
  const t = annotated ? ": i32[]" : "";
  const o = ["type U = i32 | string"];
  for (let f = 0; f < n; f++) {
    o.push(`function f${f}(n: i32)${t} {`, `  const out: i32[] = [n, ${f % 13}]`, "  out", "}");
  }
  o.push("function main() {", "  let acc = 0");
  for (let f = 0; f < n; f++) {
    o.push(`  acc = acc + f${f}(${f % 5}).length`);
    fill(o, f, 2);
  }
  o.push("  print(acc)", "}", "main()");
  return o.join("\n") + "\n";
};

axis(
  "calls to inferred-return callees",
  2.5,
  "Asking about an inferred-return callee rebuilt the calling function's let plan (`plEnsure`, compiler/emit_base.vl; D2687).",
  (d) => twoFiles(d, genInferredCallees(3000, false), genInferredCallees(3000, true)),
);

// `fns` functions each binding an un-annotated list `out`, beside one function that assigns
// its own local `20 * fns` times, named `out` in the many arm and `sink` in the one. A
// binding's store scan walked its name's occurrences in every frame rather than its own
// (`cwIxFrHead`, compiler/typecheck.vl; D2688), so the sink's rows cost each binding.
const genSharedListName = (fns: number, shared: boolean): string => {
  const o = ["type U = i32 | string"];
  for (let f = 0; f < fns; f++) {
    o.push(
      `function g${f}(n: i32): i32[] {`,
      "  if n == 0 {",
      "    const out = [n, n + 1]",
      "    return out",
      "  }",
      "  const out = [n]",
      "  out",
      "}",
    );
  }
  const s = shared ? "out" : "sink";
  o.push("function h(k: i32): i32 {", `  let ${s} = k`);
  for (let j = 0; j < 20 * fns; j++) o.push(`  ${s} = ${s} + ${j % 7}`);
  o.push(`  ${s}`, "}", "let acc = h(1)");
  for (let f = 0; f < fns; f += 50) o.push(`acc = acc + g${f}(${f}).length`);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

axis(
  "a list name shared across functions",
  2.0,
  "An un-annotated list const's store scan walked its name's occurrences in every function (`constStoresForeignList`, D2688).",
  (d) => twoFiles(d, genSharedListName(2000, true), genSharedListName(2000, false)),
);

// `n` generics that each call every other one at `<T>`, as one cycle or as a chain (a call to
// an earlier one goes to a concrete twin instead), with no `is` anywhere. Whether a generic is
// keyed by its exact pins is asked once per template, so a cycle settles once at its root; a
// "no" left unsettled inside the cycle re-walked it per ask, exponential in `n` (D2684).
const genGenericCycle = (n: number, cycle: boolean): string => {
  const o: string[] = [];
  for (let i = 0; i < n; i++) {
    o.push(`function h${i}(n: i32): boolean { n > 0 }`);
    o.push(`function f${i}<T>(u: T | null, n: i32): boolean {`, "  if n <= 0 { return u == null }");
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const call = cycle || j > i ? `f${j}<T>(u, n - 1)` : `h${j}(n - 1)`;
      o.push(`  if n % ${n} == ${j} { return ${call} }`);
    }
    o.push("  false", "}");
  }
  o.push("let acc = 0");
  for (let i = 0; i < 2400; i++) fill(o, i, 6);
  o.push("const s: i32[] = []", `print(f0<i32[]>(s, ${n}))`, "print(acc)");
  return o.join("\n") + "\n";
};

axis(
  "generics calling each other in a cycle",
  2.5,
  "A generic's exact-keying answer is being re-derived per ask inside a call cycle (D2684).",
  (d) => twoFiles(d, genGenericCycle(14, true), genGenericCycle(14, false)),
);

// `n` generics that each call every other one at `<T>` over a `T | null` they compare with
// `==`, against the same generics calling a concrete helper instead. Each call copies its
// callee's deferred operator constraints into the caller under substitution, and a copy keyed
// on its fresh arena index re-recorded every one, exponential in `n` (D2757). At 16: 3.9 s of
// `vl check` alone on the seed before D2757.
const genGenericClique = (n: number, clique: boolean): string => {
  const o: string[] = [];
  for (let i = 0; i < n; i++) {
    o.push(`function h${i}(n: i32): boolean { n > 0 }`);
    o.push(`function f${i}<T>(u: T | null, n: i32): boolean {`, "  if n <= 0 { return u == null }");
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const call = clique ? `f${j}<T>(u, n - 1)` : `h${j}(n - 1)`;
      o.push(`  if n % ${n} == ${j} { return ${call} }`);
    }
    o.push("  false", "}");
  }
  o.push("let acc = 0");
  for (let i = 0; i < 3600; i++) fill(o, i, 6);
  o.push("const s: i32[] = []", `print(f0<i32[]>(s, ${n}))`, "print(acc)");
  return o.join("\n") + "\n";
};

axis(
  "generics calling each other in a complete graph",
  2.5,
  "A call to a generic is re-recording its callee's deferred constraints per copy (`noteBinCstr`, compiler/typecheck.vl; D2757).",
  (d) => twoFiles(d, genGenericClique(16, true), genGenericClique(16, false)),
);

// #3300's review pair, and not a reshape: the SAME program with and without one parameter
// name. A name anywhere turns on the redundant-annotation hint's look through each binding's
// alias names, and a lookup that walked the alias table per binding cost 3,000 aliases x
// 3,000 bindings (2.49 here). Aliases are super-linear on their own, so a many/one pair over
// them would carry that debt; this pair holds the name's own price near 1.
const genNamedFnAliases = (named: boolean): string => {
  const o: string[] = [named ? "type G = (fn: i32) => i32" : "type G = (i32) => i32"];
  for (let i = 0; i < 3000; i++) o.push(`type A${i} = i32`);
  for (let i = 0; i < 3000; i++) o.push(`const x${i}: A${i} = ${i}`);
  o.push("print(x0)");
  return o.join("\n") + "\n";
};
axis(
  "one function-type parameter name over 3,000 aliases",
  1.25,
  "An annotation's alias names are being resolved by walking the alias table (`aliasTsRootOf`, compiler/ast.vl).",
  (d) => twoFiles(d, genNamedFnAliases(true), genNamedFnAliases(false)),
);

// ── the instrument's own control ─────────────────────────────────────────────
// EVERY PAIR ABOVE PASSES, so nothing above can say whether the grader still reds. The
// control is the same `grade` over a pair that must: one source, one literal different,
// the many arm running its inner loop `n` times per outer step against the one arm's once
// — so the many arm does n^2 units of the same work against the one arm's n.
//
// THE QUADRATIC IS THE PROGRAM'S OWN ALGORITHM, which is the whole point of choosing this
// shape: a control built on a compiler GAP reds the gate the day somebody closes the gap,
// and a gate that goes red on an improvement teaches people to distrust it. The inner term
// reads the outer index, so it is not loop-invariant and no optimisation can hoist it. It
// reads 13.8 for 0.7 s, and only a broken grader can move that.
const genNestedLoop = (n: number, inner: number): string =>
  [
    "function work(n: i32, m: i32): i32 {",
    "  let acc = 0",
    "  let i = 0",
    "  while i < n {",
    "    let j = 0",
    "    while j < m { acc = acc + (i + j) % 7 - 3; j = j + 1 }",
    "    i = i + 1",
    "  }",
    "  return acc",
    "}",
    `print(work(${n}, ${inner}))`,
    "",
  ].join("\n");

Deno.test({
  name: "scaling shape: control — a quadratic arm reds",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_scale_control_" });
    try {
      const [badSrc, okSrc] = twoFiles(dir, genNestedLoop(22000, 22000), genNestedLoop(22000, 1));
      let red = "";
      try {
        await grade(
          "control",
          2.5,
          "unreachable: the control exists to fail.",
          () => runProg(badSrc),
          () => runProg(okSrc),
          RUN_FLOOR,
        );
      } catch (e) {
        red = String(e);
      }
      if (!red) {
        throw new Error(
          "the control did not red: 22,000 x 22,000 iterations of a loop came in under 2.5x " +
            "the same loop run 22,000 x 1 times. Nothing about the compiler can do that, so " +
            "the grader has stopped measuring and every axis above is worth nothing — run " +
            "with VL_SCALING_VERBOSE=1 and fix the grader, not this case.",
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// THE FUEL GRADER'S CONTROL. The same program at 20x the statements against 1x: twenty times
// the work by construction, so it must red a 2.5 bar, and only a broken fuel reading (no
// `[fuel]` line parsed, a constant, both arms metered as one) can pass it. Its many arm is
// linear, so no compiler improvement can turn it green.
const genStatements = (n: number): string => {
  const o = ["let acc = 0"];
  for (let i = 0; i < n; i++) fill(o, i, 6);
  o.push("print(acc)");
  return o.join("\n") + "\n";
};

Deno.test({
  name: "scaling shape: control — twenty times the work reds the fuel grader",
  ignore: !ENABLED,
  fn: async () => {
    let red = "";
    try {
      await gradePair("fuel control", 2.5, "unreachable: the control exists to fail.", (d) =>
        twoFiles(d, genStatements(4000), genStatements(200)));
    } catch (e) {
      red = String(e);
    }
    if (!red.includes("fuel control: the many-entity arm")) {
      throw new Error(
        "the fuel control did not red: 4,000 statements against 200 of the same came in under " +
          `2.5x the guest fuel. The fuel reading has stopped measuring, so every compile axis ` +
          `above is worth nothing — fix the grader, not this case. (${red || "no error"})`,
      );
    }
  },
});
