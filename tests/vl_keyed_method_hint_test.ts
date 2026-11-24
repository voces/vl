// THE KEYED-METHOD HINT FIRES ONLY WHERE THE METHOD WOULD RUN.
//
// A refused `a.ltA(b)` or `ltA(a, b)` gains `; did you mean \`a.lt(b)\`, the \`lt\` that takes \`A\`?`
// when a receiver-overload set `lt` the call reaches has a candidate on the declared type the
// name ends in (`ovKeyedSplit`, compiler/check_overload.vl). The corpus oracle matches messages
// by substring, so it cannot see a hint that should be ABSENT; this file compares whole messages.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-keyed-method-hint] skipped — missing vl binary or seed wasm.",
  );
}

const BASE = [
  "type A = { x: i32 }",
  "type B = { y: string }",
  "type C = { z: boolean }",
  "function lt(self: A, o: A): boolean { return self.x < o.x }",
  "function lt(self: B, o: B): boolean { return self.y < o.y }",
  "function foo(self: A): i32 { return self.x }",
  "const a: A = { x: 1 }",
  "const a2: A = { x: 2 }",
  'const b: B = { y: "s" }',
  "const c: C = { z: true }",
].join("\n");

// The error messages `vl check --json` reports for `src`, in order.
const errorsOf = async (src: string): Promise<string[]> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_keyed_hint_" });
  try {
    await Deno.writeTextFile(`${dir}/main.vl`, src + "\n");
    const { stdout } = await new Deno.Command(VL, {
      args: ["check", "--json", "main.vl", "--compiler", COMPILER],
      cwd: dir,
      env: nativeEnv(),
      stdout: "piped",
      stderr: "piped",
    }).output();
    const out = new TextDecoder().decode(stdout);
    const msgs: string[] = [];
    for (
      const m of out.matchAll(
        /"severity":"error"[^}]*?"message":"((?:[^"\\]|\\.)*)"/g,
      )
    ) {
      msgs.push(JSON.parse(`"${m[1]}"`));
    }
    return msgs;
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const CASES: { name: string; line: string; want: string }[] = [
  {
    name: "a member call on a set's head type suggests the method",
    line: "print(a.ltA(a2))",
    want:
      "no field 'ltA' on A; did you mean `a.lt(a2)`, the `lt` that takes `A`?",
  },
  {
    name: "a plain call suggests the method on its first argument",
    line: "print(ltA(a, a2))",
    want:
      "undeclared identifier 'ltA'; did you mean `a.lt(a2)`, the `lt` that takes `A`?",
  },
  {
    name: "a suffix that is a type but no head of the set does not suggest",
    line: "print(c.ltC(c))",
    want: "no field 'ltC' on C",
  },
  {
    name: "a prefix with no set does not suggest",
    line: "print(a.fooA())",
    want: "no field 'fooA' on A",
  },
  {
    name: "a local binding that shadows the method does not suggest",
    line: "function g(lt: i32) { print(a.ltA(a2)) }\ng(1)",
    want: "no field 'ltA' on A",
  },
  {
    name: "a receiver of another head does not suggest",
    line: "print(b.ltA(a2))",
    want: "no field 'ltA' on B",
  },
];

// V1/V2's value spellings and near misses through std:simd: a function value or a call whose
// argument count no candidate takes keeps master's text; the one call that would run gains the hint.
const SIMD =
  'import { splatF32, splatU8 } from "std:simd"\nconst a = splatF32(1.0)\nconst b = splatF32(2.0)';
const SIMD_CASES: { name: string; line: string; want: string }[] = [
  {
    name: "a retired name as a function value keeps master's import note",
    line: "const f = ltF32x4",
    want:
      "undeclared identifier 'ltF32x4'; did you mean 'F32x4'? — `F32x4` is exported by \"std:simd\"; add it to the existing `import { … } from \"std:simd\"`",
  },
  {
    name: "a retired name with no near type as a function value gets no hint",
    line: "const f = addSatU8x16",
    want: "undeclared identifier 'addSatU8x16'",
  },
  {
    name: "a retired member read as a value gets no hint",
    line: "const g = a.ltF32x4",
    want: "member access '.ltF32x4' on non-object F32x4",
  },
  {
    name:
      "a retired member call whose argument count no candidate takes gets no hint",
    line: "print(a.ltF32x4())",
    want: "member access '.ltF32x4' on non-object F32x4",
  },
  {
    name:
      "the near-miss call replaces master's type note with the method (a deliberate supersession)",
    line: "print(ltF32x4(a, b).anyTrue())",
    want:
      "undeclared identifier 'ltF32x4'; did you mean `a.lt(b)`, the `lt` that takes `F32x4`?",
  },
];
for (const k of SIMD_CASES) {
  Deno.test({
    name: `keyed-method hint (std:simd): ${k.name}`,
    ignore: !ENABLED,
    async fn() {
      const got = await errorsOf(`${SIMD}\n${k.line}`);
      if (got.length !== 1 || got[0] !== k.want) {
        throw new Error(
          `want exactly [${JSON.stringify(k.want)}], got ${
            JSON.stringify(got)
          }`,
        );
      }
    },
  });
}

for (const k of CASES) {
  Deno.test({
    name: `keyed-method hint: ${k.name}`,
    ignore: !ENABLED,
    async fn() {
      const got = await errorsOf(`${BASE}\n${k.line}`);
      if (got.length !== 1 || got[0] !== k.want) {
        throw new Error(
          `want exactly [${JSON.stringify(k.want)}], got ${
            JSON.stringify(got)
          }`,
        );
      }
    },
  });
}
