// `vl check` counts a call through a record field as a read of the record's binding, also when
// the field holds a named function (D17043). The checker repoints `r.f(3)` to a direct call of
// that function before the lint walks the tree, so the receiver's read has to survive the
// repoint; the corpus oracle re-parses for its lint pass and cannot see this, hence the CLI.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) and requires the built binary + seed wasm.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) console.warn("[vl-check-field-call-read] skipped — missing vl binary or seed wasm.");

async function check(src: string): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "vl_field_call_read_" });
  try {
    await Deno.writeTextFile(`${dir}/main.vl`, src);
    const r = await new Deno.Command(VL, {
      args: ["check", "main.vl", "--concise", "--compiler", COMPILER],
      cwd: dir,
      stdout: "piped",
      stderr: "piped",
      env: nativeEnv({ NO_COLOR: "1" }),
    }).output();
    const dec = new TextDecoder();
    return dec.decode(r.stdout) + dec.decode(r.stderr);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

// D17043's Repro and its grading list: an annotated and an un-annotated callee, in a function
// and at the top level.
const READS: [string, string][] = [
  ["repro", "function twice(a: i32) { return a * 2 }\nfunction bound() {\n  const r = { f: twice }\n  return r.f(3)\n}\nprint(bound())\n"],
  ["un-annotated", "function twice(a) { return a * 2 }\nfunction bound() {\n  const r = { f: twice }\n  return r.f(3)\n}\nprint(bound())\n"],
  ["top level", "function inc0(x: i32) { return x + 1 }\nconst a = { f: inc0 }\nprint(a.f(3))\n"],
];

Deno.test({
  name: "vl check: a binding read only through a call of its named-function field is not unused (D17043)",
  ignore: !ENABLED,
  fn: async () => {
    for (const [name, src] of READS) {
      const out = await check(src);
      if (/Unused variable/.test(out)) throw new Error(`${name}: want no unused-variable warning, got:\n${out}`);
    }
  },
});

Deno.test({
  name: "vl check: a record binding never read still warns (control)",
  ignore: !ENABLED,
  fn: async () => {
    const out = await check("function twice(a: i32) { return a * 2 }\nfunction bound() {\n  const r = { f: twice }\n  return 3\n}\nprint(bound() + twice(1))\n");
    if (!/Unused variable `r`/.test(out)) throw new Error(`want the unused-variable warning on r, got:\n${out}`);
  },
});
