// EVERY FIX THE CONTAINER RULE PRINTS MUST BUILD, AND BUILD THE RIGHT VALUE (D2161, D2196).
//
// A refused list widening names up to three fixes: "Declare the destination `X` for a read-only
// view", "copy it with `.map(F)`" and "Build the source as `X`". A hint that leads to
// check-clean invalid wasm is worse than none, and the first round of this rule printed
// several. This suite refuses each case at a binding and at an argument, reads every fix out
// of the message, applies it mechanically, and requires the result to print the expected
// element of the delivered value, so a copy that converts wrongly is caught as well as one
// that does not build. A printed fix this suite cannot apply is itself a failure.
//
// `@X@` in a value marks the inner list a `.map` copy applies to; without one, the copy applies
// to the whole value. "Build the source" re-declares the prelude binding (or function result)
// the value names.
//
// @test-timing native

import { checkBatch } from "./support/checkBatch.ts";
import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-widen-hint] skipped — missing vl binary or seed wasm.");
}

// One declaration per line, so a "Build the source" fix can re-declare exactly one of them.
const PRELUDE = [
  "type C = { n: i32 }",
  "type Circle = { r: i32 }",
  "type Sq = { s: i32 }",
  "type Shape = Circle | Sq",
  'type K = "a" | "b"',
  "type H = { xs: (C | null)[] }",
  "const cs: C[] = [{ n: 1 }]",
  "const ns: i32[] = [1, 2]",
  "const fs: f32[] = [1.5]",
  "const rs: Circle[] = [{ r: 2 }]",
  'const ss: string[] = ["a"]',
  'const ks: K[] = ["a"]',
  "const bs: boolean[] = [true]",
  "const nss: i32[][] = [[1]]",
  "const css: C[][] = [[{ n: 1 }]]",
  "const wr: Circle[] = [{ r: 3 }]",
  "wr.push({ r: 4 })",
  "function mkc(): Circle[] { [{ r: 5 }] }",
];

type Fix = "readonly" | "map" | "build";
type Case = {
  dst: string;
  val: string;
  want: Fix[];
  show: string;
  out: string;
  // Also refused through a generic `T[]` the call pins, which must print the same fixes (D3402).
  pin?: boolean;
};

const nnC = "const e = w[0]\nif e != null { print(e.n) }";
const circ = "const e = w[0]\nif e is Circle { print(e.r) }";
const nnV = "const e = w[0]\nif e != null { print(e) }";

// `want` names the fixes the message must offer; every fix it offers must run either way.
const CASES: Case[] = [
  {
    dst: "(C | null)[]",
    val: "cs",
    want: ["readonly", "map"],
    show: nnC,
    out: "1",
  },
  {
    dst: "f64[]",
    val: "ns",
    want: ["readonly", "map"],
    show: "print(w[1] / 4.0)",
    out: "0.5",
    pin: true,
  },
  {
    dst: "i64[]",
    val: "ns",
    want: ["readonly", "map"],
    show: "print(w[1])",
    out: "2",
  },
  {
    dst: "f64[]",
    val: "fs",
    want: ["readonly", "map"],
    show: "print(w[0])",
    out: "1.5",
  },
  {
    dst: "Shape[]",
    val: "rs",
    want: ["readonly", "map"],
    show: circ,
    out: "2",
  },
  {
    dst: "(Shape | null)[]",
    val: "rs",
    want: ["readonly", "map"],
    show: "const e = w[0]\nif e != null {\n  if e is Circle { print(e.r) }\n}",
    out: "2",
  },
  {
    dst: "(string | null)[]",
    val: "ss",
    want: ["readonly", "map"],
    show: nnV,
    out: "a",
  },
  {
    dst: "(K | null)[]",
    val: "ks",
    want: ["readonly", "map"],
    show: nnV,
    out: "a",
  },
  {
    dst: "(boolean | null)[]",
    val: "bs",
    want: ["readonly", "map"],
    show: nnV,
    out: "true",
  },
  // `.map` into a nullable union arm builds (D2193), and into a nullable list (D12901).
  {
    dst: "(Circle | null)[]",
    val: "rs",
    want: ["readonly", "map"],
    show: "const e = w[0]\nif e != null { print(e.r) }",
    out: "2",
  },
  {
    dst: "(i32[] | null)[]",
    val: "nss",
    want: ["readonly", "map"],
    show: "const e = w[0]\nif e != null { print(e[0]) }",
    out: "1",
  },
  // nested: the readonly fix names the outer list too
  {
    dst: "(C | null)[][]",
    val: "css",
    want: ["readonly"],
    show: "const e = w[0][0]\nif e != null { print(e.n) }",
    out: "1",
  },
  {
    dst: "(C | null)[][]",
    val: "[@cs@]",
    want: ["readonly", "map"],
    show: "const e = w[0][0]\nif e != null { print(e.n) }",
    out: "1",
  },
  {
    dst: "f64[][]",
    val: "nss",
    want: ["build"],
    show: "print(w[0][0] / 4.0)",
    out: "0.25",
  },
  // nullable destinations: a shared list may be a nullable view; a copy may not (D2196)
  {
    dst: "(C | null)[] | null",
    val: "cs",
    want: ["readonly", "map"],
    show: "if w != null {\n  const e = w[0]\n  if e != null { print(e.n) }\n}",
    out: "1",
  },
  {
    dst: "Shape[] | null",
    val: "rs",
    want: ["map"],
    show:
      "if w != null {\n  const e = w[0]\n  if e is Circle { print(e.r) }\n}",
    out: "2",
  },
  {
    dst: "readonly Shape[] | null",
    val: "rs",
    want: ["map"],
    show:
      "if w != null {\n  const e = w[0]\n  if e is Circle { print(e.r) }\n}",
    out: "2",
  },
  {
    dst: "f64[] | null",
    val: "ns",
    want: ["map"],
    show: "if w != null { print(w[1] / 4.0) }",
    out: "0.5",
  },
  // a record field reached through a literal: the copy applies to the field's value
  {
    dst: "H",
    val: "{ xs: @cs@ }",
    want: ["map"],
    show: "const e = w.xs[0]\nif e != null { print(e.n) }",
    out: "1",
  },
  // a written source, or a call result, cannot take the readonly copy: `.map` or a rebuild
  {
    dst: "Shape[]",
    val: "wr",
    want: ["map"],
    show: "const e = w[1]\nif e is Circle { print(e.r) }",
    out: "4",
  },
  { dst: "Shape[]", val: "mkc()", want: ["map"], show: circ, out: "5" },
];

const POSITIONS = [
  (dst: string, val: string, show: string) =>
    `const w: ${dst} = ${val}\n${show}\n`,
  (dst: string, val: string, show: string) =>
    `function take(w: ${dst}) {\n${show}\n}\ntake(${val})\n`,
];

// The argument position reached through a generic list parameter, for a case marked `pin`.
const PIN_POSITION = (dst: string, val: string, show: string) =>
  `function take(w: ${dst}) {\n${show}\n}\nfunction via<T>(v: T[]) { take(v) }\nvia(${val})\n`;

const plain = (val: string) => val.replaceAll("@", "");
const mapped = (val: string, f: string) =>
  val.includes("@")
    ? val.replace(/@([^@]*)@/, (_, x) => `${x}${f}`)
    : `(${val})${f}`;

// The prelude with the declaration `val` names re-typed to `ty`, or null when `val` names none.
function rebuilt(val: string, ty: string): string[] | null {
  const call = val.match(/^(\w+)\(\)$/);
  const name = call ? call[1] : /^\w+$/.test(val) ? val : null;
  if (!name) return null;
  const re = call
    ? new RegExp(`^function ${name}\\(\\): [^{]*\\{`)
    : new RegExp(`^const ${name}: [^=]*=`);
  const at = PRELUDE.findIndex((l) => re.test(l));
  if (at < 0) return null;
  const out = [...PRELUDE];
  out[at] = call
    ? out[at].replace(re, `function ${name}(): ${ty} {`)
    : out[at].replace(re, `const ${name}: ${ty} =`);
  return out;
}

// Every case's refusal comes from ONE `vl check --batch --json`, and every fix it offers
// runs in ONE `vl run --batch`; each case is still its own file, graded on its own record.
const write = async (
  dir: string,
  tag: string,
  prelude: string[],
  src: string,
) => {
  const f = `${dir}/${tag}.vl`;
  await Deno.writeTextFile(f, `${prelude.join("\n")}\n${src}`);
  return f;
};

type RunJob = {
  where: string;
  label: string;
  out: string;
  file: string;
  tag: string;
};

const runAll = async (dir: string, jobs: RunJob[], fails: string[]) => {
  if (jobs.length === 0) return;
  const outDir = `${dir}/out`;
  await Deno.mkdir(outDir);
  const r = await new Deno.Command(VL, {
    args: [
      "run",
      "--batch",
      "--out-dir",
      outDir,
      ...jobs.map((j) => j.file),
      "--compiler",
      COMPILER,
    ],
    env: nativeEnv(),
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!r.success) {
    throw new Error(
      `vl run --batch failed (exit ${r.code}): ${
        new TextDecoder().decode(r.stderr)
      }`,
    );
  }
  for (const j of jobs) {
    let out: string;
    try {
      out = await Deno.readTextFile(`${outDir}/${j.tag}.vl.out`);
    } catch {
      throw new Error(
        `${j.where}: vl run --batch wrote no output for the ${j.label} fix`,
      );
    }
    let err: string | null = null;
    try {
      err = await Deno.readTextFile(`${outDir}/${j.tag}.vl.err`);
    } catch { /* no .err: the case ran */ }
    if (err !== null || out.trim() !== j.out) {
      fails.push(
        `${j.where}: the ${j.label} fix does not print ${j.out}: ${
          (out + (err ?? "")).slice(0, 300)
        }`,
      );
    }
  }
};

Deno.test({
  name:
    "every fix a container refusal prints compiles, runs and delivers the right value",
  ignore: !ENABLED,
  fn: async () => {
    const fails: string[] = [];
    const dir = await Deno.makeTempDir({ prefix: "vl_widen_hint_" });
    try {
      const at = CASES.flatMap((c, ci) =>
        (c.pin ? [...POSITIONS, PIN_POSITION] : POSITIONS).map((pos, pi) => ({
          c,
          ci,
          pos,
          pi,
        }))
      );
      const files: string[] = [];
      for (const { c, ci, pos, pi } of at) {
        files.push(
          await write(
            dir,
            `c${ci}p${pi}`,
            PRELUDE,
            pos(c.dst, plain(c.val), c.show),
          ),
        );
      }
      const recs = await checkBatch(files, { cwd: ROOT });
      const jobs: RunJob[] = [];
      for (let k = 0; k < at.length; k++) {
        const { c, ci, pos, pi } = at[k];
        const tag = `c${ci}p${pi}`;
        const where = `${c.val} -> ${c.dst} (position ${pi})`;
        const run = async (
          label: string,
          prelude: string[],
          dst: string,
          val: string,
        ) => {
          const file = await write(
            dir,
            tag + label,
            prelude,
            pos(dst, val, c.show),
          );
          jobs.push({ where, label, out: c.out, file, tag: tag + label });
        };
        const refused = recs[k];
        if (refused.exit === 0) {
          fails.push(`${where}: want a container refusal, got a clean check`);
          continue;
        }
        const errs = refused.diagnostics.filter((d) => d.severity === "error")
          .map((d) => d.message);
        const msg = errs.find((e) =>
          e.includes("never widens") || e.includes("D2196") ||
          e.includes("WRITTEN THROUGH")
        );
        if (!msg) {
          fails.push(
            `${where}: want the container refusal, got ${JSON.stringify(errs)}`,
          );
          continue;
        }
        const ro = msg.match(/Declare the destination `([^`]*)`/);
        const mp = msg.match(/opy it with `(\.map\([^`]*\))`/);
        const bd = msg.match(/Build the source as `([^`]*)`/);
        const got: Fix[] = [];
        if (ro) got.push("readonly");
        if (bd) got.push("build");
        if (mp) got.push("map");
        if ([...got].sort().join() !== [...c.want].sort().join()) {
          fails.push(
            `${where}: want fixes [${c.want}], got [${got}] in ${
              JSON.stringify(msg)
            }`,
          );
        }
        if (ro) await run("readonly", PRELUDE, ro[1], plain(c.val));
        if (mp) await run("map", PRELUDE, c.dst, mapped(c.val, mp[1]));
        if (bd) {
          const pre = rebuilt(plain(c.val), bd[1]);
          if (!pre) {
            fails.push(
              `${where}: a build fix names no declaration: ${
                JSON.stringify(msg)
              }`,
            );
          } else await run("build", pre, c.dst, plain(c.val));
        }
      }
      await runAll(dir, jobs, fails);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
    if (fails.length) {
      throw new Error(`${fails.length} hint failure(s):\n${fails.join("\n")}`);
    }
  },
});
