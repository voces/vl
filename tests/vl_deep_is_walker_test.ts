// ONE WALKER PAIR PER DISTINCT TARGET, however many `is` sites name it.
//
// A deep `is` over a `Json` value lowers to a call into a GENERATED VL walker pair — a
// predicate `__vlJsonIs_<k>` and a builder `__vlJsonGet_<k>` (`compiler/json_walk.vl`) —
// memoised on the (target spelling, receiver spelling) pair. That memo is the difference
// between a feature and a code-size cliff: without it a config reader that tests `is Cfg`
// in five places carries five copies of the same tree walk.
//
// THE ASSERTION IS A DIFFERENTIAL, NOT AN ABSOLUTE COUNT. An emitted module's function
// count also carries the user's own functions and whichever shared runtime helpers the
// program happens to enable (the string trio, the map probe, the UTF-8 codec), and those
// move for reasons that have nothing to do with this feature. So three programs are
// compiled that differ ONLY in their `is` sites, and the count is read as a delta:
//
//   one       one site,  `is Cfg`                     → baseline
//   two_same  two sites, both `is Cfg`                → +1 (the second user function only)
//   two_diff  two sites, `is Cfg` and `is string[]`   → +3 (a user function + a NEW pair)
//
// A regression that de-duplicated nothing would make `two_same` +3 as well; one that
// over-merged two different targets would make `two_diff` +1. Neither is visible in a
// run-the-program test, because both compile and both print the right answer.
//
// The functions are counted off `wasm-dis` output rather than the binary, per CLAUDE.md:
// the disassembler is at `node_modules/.bin/wasm-dis` and is not on PATH.
//
// GATING mirrors the other seed-backed suites: `SELFHOST_NATIVE_ALIGN=1` plus the vl
// binary, the seed and `wasm-dis`. Absent any, the case registers ignored with a note.
// No assertion library, per CLAUDE.md — every failure is a `throw new Error` with want/got.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER) && exists(WASM_DIS);
if (GATED && !ENABLED) {
  console.warn(
    "[deep-is-walker] skipped — missing vl binary, seed or wasm-dis. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/refresh-compiler.sh\n  npm ci",
  );
}

const PRE = `type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
type Cfg = { port: i32, host: string | null }
`;

const PROGRAMS: Record<string, string> = {
  one: `${PRE}
function a(r: Json): i32 { if r is Cfg { return r.port }  0 }
const m: { [string]: Json } = Map()
print(a(m))
`,
  two_same: `${PRE}
function a(r: Json): i32 { if r is Cfg { return r.port }  0 }
function b(r: Json): i32 { if r is Cfg { return r.port + 1 }  0 }
const m: { [string]: Json } = Map()
print(a(m) + b(m))
`,
  two_diff: `${PRE}
function a(r: Json): i32 { if r is Cfg { return r.port }  0 }
function b(r: Json): i32 { if r is string[] { return r.length }  0 }
const m: { [string]: Json } = Map()
print(a(m) + b(m))
`,
};

/** Compile `src`, disassemble it, and count its `(func …)` definitions. */
function funcCount(dir: string, name: string, src: string): number {
  const vl = `${dir}/${name}.vl`;
  const wasm = `${dir}/${name}.wasm`;
  Deno.writeTextFileSync(vl, src);
  const build = new Deno.Command(VL, {
    args: ["build", vl, "-o", wasm, "--compiler", COMPILER],
    env: { VL_STD: `${ROOT}/std` },
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (build.code !== 0) {
    throw new Error(
      `building ${name} failed (rc ${build.code}): ${
        new TextDecoder().decode(build.stderr)
      }`,
    );
  }
  const dis = new Deno.Command(WASM_DIS, {
    args: [wasm],
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (dis.code !== 0) {
    throw new Error(
      `wasm-dis ${name} failed (rc ${dis.code}): ${
        new TextDecoder().decode(dis.stderr)
      }`,
    );
  }
  const wat = new TextDecoder().decode(dis.stdout);
  return wat.split("\n").filter((l) => l.startsWith(" (func ")).length;
}

Deno.test({
  name:
    "deep `is`: two sites naming one target emit ONE walker pair; a second target adds one",
  ignore: !ENABLED,
  fn: () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-deep-is-" });
    try {
      const counts: Record<string, number> = {};
      for (const [name, src] of Object.entries(PROGRAMS)) {
        counts[name] = funcCount(dir, name, src);
      }
      const sameDelta = counts.two_same - counts.one;
      const diffDelta = counts.two_diff - counts.one;
      if (sameDelta !== 1) {
        throw new Error(
          `two \`is Cfg\` sites must add ONLY the second user function: ` +
            `want +1, got +${sameDelta} (one=${counts.one}, two_same=${counts.two_same}). ` +
            `A second walker pair means the (target, receiver) memo in \`jwRecordSite\` stopped deduping.`,
        );
      }
      if (diffDelta !== 3) {
        throw new Error(
          `a SECOND target must add a user function plus one walker pair: ` +
            `want +3, got +${diffDelta} (one=${counts.one}, two_diff=${counts.two_diff}). ` +
            `Fewer means two different targets were merged; more means the pair grew.`,
        );
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
