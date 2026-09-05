// SCALING SHAPE: two programs, the same amount of work, one axis reshaped.
//
// A pass that re-derives a module-wide answer per ENTITY is O(entities x nodes) and is
// invisible to a wall-clock budget, because the budget has to be loose enough for the
// slowest box that runs it. A RATIO is not: machine speed, JIT warm-up and box load
// multiply both arms, so they cancel. #2419 is the worked instance — two module-wide
// predicates re-derived once per emitted FUNCTION were 59% of a self-compile, and the
// functions pair below reads 5.81x on that compiler against 1.02x after.
//
// One pair per axis a pass could accidentally multiply over. The "many" arm spreads the
// same work over N entities, the "one" arm over N/K. Method and profiles:
// docs/internals/profiling-the-compiler.md.

// FOUR AXES ARE SUPER-LINEAR TODAY and carry a bar above their measured ratio rather
// than the default. That is recorded DEBT, not tolerance: each names the function that
// makes it so. Three of the four are a name-keyed registry answering a lookup by linear
// scan — the track `__str_eq__` has topped the self-compile profile since #2419 closed
// the arena scans. `generic pins` is not one of them, and reading it as one cost a
// campaign: it is a whole-program PASS re-run once per minted instance, the #2419 shape
// one phase over. Lower a bar when the thing it names stops multiplying. The fourth,
// `unions`, joined the list when a constant term left BOTH its arms, which is worth
// keeping in mind before reading any ratio here as a property of its own axis.

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

const build = async (src: string, out: string): Promise<number> => {
  const t0 = Date.now();
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["build", src, "-o", out, "--compiler", COMPILER],
    stdout: "null",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  if (code !== 0) {
    throw new Error(`vl build failed on ${src}: ${new TextDecoder().decode(stderr).slice(0, 400)}`);
  }
  return (Date.now() - t0) / 1000;
};

// The floor on the denominator keeps one scheduler spike on a sub-second arm from
// dominating the quotient; every pair below is sized so the cheaper arm clears it on an
// idle box, so the floor is a safety net and not the thing being measured. A suspicious
// ratio is re-measured once with the per-side minimum taken — a spike does not repeat,
// a quadratic does.
const FLOOR = 0.4;
const VERBOSE = Deno.env.get("VL_SCALING_VERBOSE") === "1";

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
    let tMany = await build(manySrc, `${dir}/many.wasm`);
    let tOne = await build(oneSrc, `${dir}/one.wasm`);
    const bad = () => tMany > bar * Math.max(tOne, floor);
    if (bad()) {
      tMany = Math.min(tMany, await build(manySrc, `${dir}/many.wasm`));
      tOne = Math.min(tOne, await build(oneSrc, `${dir}/one.wasm`));
    }
    if (VERBOSE) {
      console.log(
        `[scaling] ${axis}: many ${tMany.toFixed(2)}s one ${tOne.toFixed(2)}s ` +
          `ratio ${(tMany / Math.max(tOne, floor)).toFixed(2)} bar ${bar}`,
      );
    }
    if (bad()) {
      throw new Error(
        `${axis}: the many-entity arm cost ${tMany}s against ${tOne}s for the same work ` +
          `reshaped (ratio ${(tMany / Math.max(tOne, floor)).toFixed(2)}, bar ${bar}) — ` +
          `something is being re-derived per ${axis} entity. ${note} Profile it with ` +
          `docs/internals/profiling-the-compiler.md and bank the answer.`,
      );
    }
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

// 3.49 / 3.02 / 3.69 raw, across box load 79 to 227 — a fourth super-linear axis, and the
// only one whose number was ever HIDDEN rather than tolerated. Both arms declare 801
// module-level bindings, so both used to pay the definite-assignment set's per-write rebuild;
// at 2,400 bindings that constant read 41.7 s against 37.8 s, ratio 1.10, and the axis graded
// nothing. With the set sid-keyed the arms read 1.2 s against 0.33 s and the union registry's
// own per-entity cost is what is left (perf items 5 and 7). The cheap arm now costs less than
// the shared 0.4 s floor, which would turn the quotient into an absolute budget on the many
// arm, so this pair takes 0.25 — above a process start, below its own denominator.
axis(
  "unions",
  5.5,
  "A per-union cost is scaling with the union registry.",
  (d) => twoFiles(d, genUnions(800, 1), genUnions(800, 20)),
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
// closures 2.22): a ratio is load-tolerant but not load-proof — generic pins read 6.16
// against a bar of 6 inside a fanned-out gate at load 92, a comment-only PR, and 10.5
// against a bar of 9 in another, which is why that one's headroom is wider still.
// A doubling of the class (a new scan per pin) still clears every bar.
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

// Still super-linear in the pin count, and the one arm sits near `FLOOR`, so the quotient is
// close to an absolute budget on the many arm and moves with box load. What is left is
// `collectA` (compiler/emit_collect.vl), which `monoRebuild` re-mints once per minted
// instance and which is 62.6% of the many arm. Profiles and A/B: CHANGELOG.md, 2026-09-05.
axis("generic pins", 6.0, "`monoRebuild` re-runs a whole-program pass per minted instance.", (d) =>
  twoFiles(d, genPins(400, true), genPins(400, false)));

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
const runProg = async (src: string): Promise<number> => {
  const t0 = Date.now();
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["run", src, "--compiler", COMPILER],
    stdout: "null",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  if (code !== 0) {
    throw new Error(`vl run failed on ${src}: ${new TextDecoder().decode(stderr).slice(0, 400)}`);
  }
  return (Date.now() - t0) / 1000;
};

const RUN_FLOOR = 0.05;

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
    const bar = 2.5;
    const dir = await Deno.makeTempDir({ prefix: "vl_scale_strappend_" });
    try {
      const [manySrc, oneSrc] = twoFiles(dir, genAppendLoop(40000), genJoinBuild(40000));
      let tMany = await runProg(manySrc);
      let tOne = await runProg(oneSrc);
      const bad = () => tMany > bar * Math.max(tOne, RUN_FLOOR);
      if (bad()) {
        tMany = Math.min(tMany, await runProg(manySrc));
        tOne = Math.min(tOne, await runProg(oneSrc));
      }
      if (VERBOSE) {
        console.log(
          `[scaling] string append loop: many ${tMany.toFixed(2)}s one ${tOne.toFixed(2)}s ` +
            `ratio ${(tMany / Math.max(tOne, RUN_FLOOR)).toFixed(2)} bar ${bar}`,
        );
      }
      if (bad()) {
        throw new Error(
          `string append loop: 40,000 appends cost ${tMany}s against ${tOne}s for the same ` +
            `800 KB string through std's builder (ratio ` +
            `${(tMany / Math.max(tOne, RUN_FLOOR)).toFixed(2)}, bar ${bar}) — the loop-local ` +
            "accumulator lowering (`strAccScan` / `emitStrAccAppend`, compiler/wasmEmit.vl) " +
            "stopped firing, so every append allocates an exact-fit backing and copies the " +
            "whole prefix again. Check what disqualified the binding.",
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
