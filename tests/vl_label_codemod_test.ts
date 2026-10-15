// `scripts/codemods/label-at.vl` MIGRATES THE RETIRED LABEL SPELLING AND ONLY IT (D3374).
//
// The owner's 2026-09-30 ruling spells a label `@B`, and `{ name: … }` is then always an object
// literal, so the codemod has to tell a label written `B: {` from an object field written the
// same way, by what the parser before the ruling read. Each case is a source before and after;
// a second run must change nothing. plumb runs this on its hand-written sources, and on its
// generated units until the generator speaks `@`.
//
// The codemod was a `.py` file until T3 of the architecture refactor. The port was graded
// against it over tests/cases, std, an old-spelling copy of tests/cases and these cases, in
// both modes: stdout, exit code and the rewritten trees were byte-identical. Where the Python
// crashed on a non-ASCII letter in code, the port reads it as punctuation and carries on.
//
// No assertion library, per CLAUDE.md.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/codemods/label-at.vl`;

const CASES: [string, string, string][] = [
  [
    "jumps and loop labels",
    "outer: while true {\n  L: for x in xs {\n    if x { continue :L }\n    break :outer\n  }\n}\n",
    "@outer while true {\n  @L for x in xs {\n    if x { continue @L }\n    break @outer\n  }\n}\n",
  ],
  [
    "a block no jump names, mid-block and first in a body",
    "function f() {\n  B: { let x = 1 }\n  n = 2\n  C: {\n    n = 3\n  }\n}\n",
    "function f() {\n  @B { let x = 1 }\n  n = 2\n  @C {\n    n = 3\n  }\n}\n",
  ],
  [
    "a value, and a block that is a break's value",
    "const v = C: { o }\nwhile true { break B: { 1 } }\nconst w = D: { if c { break :D 1 }; 2 }\n",
    "const v = @C { o }\nwhile true { break (@B { 1 }) }\nconst w = @D { if c { break @D 1 }; 2 }\n",
  ],
  [
    "nested labelled blocks first in a body",
    "function f() {\n  A: {\n    B: {\n      C: { n = 1 }\n    }\n  }\n}\n",
    "function f() {\n  @A {\n    @B {\n      @C { n = 1 }\n    }\n  }\n}\n",
  ],
  [
    "objects and types are left alone",
    "function g(b: i32) { a: { b } }\nfunction h() { a: { type: 1 } }\n" +
    "function k(r: { type: string }) { r.type }\ntype T = {\n  a: i32\n  b: { c: i32 }\n}\n" +
    "const o = {\n  a: 1,\n  b: { c: 2 },\n}\nconst m: {[string]: i32} = Map()\n",
    "function g(b: i32) { a: { b } }\nfunction h() { a: { type: 1 } }\n" +
    "function k(r: { type: string }) { r.type }\ntype T = {\n  a: i32\n  b: { c: i32 }\n}\n" +
    "const o = {\n  a: 1,\n  b: { c: 2 },\n}\nconst m: {[string]: i32} = Map()\n",
  ],
  [
    "a body opening with a shorthand field is an object, as the parser reads it (D3475)",
    "function f(id: i32) { id, p: { x } }\nconst l = (id: i32) => {\n  id,\n  q: { y },\n}\n" +
    "function g(b: boolean) { if b { id, p: { x } } else { id, } }\n",
    "function f(id: i32) { id, p: { x } }\nconst l = (id: i32) => {\n  id,\n  q: { y },\n}\n" +
    "function g(b: boolean) { if b { id, p: { x } } else { id, } }\n",
  ],
  [
    "a field whose value is a loop is left alone (the #3326 review)",
    "function f() { return { f: while true { break 4 } } }\n" +
    "function g(): i32 { const o = { f: for i in 0 until 3 { if i == 2 { break i } } }\n  return o.f ?? -1 }\n" +
    "const xs = [{ f: while true { break 1 } }]\nprint(k({ f: while true { break 8 } }))\n" +
    "const w = { f: while true { break 4 } }\nconst u = { g: 1, f: for i in 0 until 3 { break i } }\n",
    "function f() { return { f: while true { break 4 } } }\n" +
    "function g(): i32 { const o = { f: for i in 0 until 3 { if i == 2 { break i } } }\n  return o.f ?? -1 }\n" +
    "const xs = [{ f: while true { break 1 } }]\nprint(k({ f: while true { break 8 } }))\n" +
    "const w = { f: while true { break 4 } }\nconst u = { g: 1, f: for i in 0 until 3 { break i } }\n",
  ],
  [
    "a body's loop label, an empty labelled block, and a lambda body's loop label",
    "function f() {\n  L: while true { break }\n}\nfunction g(): i32 {\n  X: { }\n  return 2\n}\n" +
    "const h = (k: i32) => { r: while true { break k } }\n",
    "function f() {\n  @L while true { break }\n}\nfunction g(): i32 {\n  @X { }\n  return 2\n}\n" +
    "const h = (k: i32) => { @r while true { break k } }\n",
  ],
  [
    "a block that reads like an object with a statement after it (D3273)",
    "function h() {\nC: {}\nn = 5\n}\nfunction k() {\n  C: { n }\n  n = 5\n}\nfunction obj() { a: { b }\n}\n",
    "function h() {\n@C {}\nn = 5\n}\nfunction k() {\n  @C { n }\n  n = 5\n}\nfunction obj() { a: { b }\n}\n",
  ],
  [
    "comments and strings are left alone, holes are code",
    '// B: { break :B }\nconst s = "L: while { break :L }"\nprint("\\{X: { 1 }}")\n',
    '// B: { break :B }\nconst s = "L: while { break :L }"\nprint("\\{@X { 1 }}")\n',
  ],
];

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-label-codemod] skipped — missing vl binary or seed wasm.");
}

async function migrate(file: string): Promise<string> {
  const { code, stdout } = await new Deno.Command(VL, {
    args: ["run", SCRIPT, "--", file],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  if (code !== 0 && code !== 1) throw new Error(`codemod rc ${code}: ${new TextDecoder().decode(stdout)}`);
  return Deno.readTextFile(file);
}

for (const [name, before, want] of CASES) {
  Deno.test({
    name: `label-at codemod: ${name}`,
    ignore: !ENABLED,
    fn: async () => {
      const dir = await Deno.makeTempDir({ prefix: "vl_label_at_" });
      try {
        const file = `${dir}/m.vl`;
        await Deno.writeTextFile(file, before);
        const got = await migrate(file);
        if (got !== want) throw new Error(`want:\n${want}\n---\ngot:\n${got}`);
        const again = await migrate(file);
        if (again !== want) throw new Error(`a second run changed it:\n${again}`);
      } finally {
        await Deno.remove(dir, { recursive: true });
      }
    },
  });
}
