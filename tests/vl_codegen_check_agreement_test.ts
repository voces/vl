// `vl check --codegen` and `vl check --batch` agree with what `vl build`/`vl run` do on the same
// program alone, graded through the seed's `compile` surface (the path `--codegen` takes).
//
//   * D11770: an emitter mark naming the right-hand side of the last assignment lowered
//     survived into the next program on the same instance, where the same node index named an
//     unrelated atom, and refused it. A batch's verdict on D3509 then hung on what came before.
//   * D11771: emit passes re-enter the checker, and a diagnostic raised there never failed a
//     build but was reported by `--codegen` (and the editor's compile) as a type error.
//
// Run with:  deno test -A --no-check tests/vl_codegen_check_agreement_test.ts

import { filePath } from "./support/filePath.ts";
import { runWasm } from "./support/runWasm.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const SEED = filePath(new URL("../build/vl-compiler.wasm", import.meta.url));
const ignore = (() => {
  try {
    Deno.statSync(SEED);
    return false;
  } catch {
    return true;
  }
})();
const noSiblings = () => undefined;

// The witnesses of D3507, D3419 and D3423: each lowers an assignment before D3509 is compiled.
const BEFORE: Record<string, string> = {
  D3507: `type Rec = { x: i32 }
let v: Rec | string | null = null
v = "s"
if v is Rec { print(v.x) } else { print(v) }
`,
  D3419: `const g: (i32 | null)[] = [null]
g[0] = 7
const h = () => g[0] ?? 0
print(h())
`,
  D3423: `type K = "a" | "b"
function g<T>(x: T) {
  let s: K | null = null
  s = x
  print(s ?? "n")
}
const v: K | null = null
g(v)
`,
};

const D3509 = `type K = "a" | "b"
type L = "c" | "d"
function F<A, B>(a: A, b: B): A | B { return a }
function g(kl: K | L | null) {
  const u = F(kl, "q")
  print(u == null)
}
g("c")
g(null)
`;

const errors = (ds: { severity: string; message: string }[]) =>
  ds.filter((d) => d.severity === "error").map((d) => d.message).join(" | ");

Deno.test({
  name:
    "codegen agreement: D3509 compiles the same after an earlier program's assignment (D11770)",
  ignore,
  fn: async () => {
    const fresh = loadWasmChecker(SEED, () => {})!;
    const want = await fresh.compile(D3509, "/tmp/d3509.vl", noSiblings);
    if (want.bytes === undefined || errors(want.diagnostics) !== "") {
      throw new Error(
        `D3509 alone: want a module and no error, got ${
          errors(want.diagnostics)
        }`,
      );
    }
    for (const [row, src] of Object.entries(BEFORE)) {
      const shared = loadWasmChecker(SEED, () => {})!;
      await shared.compile(src, "/tmp/before.vl", noSiblings);
      const got = await shared.compile(D3509, "/tmp/d3509.vl", noSiblings);
      const same = got.bytes !== undefined &&
        got.bytes.length === want.bytes.length &&
        got.bytes.every((b, i) => b === want.bytes![i]);
      if (!same || errors(got.diagnostics) !== "") {
        throw new Error(
          `D3509 after ${row} on one instance: want the module it emits alone ` +
            `(${want.bytes.length} bytes, no error), got ` +
            `${
              got.bytes === undefined
                ? "no module"
                : got.bytes.length + " bytes"
            } and ` +
            `"${errors(got.diagnostics)}"`,
        );
      }
    }
  },
});

// Programs `vl check` accepts and `vl run` runs, whose emit re-enters the checker.
const RUNS: { row: string; src: string; want: string[] }[] = [
  {
    row: "D1441",
    src: `type Circle = { r: f64 }
type Showable = { toString(): string }
function toString(self: Circle) {
  if self.r > 0.0 { return "C" }
  "c"
}
function describe<T: Showable>(x: T) { "<" + x.toString() + ">" }
print(describe({ r: 1.0 }))
`,
    want: ["<C>"],
  },
  {
    row: "D10271",
    src: `function len<T>(f: () => T | null) {
  const t = f()
  if t == null { 0 } else { 1 }
}
function outer<T>(x: T) {
  print(len(() => x))
}
outer(null)
`,
    want: ["0"],
  },
];

Deno.test({
  name:
    "codegen agreement: an emit pass's checker re-entry reports nothing a build ignores (D11771)",
  ignore,
  fn: async () => {
    for (const { row, src, want } of RUNS) {
      const c = loadWasmChecker(SEED, () => {})!;
      const checked = errors(await c.check(src, "/tmp/p.vl", noSiblings));
      if (checked !== "") {
        throw new Error(
          `${row}: precondition, want vl check clean, got ${checked}`,
        );
      }
      const r = await c.compile(src, "/tmp/p.vl", noSiblings);
      if (r.bytes === undefined || errors(r.diagnostics) !== "") {
        throw new Error(
          `${row}: want the codegen check clean, as the build is, got ` +
            `${r.bytes === undefined ? "no module" : "a module"} and "${
              errors(r.diagnostics)
            }"`,
        );
      }
      const logs = (await runWasm(r.bytes)).logs;
      if (JSON.stringify(logs) !== JSON.stringify(want)) {
        throw new Error(
          `${row}: want output ${JSON.stringify(want)}, got ${
            JSON.stringify(logs)
          }`,
        );
      }
    }
  },
});
