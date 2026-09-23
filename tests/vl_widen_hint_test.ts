// EVERY FIX THE CONTAINER RULE PRINTS MUST BUILD (D2161, D2196).
//
// A refused list widening names up to two fixes: "Declare the destination `X` for a read-only
// view" and "copy it with `.map(F)`". A hint that leads to check-clean invalid wasm is worse
// than none, and the first round of this rule printed several: `readonly Shape[]` for a
// nullable destination, `readonly f64[]` for a list nested in another. This suite refuses each
// case at a binding and at an argument, reads the fixes out of the message, applies each one
// mechanically, and requires the result to RUN. A case where the message offers no applicable
// fix is asserted too, so a fix that goes missing is seen.
//
// `@X@` in a value marks the inner list a `.map` copy applies to; without one, the copy applies
// to the whole value.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-widen-hint] skipped — missing vl binary or seed wasm.");
}

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
].join("\n");

type Case = { dst: string; val: string; want: ("readonly" | "map")[] };

// `want` names the fixes the message must offer; every fix it offers must run either way.
const CASES: Case[] = [
  { dst: "(C | null)[]", val: "cs", want: ["readonly", "map"] },
  { dst: "f64[]", val: "ns", want: ["readonly", "map"] },
  { dst: "i64[]", val: "ns", want: ["readonly", "map"] },
  { dst: "f64[]", val: "fs", want: ["readonly", "map"] },
  { dst: "Shape[]", val: "rs", want: ["readonly", "map"] },
  { dst: "(Shape | null)[]", val: "rs", want: ["readonly", "map"] },
  { dst: "(string | null)[]", val: "ss", want: ["readonly", "map"] },
  { dst: "(K | null)[]", val: "ks", want: ["readonly", "map"] },
  { dst: "(boolean | null)[]", val: "bs", want: ["readonly", "map"] },
  // `.map` into a nullable union arm or nullable list is D2193; only `readonly` is offered.
  { dst: "(Circle | null)[]", val: "rs", want: ["readonly"] },
  { dst: "(i32[] | null)[]", val: "nss", want: ["readonly"] },
  // nested: the readonly fix names the outer list too
  { dst: "(C | null)[][]", val: "css", want: ["readonly"] },
  { dst: "(C | null)[][]", val: "[@cs@]", want: ["readonly", "map"] },
  { dst: "f64[][]", val: "nss", want: [] },
  // nullable destinations: a shared list may be a nullable view; a copy may not (D2196)
  { dst: "(C | null)[] | null", val: "cs", want: ["readonly", "map"] },
  { dst: "Shape[] | null", val: "rs", want: ["map"] },
  { dst: "readonly Shape[] | null", val: "rs", want: ["map"] },
  { dst: "f64[] | null", val: "ns", want: ["map"] },
  // a record field
  { dst: "H", val: "{ xs: @cs@ }", want: ["map"] },
  // a written source cannot take the readonly copy, so only `.map` is offered
  { dst: "Shape[]", val: "wr", want: ["map"] },
  { dst: "Shape[]", val: "mkc()", want: ["map"] },
];

const POSITIONS = [
  (dst: string, val: string) => `const w: ${dst} = ${val}\nprint(1)\n`,
  (dst: string, val: string) =>
    `function take(w: ${dst}) { print(1) }\ntake(${val})\n`,
];

const plain = (val: string) => val.replaceAll("@", "");
const mapped = (val: string, f: string) =>
  val.includes("@")
    ? val.replace(/@([^@]*)@/, (_, x) => `${x}${f}`)
    : `(${val})${f}`;

async function vl(verb: string, src: string, tag: string) {
  const dir = await Deno.makeTempDir({ prefix: "vl_widen_hint_" });
  const f = `${dir}/${tag}.vl`;
  await Deno.writeTextFile(f, `${PRELUDE}\n${src}`);
  const out = await new Deno.Command(VL, {
    args: [verb, f, "--compiler", COMPILER],
    env: nativeEnv(),
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
  }).output();
  await Deno.remove(dir, { recursive: true });
  const text = new TextDecoder().decode(out.stdout) +
    new TextDecoder().decode(out.stderr);
  return { code: out.code, text };
}

Deno.test({
  name:
    "every readonly / .map fix a container refusal prints compiles and runs",
  ignore: !ENABLED,
  fn: async () => {
    const fails: string[] = [];
    await Promise.all(
      CASES.flatMap((c, ci) =>
        POSITIONS.map(async (pos, pi) => {
          const tag = `c${ci}p${pi}`;
          const where = `${c.val} -> ${c.dst} (position ${pi})`;
          const refused = await vl("check", pos(c.dst, plain(c.val)), tag);
          if (refused.code === 0) {
            fails.push(`${where}: want a container refusal, got a clean check`);
            return;
          }
          const errs = [...refused.text.matchAll(/\[ERROR\]: (.*)/g)].map((m) =>
            m[1]
          );
          const msg = errs.find((e) =>
            e.includes("never widens implicitly") || e.includes("D2196") ||
            e.includes("WRITTEN THROUGH")
          );
          if (!msg) {
            fails.push(
              `${where}: want the container refusal, got ${
                JSON.stringify(errs)
              }`,
            );
            return;
          }
          const ro = msg.match(/Declare the destination `([^`]*)`/);
          const mp = msg.match(/opy it with `(\.map\([^`]*\))`/);
          const got: string[] = [];
          if (ro) got.push("readonly");
          if (mp) got.push("map");
          if (got.join() !== c.want.join()) {
            fails.push(
              `${where}: want fixes [${c.want}], got [${got}] in ${
                JSON.stringify(msg)
              }`,
            );
          }
          if (ro) {
            const r = await vl("run", pos(ro[1], plain(c.val)), tag + "ro");
            if (r.code !== 0 || r.text.trim() !== "1") {
              fails.push(
                `${where}: the readonly fix \`${ro[1]}\` does not run: ${
                  r.text.slice(0, 300)
                }`,
              );
            }
          }
          if (mp) {
            const r = await vl(
              "run",
              pos(c.dst, mapped(c.val, mp[1])),
              tag + "map",
            );
            if (r.code !== 0 || r.text.trim() !== "1") {
              fails.push(
                `${where}: the copy \`${mp[1]}\` does not run: ${
                  r.text.slice(0, 300)
                }`,
              );
            }
          }
        })
      ),
    );
    if (fails.length) {
      throw new Error(`${fails.length} hint failure(s):\n${fails.join("\n")}`);
    }
  },
});
