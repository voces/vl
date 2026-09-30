// PARAMETER NAMES IN A FUNCTION TYPE ARE NOT ITS IDENTITY (owner ruling A1, DECISIONS.md
// "Parameter names in a function type are documentation"). One program, spelled four ways —
// every function type unnamed, named, renamed, and named on alternate lines only (so values
// cross between spellings that disagree) — must build to the SAME BYTES and print the same
// thing. A name that leaked into a canon string, a type key, a join, a monomorphization key
// or a union's member set would split an instance or a type and change the module.
//
// `@name:` in the template marks a function-type parameter name; each variant decides what
// it becomes. The positions match `tests/cases/functions/fn-type-param-names-*.vl`, which
// grade the printed values.
//
// GATING: needs the built binary and the seed; a missing prerequisite self-ignores.

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER);

const TEMPLATE = `type Un = (@x: i32) => i32
type Bin = (@a: i32, @b: i32) => i32
type S = { f: (@x: i32) => i32, g: Bin }
type Box<T> = { v: T }
type NF = Un | null
type Pair<A, B> = { a: A, b: B }
function dbl(x: i32) { x * 2 }
function ex(s: string) { s + "!" }
function add(a: i32, b: i32) { a + b }
function apply(f: (@x: i32) => i32, v: i32) { f(v) }
function mk(k: i32): (@x: i32) => i32 { (v: i32) => v * k }
function id<T>(x: T): T { x }
function callG<T>(f: (@x: T) => T, v: T): T { f(v) }
function twice(f: (@cb: (@x: i32) => i32, @v: i32) => i32) { f(dbl, 5) }
function run(v: ((@x: i32) => i32) | string) {
  if v is string { return v }
  "fn \\{v(4)}"
}
function orNull(c: boolean): ((@x: i32) => i32) | null {
  if c { return dbl }
  null
}
const u: Un = dbl
const u2: (@y: i32) => i32 = u
let u3: (@z: i32) => i32 = mk(3)
u3 = u2
const s: S = { f: u, g: add }
const s2: { f: (@q: i32) => i32, g: (@m: i32, @n: i32) => i32 } = s
const fs: ((@x: i32) => i32)[] = [dbl, u, u2, mk(4)]
const fs2: Un[] = fs
const bx: Box<(@x: i32) => i32> = { v: dbl }
const bx2: Box<Un> = bx
const mp: {[string]: (@x: i32) => i32} = Map()
mp["a"] = u2
const p: Pair<(@x: i32) => i32, (@y: string) => string> = { a: dbl, b: ex }
const p2: Pair<Un, (@t: string) => string> = p
const nfs: NF[] = [dbl, null]
const pick = if u(0) == 0 { u } else { u2 }
print(pick(23) + u3(3) + s2.f(7) + s2.g(8, 9) + fs[3](10) + fs2[1](11) + bx2.v(13))
print((mp["a"] ?? dbl)(14) + apply(u2, 15) + id(u)(18) + id(u2)(19) + callG(u, 20))
print(twice((cb: (@x: i32) => i32, v: i32): i32 => cb(v) + 1))
print(run(dbl) + " " + run("str") + " " + p2.b("yo") + " \\{nfs.length}")
const on = orNull(true)
if on != null { print(on(22)) }
`;

const MARK = /@([A-Za-z_]\w*):\s*/g;

const variant = (kind: "unnamed" | "named" | "renamed" | "alternate"): string =>
  TEMPLATE.split("\n").map((line, i) => {
    if (kind === "unnamed" || (kind === "alternate" && i % 2 === 1)) {
      return line.replace(MARK, "");
    }
    if (kind === "renamed") return line.replace(MARK, (_m, n) => `${n}Z: `);
    return line.replace(MARK, (_m, n) => `${n}: `);
  }).join("\n");

const vl = async (args: string[]) => {
  const r = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    env: nativeEnv({}),
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr);
  return { ok: r.success, text };
};

Deno.test({
  name: "fn-type parameter names: four spellings build to the same bytes and print the same",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-fn-type-param-names-" });
    try {
      const kinds = ["unnamed", "named", "renamed", "alternate"] as const;
      const bytes: Record<string, Uint8Array> = {};
      const outs: Record<string, string> = {};
      for (const k of kinds) {
        Deno.writeTextFileSync(`${dir}/${k}.vl`, variant(k));
        const b = await vl(["build", `${dir}/${k}.vl`, "-o", `${dir}/${k}.wasm`]);
        if (!b.ok) throw new Error(`${k}: vl build failed:\n${b.text}`);
        bytes[k] = Deno.readFileSync(`${dir}/${k}.wasm`);
        const r = await vl(["run", `${dir}/${k}.vl`]);
        if (!r.ok) throw new Error(`${k}: vl run failed:\n${r.text}`);
        outs[k] = r.text;
      }
      const want = "171\n172\n11\nfn 8 str yo! 2\n44\n";
      if (outs.unnamed !== want) {
        throw new Error(`unnamed: want ${JSON.stringify(want)}, got ${JSON.stringify(outs.unnamed)}`);
      }
      const same = (a: Uint8Array, b: Uint8Array) =>
        a.length === b.length && a.every((v, i) => v === b[i]);
      for (const k of kinds) {
        if (outs[k] !== outs.unnamed) {
          throw new Error(`${k}: printed ${JSON.stringify(outs[k])}, unnamed printed ${JSON.stringify(outs.unnamed)}`);
        }
        if (!same(bytes[k], bytes.unnamed)) {
          throw new Error(
            `${k}: ${bytes[k].length} bytes, unnamed ${bytes.unnamed.length} — a parameter name reached the module`,
          );
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
