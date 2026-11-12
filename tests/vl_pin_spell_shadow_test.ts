// THE PIN-SPELLING SHADOW (`monoPinSpellOf` / `monoPinSpellNote`, compiler/emit_mono.vl).
//
// Under `$VL_REP_SHADOW`, every instance mono makes notes each parameter pin and each type-parameter
// binding against `monoPinSpellOf` of its pin type — the spelling the naming rule gives that type
// (a record by its row's registered name, every other type structurally, union members sorted).
// Nothing reads the producer yet; the shadow is the measurement the switch is graded on.
//
// Each witness below lands in named classes with exact counts. The disagreeing rows are the
// control: a shadow that stopped computing the producer would read "producer has no spelling",
// and one that stopped comparing would read "agree", and either fails here.
//
// Run with:  deno test -A tests/vl_pin_spell_shadow_test.ts
import { filePath } from "./support/filePath.ts";
const ROOT = filePath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl${
  Deno.build.os === "windows" ? ".exe" : ""
}`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;

const exists = (p: string) => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};
const ENABLED = exists(VL) && exists(COMPILER);

const CASES: { name: string; src: string; want: string[] }[] = [
  {
    // A declared record, a union written out of the rule's order, and a list of a union: the
    // cascade's atom pin is the rule's own spelling, so all three agree.
    name: "record, union order",
    src: `type Circle = { r: i32 }
function id<T>(x: T): T { return x }
const c: Circle = { r: 2 }
print(id(c).r)
const u: string | i32 = 3
print(id(u))
const xs: (i32 | string)[] = [1, "a"]
print(id(xs).length)
`,
    want: [
      "param/agree ->  x3",
      "typaram/agree ->  x3",
    ],
  },
  {
    // A hole function's `=>` signature key, and two declared names over one row: the row's
    // registered name is the first declared, so `Circle` spells as `Dot`.
    name: "fn sig key, two names one row",
    src: `type Dot = { r: i32 }
type Circle = { r: i32 }
function inc(x: i32): i32 { return x + 1 }
function call1(f, x) { return f(x) }
function rr(p) { return p.r }
print(call1(inc, 4))
const c: Circle = { r: 2 }
const d: Dot = { r: 5 }
print(rr(d))
print(rr(c))
print(rr({ r: 7 }))
function first<T>(xs: T[]): T { return xs[0] }
const cs: Circle[] = [c]
print(first(cs).r)
`,
    want: [
      "param/agree ->  x4",
      "param/fn sig key -> =>i>i ~ (i32)=>i32 x1",
      "param/record inside, another name -> Circle[] ~ Dot[] x1",
      "typaram/record, another name -> Circle ~ Dot x1",
    ],
  },
];

Deno.test({
  name: "pin-spelling shadow: each witness's pins by class",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_pin_spell_" });
    try {
      const bad: string[] = [];
      for (const [i, c] of CASES.entries()) {
        const src = `${dir}/${i}.vl`;
        Deno.writeTextFileSync(src, c.src);
        const { stderr, stdout } = await new Deno.Command(VL, {
          args: [
            "build",
            src,
            "--compiler",
            COMPILER,
            "-o",
            `${dir}/${i}.wasm`,
          ],
          cwd: ROOT,
          stdout: "piped",
          stderr: "piped",
          env: {
            RUST_BACKTRACE: "0",
            NO_COLOR: "1",
            VL_STD: `${ROOT}/std`,
            VL_REP_SHADOW: "1",
          },
        }).output();
        const text = new TextDecoder().decode(stderr) +
          new TextDecoder().decode(stdout);
        const got = [...text.matchAll(/repAB\/pinSpell (.*)$/gm)]
          .map((m) => m[1]).sort();
        if (got.join("\n") !== [...c.want].sort().join("\n")) {
          bad.push(
            `${c.name}:\n    want: ${c.want.join(" | ")}\n    got:  ${
              got.join(" | ")
            }`,
          );
        }
      }
      if (bad.length) throw new Error(bad.join("\n  "));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
