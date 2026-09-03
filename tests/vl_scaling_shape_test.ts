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

// THREE AXES ARE SUPER-LINEAR TODAY and carry a bar above their measured ratio rather
// than the default. That is recorded DEBT, not tolerance: each names the function that
// makes it so, and every one is a name-keyed registry answering a lookup by linear scan
// — the track `__str_eq__` has topped the self-compile profile since #2419 closed the
// arena scans. Lower the bar when the registry it names stops being a list.
const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
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
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: `vl_scale_${axis}_` });
  try {
    const [manySrc, oneSrc] = await mk(dir);
    let tMany = await build(manySrc, `${dir}/many.wasm`);
    let tOne = await build(oneSrc, `${dir}/one.wasm`);
    const bad = () => tMany > bar * Math.max(tOne, FLOOR);
    if (bad()) {
      tMany = Math.min(tMany, await build(manySrc, `${dir}/many.wasm`));
      tOne = Math.min(tOne, await build(oneSrc, `${dir}/one.wasm`));
    }
    if (VERBOSE) {
      console.log(
        `[scaling] ${axis}: many ${tMany.toFixed(2)}s one ${tOne.toFixed(2)}s ` +
          `ratio ${(tMany / Math.max(tOne, FLOOR)).toFixed(2)} bar ${bar}`,
      );
    }
    if (bad()) {
      throw new Error(
        `${axis}: the many-entity arm cost ${tMany}s against ${tOne}s for the same work ` +
          `reshaped (ratio ${(tMany / Math.max(tOne, FLOOR)).toFixed(2)}, bar ${bar}) — ` +
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

const axis = (name: string, bar: number, note: string, mk: (d: string) => [string, string]) =>
  Deno.test({
    name: `scaling shape: ${name}`,
    ignore: !ENABLED,
    fn: () => gradePair(name, bar, note, mk),
  });

// Measured 2026-09-03, box load 3 to 101 — absolute times moved 3x over that range while
// the four LINEAR axes' ratios moved under 0.12 (1.02/1.02/1.03, 1.19/1.17/1.18,
// 1.32/1.32/1.29, 1.13/1.02/1.01). The three super-linear ones move up to 0.76
// (2.22/1.77/2.21, 2.47/1.99/2.58, 3.61/4.13/4.37), which is the other reason their bars
// sit well clear of the measurement. Each line below is many/one/ratio.

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

// 1.86 / 1.41 / 1.32.
axis("unions", 2.5, "A per-union cost is scaling with the union registry.", (d) =>
  twoFiles(d, genUnions(800, 1), genUnions(800, 20)));

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
// The three super-linear axes' bars carry ~2x headroom over the IDLE ratio (modules 2.58,
// closures 2.22, generic pins 4.58): a ratio is load-tolerant but not load-proof — generic
// pins read 6.16 against the old bar of 6 inside a fanned-out gate at load 92, a
// comment-only PR. A doubling of the class (a new scan per pin) still clears every bar.
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

// 1.68 / 0.38 / 4.37 — the widest gap in the family, and super-linear in the pin count
// (0.23s at 200 pins, 0.84s at 400, 3.23s at 800). `collectA` is 68% inclusive on the
// many arm against nothing on the one arm; its per-annotation intern goes through
// `tyTopIndexOf` (compiler/tyname.vl) into `__str_eq__`, a linear scan of the type-name
// registry, so N pins mint N rows and cost N^2 comparisons.
axis("generic pins", 9.0, "`collectA` interns each pin through a linear registry scan.", (d) =>
  twoFiles(d, genPins(400, true), genPins(400, false)));
