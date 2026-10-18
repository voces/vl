// The LSP's armed module-check skip (`checkSkip` on `loadWasmChecker`): the server
// re-checks an open importer after a dependency's edit with `recheck`, which serves
// every module the edit did not reach from the importer's last check. Graded against
// an unarmed checker's `check` of the same program, row for row.

import { filePath } from "./support/filePath.ts";
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
const log = (_m: string) => {};

const MAIN_KEY = "/proj/main.vl";
const LIB_KEY = "/proj/lib.vl";
const MAIN = `import { area, quiet } from "./lib"
const a: i32 = area(2, 3)
const bad: string = a
quiet()
`;
const LIB = `export function area(w: i32, h: i32): i32 { return w * h }
export function quiet(): void { print(3) }
const worse: boolean = 1
`;

const edits: { name: string; to: string; served: boolean }[] = [
  { name: "a body-only edit", to: LIB.replace("print(3)", "print(4)"), served: true },
  {
    name: "a body edit that raises a lib error",
    to: LIB.replace("print(3)", "print(q)"),
    served: true,
  },
  { name: "a signature edit", to: LIB.replace("h: i32): i32", "h: i32): f64"), served: false },
];

for (const e of edits) {
  Deno.test({ name: `check-skip in the LSP: ${e.name}`, ignore }, async () => {
    let lib = LIB;
    const read = (key: string) => (key === LIB_KEY ? lib : undefined);
    const armed = loadWasmChecker(SEED, log, undefined, undefined, true)!;
    await armed.check(MAIN, MAIN_KEY, read);
    lib = e.to;
    armed.bumpReaderGeneration();
    await armed.check(lib, LIB_KEY, read);
    const got = await armed.recheck(MAIN, MAIN_KEY, read);
    const want = await loadWasmChecker(SEED, log)!.check(MAIN, MAIN_KEY, read);
    if ((got.served > 0) !== e.served) {
      throw new Error(`want served ${e.served}, got ${got.served} (reason ${got.reason})`);
    }
    if (JSON.stringify(got.diagnostics) !== JSON.stringify(want)) {
      throw new Error(
        `want the unarmed check's rows ${JSON.stringify(want)}, got ${
          JSON.stringify(got.diagnostics)
        }`,
      );
    }
    if (got.graph.join(" ") !== `${MAIN_KEY} ${LIB_KEY}`) {
      throw new Error(`want the graph ${MAIN_KEY} ${LIB_KEY}, got ${got.graph.join(" ")}`);
    }
    const after = await armed.check(MAIN, MAIN_KEY, read);
    if (JSON.stringify(after) !== JSON.stringify(want)) {
      throw new Error(`want an armed check after the re-check to agree, got ${JSON.stringify(after)}`);
    }
  });
}
