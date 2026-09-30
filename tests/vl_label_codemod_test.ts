// `scripts/codemods/label-at.py` MIGRATES THE RETIRED LABEL SPELLING AND ONLY IT (D3374).
//
// The owner's 2026-09-30 ruling spells a label `@B`, and `{ name: … }` is then always an object
// literal, so the codemod has to tell a label written `B: {` from an object field written the
// same way, by what the parser before the ruling read. Each case is a source before and after;
// a second run must change nothing. plumb runs this on its hand-written sources, and on its
// generated units until the generator speaks `@`.
//
// No compiler and no seed; no assertion library, per CLAUDE.md.

import { ROOT } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/codemods/label-at.py`;

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
    "comments and strings are left alone, holes are code",
    '// B: { break :B }\nconst s = "L: while { break :L }"\nprint("\\{X: { 1 }}")\n',
    '// B: { break :B }\nconst s = "L: while { break :L }"\nprint("\\{@X { 1 }}")\n',
  ],
];

async function python(): Promise<string> {
  for (const p of [Deno.env.get("PYTHON"), "/usr/bin/python3", "python3"]) {
    if (p === undefined) continue;
    try {
      const { code } = await new Deno.Command(p, { args: ["-c", "print(1)"], stdout: "null", stderr: "null" })
        .output();
      if (code === 0) return p;
    } catch { /* not on PATH — try the next */ }
  }
  throw new Error("no python3 to run the codemod with");
}

async function migrate(py: string, file: string): Promise<string> {
  const { code, stderr } = await new Deno.Command(py, { args: [SCRIPT, file], stdout: "null", stderr: "piped" })
    .output();
  if (code !== 0 && code !== 1) throw new Error(`codemod rc ${code}: ${new TextDecoder().decode(stderr)}`);
  return Deno.readTextFile(file);
}

for (const [name, before, want] of CASES) {
  Deno.test(`label-at codemod: ${name}`, async () => {
    const py = await python();
    const dir = await Deno.makeTempDir({ prefix: "vl_label_at_" });
    try {
      const file = `${dir}/m.vl`;
      await Deno.writeTextFile(file, before);
      const got = await migrate(py, file);
      if (got !== want) throw new Error(`want:\n${want}\n---\ngot:\n${got}`);
      const again = await migrate(py, file);
      if (again !== want) throw new Error(`a second run changed it:\n${again}`);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  });
}
