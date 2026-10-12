// TWO PROGRAMS, ONE INSTANCE, BOTH ORDERS — the shared-instance leaks the corpus oracle found
// only under a filtered run (D3995, D3996, D3997).
//
// Each pair compiles program B after program A on one instance, and B before A, and requires
// every emission to be byte-identical to that program's fresh-instance compile and to validate.
// The pairs import std, so the compile goes through the multi-module path the LSP and the
// corpus oracle drive (`createWasmChecker`), which the single-module leak harness
// (`vl_instance_state_leak_test.ts`) does not reach.

import { fileURLToPath } from "node:url";
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import { wrapStdReader } from "../lsp/src/editorText.ts";

const SEED = fileURLToPath(new URL("../build/vl-compiler.wasm", import.meta.url));
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const module = seedExists
  ? new WebAssembly.Module(Deno.readFileSync(SEED) as BufferSource)
  : undefined;

const checker = () => {
  const instance = new WebAssembly.Instance(module!, {});
  return createWasmChecker(() => instance.exports as unknown as Exports, wrapStdReader);
};

const emit = async (c: ReturnType<typeof checker>, src: string): Promise<Uint8Array> => {
  const { bytes, diagnostics } = await c.compile(src, "main.vl", () => undefined);
  if (!bytes) throw new Error(`no module: ${diagnostics.map((d) => d.message).join(" | ")}`);
  return bytes;
};

const same = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const PAIRS: { row: string; a: string; b: string }[] = [
  {
    // A mints a union box and a record; B's `filled<Item | null>` instance spelled its element
    // by shape and took the union box's index as its heap.
    row: "D3996",
    a: 'type R = { K: string }\nconst u: i32 | string = 3\nprint(u)\n',
    b: 'import { filled } from "std:array"\ntype Item = { n: i32 }\n' +
      "const a = filled<Item | null>(2, null)\nprint(a.length)\n",
  },
  {
    // D3996 at a record with a closure field, which that fix excluded.
    row: "D3997",
    a: 'type R = { K: string }\nconst u: i32 | string = 3\nprint(u)\n',
    b: 'import { filled } from "std:array"\ntype Item = { n: i32, f: (x: i32) => i32 }\n' +
      "const a = filled<Item | null>(2, null)\nprint(a.length)\n",
  },
  {
    // A mints a union box; B's call-LHS `??` stash reserved a slot of A's box type.
    row: "D3995",
    a: "function rd() {}\nfunction rdJ() {}\nfunction bignum() {}\n" +
      "function foldF32Src(): {q: f32} | null { { q: 2.5 } }\n" +
      "function foldF32() {\n  const g4 = foldF32Src() ?? { q: 7 }\n  print(g4.q)\n}\n" +
      "rd()\nrdJ()\nbignum()\nfoldF32()\n",
    b: 'import { filled } from "std:array"\n' +
      "function go(c: boolean) {\n  const x = null\n  const y = (if c { x } else { x }) ?? 0\n" +
      "  print(y)\n}\ngo(true)\nprint(filled(2, 1).length)\n",
  },
];

for (const p of PAIRS) {
  Deno.test({
    name: `shared-instance order (${p.row}): both programs emit as they do alone, in either order`,
    ignore: !seedExists,
    fn: async () => {
      const aAlone = await emit(checker(), p.a);
      const bAlone = await emit(checker(), p.b);
      for (const [first, second, name] of [[p.a, p.b, "A then B"], [p.b, p.a, "B then A"]]) {
        const c = checker();
        const x = await emit(c, first);
        const y = await emit(c, second);
        for (const [got, want, which] of [[x, first === p.a ? aAlone : bAlone, "first"], [
          y,
          second === p.a ? aAlone : bAlone,
          "second",
        ]] as [Uint8Array, Uint8Array, string][]) {
          if (!WebAssembly.validate(got as BufferSource)) {
            throw new Error(`${name}: the ${which} program's module does not validate`);
          }
          if (!same(got, want)) {
            throw new Error(`${name}: the ${which} program's bytes differ from its fresh compile`);
          }
        }
      }
    },
  });
}
