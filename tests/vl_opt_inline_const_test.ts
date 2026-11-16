// A GLOBAL'S INITIALIZER IS TAKEN APART ONLY WHERE ITS RECORD OPERAND IS A `struct.new` (D3679).
//
// The inline-record step stores a never-written record's fields in a parent that a constant
// expression builds by deleting the operand's `struct.new`. A `global.get` operand cannot be
// taken apart in a constant expression, and the emitter never writes one, so these modules are
// hand-written: the `struct.new` control is inlined and the `global.get` one stays refused,
// and both print the same values after `-O3`.
//
// GATING: `SELFHOST_NATIVE_ALIGN=1` + the seed + binaryen.js (`npm ci`).
//
// @test-timing opt

import { COMPILER, exists } from "./support/tree.ts";
import { optimizeModule, type Binaryen } from "../compiler/optHost.ts";

const loadBinaryen = async (): Promise<Binaryen | undefined> => {
  try {
    const m = (await import("binaryen")).default;
    // deno-lint-ignore no-explicit-any
    const b = m as any;
    return typeof b === "function" ? await b() : b;
  } catch {
    return undefined;
  }
};

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const B = GATED ? await loadBinaryen() : undefined;
const ENABLED = GATED && exists(COMPILER) && B !== undefined;
if (GATED && !ENABLED) console.warn("[opt-inline-const] skipped — missing the seed or binaryen.js");

// `$p` is built by its initializer from `OPERAND`, then its record field is replaced and read.
const module = (operand: string) => `
(module
  (rec
    (type $v (struct (field f64) (field f64)))
    (type $p (struct (field (mut (ref $v))) (field f64))))
  (import "env" "print" (func $print (param f64)))
  (global $g (ref $v) (struct.new $v (f64.const 1) (f64.const 2)))
  (global $p (ref $p) (struct.new $p ${operand} (f64.const 3)))
  (func $main
    (call $print (struct.get $v 1 (struct.get $p 0 (global.get $p))))
    (struct.set $p 0 (global.get $p)
      (struct.new $v (f64.const 5) (f64.add (f64.const 1) (struct.get $p 1 (global.get $p)))))
    (call $print (struct.get $v 0 (struct.get $p 0 (global.get $p))))
    (call $print (struct.get $v 1 (struct.get $p 0 (global.get $p))))
    (call $print (struct.get $v 1 (global.get $g))))
  (start $main))`;

const O_INLINE_EXPLAIN = 2;

const optimized = (wat: string): { explain: string; printed: number[] } => {
  const parsed = B.parseText(wat);
  parsed.setFeatures(B.Features.All);
  const bytes = parsed.emitBinary() as Uint8Array;
  parsed.dispose();
  const seed = new WebAssembly.Instance(
    new WebAssembly.Module(Deno.readFileSync(COMPILER) as BufferSource),
    {},
  );
  let explain = "";
  const out = optimizeModule(seed.exports, B, bytes, {
    release: true,
    bits: O_INLINE_EXPLAIN,
    print: (t) => explain += t,
  });
  const printed: number[] = [];
  new WebAssembly.Instance(new WebAssembly.Module(out as BufferSource), {
    env: { print: (x: number) => printed.push(x) },
  });
  return { explain, printed };
};

const CASES: [string, string, RegExp][] = [
  [
    "a struct.new operand is taken apart",
    "(struct.new $v (f64.const 7) (f64.const 8))",
    /type \d+ field 0 \(type \d+\): inlined;/,
  ],
  [
    "a global.get operand stays refused",
    "(global.get $g)",
    /type \d+ field 0 \(type \d+\): not inlined: type \d+ is made in a constant expression/,
  ],
];

for (const [name, operand, want] of CASES) {
  Deno.test({
    name: `opt inline const: ${name}`,
    ignore: !ENABLED,
    fn: () => {
      const { explain, printed } = optimized(module(operand));
      if (!want.test(explain)) {
        throw new Error(`explain\n  want: ${want}\n  got:  ${explain.trim()}`);
      }
      const first = operand.startsWith("(global.get") ? 2 : 8;
      const wantPrinted = [first, 5, 4, 2];
      if (JSON.stringify(printed) !== JSON.stringify(wantPrinted)) {
        throw new Error(`printed\n  want: ${wantPrinted}\n  got:  ${printed}`);
      }
    },
  });
}
