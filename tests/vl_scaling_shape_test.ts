// SCALING SHAPE: two programs, the same amount of work, one axis reshaped.
//
// A pass that re-derives a module-wide answer per ENTITY is O(entities x nodes) and is
// invisible to a wall-clock budget, because the budget has to be loose enough for the
// slowest box that runs it. A RATIO is not: machine speed, JIT warm-up and box load
// multiply both arms, so they cancel. #2419 is the worked instance — two module-wide
// predicates re-derived once per emitted FUNCTION were 59% of a self-compile, and the
// functions pair below reads 5.81x on that compiler against 1.02x after.
//
// The ratio is of the child's CPU (user+sys), because a ratio cancels only a UNIFORM
// slowdown and a fanned-out gate delivers bursts: the two arms run at different moments,
// and the one a burst lands on is inflated alone. The last case below is the CONTROL, a
// pair that must red, so a grader that stopped measuring cannot pass in silence.
//
// One pair per axis a pass could accidentally multiply over. The "many" arm spreads the
// same work over N entities, the "one" arm over N/K. Method and profiles:
// docs/internals/profiling-the-compiler.md.
//
// @test-timing instrument

// TWO AXES ARE SUPER-LINEAR TODAY and carry a bar above their measured ratio rather than
// the default. That is recorded DEBT, not tolerance: each names the function that makes it
// so, and both answer a name by linear scan over a registry table, which is why `__str_eq__`
// tops their profiles. Two have left the list: `generic pins` when its per-instance pass
// learned to resume, and `unions` when the five scans under it came off — and reading either
// as still super-linear costs a campaign. Lower a bar when the thing it names stops
// multiplying, and RESIZE the pair when its cheap arm falls under the floor, because from
// there the reading is a budget on the dear arm and not a ratio at all.

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

// N call sites either way; the many arm spreads them over N callees, the one arm over
// N/K. Both DECLARE N functions, so only the callee distribution differs.
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
    "type Box = { xs: Shape[] }",
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
      `  const b${i}: ${wide ? "Shape" : "Circle"}[] = a${i}`,
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

// ── the runner ───────────────────────────────────────────────────────────────

// WHAT IS GRADED IS THE CHILD'S CPU, NOT THE CLOCK. A ratio cancels a UNIFORM slowdown,
// and `gate.sh` does not deliver one: 24 rows fan out, so the two arms of a pair run at
// different moments against a load that moves by the second, and the arm a burst lands on
// is inflated alone. Measured beside a fanned-out gate, one arm's WALL reading moved 2.6x
// while its own user+sys did not — the axes then read 3.69 and 6.54 against bars of 2.5
// and 4.0 with nothing wrong. Contention costs a process waiting; it does not make it
// execute more instructions, so user+sys is what a reshaped pair can be compared on.
type Cost = { wall: number; cpu: number };

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

const spawn = async (what: string, argv: string[]): Promise<Cost> => {
  const t0 = Date.now();
  const { code, stdout, stderr } = await new Deno.Command("/bin/sh", {
    args: ["-c", '"$@"; rc=$?; times; exit $rc', "sh", VL, ...argv],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  const wall = (Date.now() - t0) / 1000;
  if (code !== 0) {
    throw new Error(`vl ${what} failed: ${new TextDecoder().decode(stderr).slice(0, 400)}`);
  }
  return { wall, cpu: childCpu(new TextDecoder().decode(stdout)) };
};

const build = (src: string, out: string): Promise<Cost> =>
  spawn(`build on ${src}`, ["build", src, "-o", out, "--compiler", COMPILER]);

// The floor on the denominator keeps one spike on a sub-second arm from dominating the
// quotient; every pair below is sized so the cheaper arm clears it on an idle box, so the
// floor is a safety net and not the thing being measured. Its two values carry over from
// the wall-clock reading unchanged, because an idle `vl build` spends what it takes: CPU
// ran 4-8% over wall across every axis.
const FLOOR = 0.4;
const RUN_FLOOR = 0.05;
const VERBOSE = Deno.env.get("VL_SCALING_VERBOSE") === "1";

// A suspicious ratio buys one more INTERLEAVED round — many, one, many, one — and takes
// the per-side minimum, so a burst that hits one arm is dropped rather than being divided
// by an arm it missed. A spike does not repeat, a quadratic does.
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
  if (VERBOSE) {
    console.log(
      `[scaling] ${axis}: many ${say(ms)} one ${say(os)} ` +
        `ratio ${ratio().toFixed(2)} bar ${bar}`,
    );
  }
  if (ratio() > bar) {
    throw new Error(
      `${axis}: the many-entity arm cost ${say(ms)} against ${say(os)} for the same work ` +
        `reshaped (ratio ${ratio().toFixed(2)}, bar ${bar}) — something is being ` +
        `re-derived per ${axis} entity. ${note} Profile it with ` +
        `docs/internals/profiling-the-compiler.md and bank the answer. (The ratio is of ` +
        `CPU, so box load is not the explanation; wall far above cpu means only that the ` +
        `run was starved.)`,
    );
  }
};

const gradePair = async (
  axis: string,
  bar: number,
  note: string,
  mk: (dir: string) => Promise<[string, string]> | [string, string],
  floor: number = FLOOR,
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: `vl_scale_${axis}_` });
  try {
    const [manySrc, oneSrc] = await mk(dir);
    await grade(
      axis,
      bar,
      note,
      () => build(manySrc, `${dir}/many.wasm`),
      () => build(oneSrc, `${dir}/one.wasm`),
      floor,
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

const axis = (
  name: string,
  bar: number,
  note: string,
  mk: (d: string) => [string, string],
  floor?: number,
) =>
  Deno.test({
    name: `scaling shape: ${name}`,
    ignore: !ENABLED,
    fn: () => gradePair(name, bar, note, mk, floor),
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

// 1.37 / 1.15 / 1.19.
axis("types", 2.5, "A per-declaration cost is scaling with the type table.", (d) =>
  twoFiles(d, genTypes(2500, 1), genTypes(2500, 20)));

// The pair moved 800 -> 2,400 because at 800 the cheap arm ran 0.16 s under a 0.25 s floor:
// the floor was the denominator, so the reading was an absolute budget and a constant-factor
// regression was invisible. At 2,400 the cheap arm is 0.6 to 1.2 s, 2.4 to 3.2x the floor, so
// the reading is a ratio again — median 1.28 to 1.40 over 44 interleaved rounds spanning load
// 22 to 235, against master's 1.42 to 1.48 beside it. The arms have converged, so the bar
// would be the family default; it sits at 3.0 because one round of the 44 drew 2.30 and 2.5
// would have 1.09x on that. 3.0 is 1.3x the worst round and 1.8x the second worst, and the
// pre-#2630 compiler — still carrying the scans since taken off this axis — reads 4.42 here.
axis(
  "unions",
  3.0,
  "No frame is above 5% on this axis any more — profile the many arm before naming a cause.",
  (d) => twoFiles(d, genUnions(2400, 1), genUnions(2400, 20)),
  0.25,
);

// 1.09 / 0.97 / 1.13.
axis("call sites", 2.5, "Callee resolution is scaling with the number of callees.", (d) =>
  twoFiles(d, genCallSites(6000, 1), genCallSites(6000, 20)));

// 1.99 / 2.47 / 2.58 / 2.75 over four runs — the widest spread in the family and a known
// super-linear axis, so the bar clears the top of it. `modIndexOfKey` (compiler/driver.vl)
// and `capHas` (compiler/emit_base.vl) are 47% and 35% INCLUSIVE on a 400-module build,
// both linear scans of a string-keyed table asked once per module, with `__str_eq__` under
// them at 73% self. 800 modules against 400 is 4.45x, so a per-module arena scan would
// roughly double this ratio and still be caught. Each function carries 30 statements so
// the linear half is not startup-dominated; shrink that once those two stop scanning.
// The super-linear axes' bars carry ~2x headroom over the IDLE ratio (modules 2.58,
// closures 2.22): a ratio is load-tolerant but not load-proof, and the pairs that move
// most with load are the ones whose cheap arm clamps on `FLOOR` while the dear arm does
// not — the quotient is then an absolute budget on the dear arm. That is why a
// super-linear bar sits above its measurement rather than at it, and why an axis whose
// two arms cost the same can take the family default.
// A doubling of the class (a new scan per entity) still clears every bar.
axis("modules", 5.0, "The module merge is scaling with the file count.", (d) => [
  writeModules(`${d}/many`, 400, 2, 30),
  writeModules(`${d}/one`, 200, 4, 30),
]);

// 1.14 / 0.51 / 2.22, and RISING with N (1.89 at 2,000, 3.39 at 6,000) — a known
// super-linear axis, so the bar is set above the measurement rather than at 2.5.
// `fnStmtsPosOf` (compiler/emit_classify.vl) is 21.2% self time on the many arm and
// absent from the one arm: a linear scan of `fnStmts` asked once per closure.
axis("closures", 4.0, "`fnStmtsPosOf` scans `fnStmts` once per closure.", (d) =>
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
  4.0,
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

// ── the one RUNTIME axis ─────────────────────────────────────────────────────
// Every pair above grades COMPILE time, because every cost above is the compiler's. String
// building is the exception: the cost lands in the EMITTED program, so this pair builds
// nothing and times `vl run` on two programs that produce the same 800 KB string — one by
// appending in a loop, one through std's hand-rolled code-point builder (`str.join`), which
// has always been linear. The builder arm is the baseline the append arm has to match.
//
// `vl run` compiles too, and that fixed ~0.05 s lands on BOTH arms, so it dilutes the ratio
// rather than inflating it — the bar is an upper bound and dilution can only make this
// weaker, never a false red. The floor is the pair's own (0.05 s, not `FLOOR`): both arms
// finish well under 0.4 s now, and `FLOOR` would divide the append arm by 0.4 and pass a
// quadratic. Measured 2026-09-03 at 40,000 appends: **16.10 on master, 0.32 after** (the
// append arm 0.805 s -> 0.02 s against the builder arm 0.028 s / 0.03 s). Bar 2.5.
const runProg = (src: string): Promise<Cost> =>
  spawn(`run on ${src}`, ["run", src, "--compiler", COMPILER]);

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
