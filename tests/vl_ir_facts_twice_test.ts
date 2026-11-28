// An optimised build that wants the IR's whole-program facts compiles twice in one instance
// (`compileTwice`, compiler/driver.vl): compile 1 gathers them, compile 2 is the build. That is
// sound only while a compile leaves no trace the next one reads, so two compiles in one instance
// must emit the same bytes, and the twice-compiled build must emit what one compile does.
//
// GATING: the seed (build/vl-compiler.wasm); the emitted module is compared before any wasm-opt.

import { COMPILER, STD, exists } from "./support/tree.ts";
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";

const ENABLED = exists(COMPILER);
if (!ENABLED) console.warn("[ir-facts-twice] skipped — missing the seed.");

// Programs whose -O emit interns list rows and struct rows in an order a leaked trace would move:
// phase A's no-trace check failed or permuted the type section on each (A2 note, 2026-11-28).
const PROGRAMS = [
  "tests/cases/arrays/filter-struct-array.vl",
  "tests/cases/arrays/map-struct-to-struct.vl",
  "tests/cases/arrays/nested-array-inner-push.vl",
  "tests/cases/arrays/nul-scalar-elem-list-union-arm-widens.vl",
  "tests/cases/closures/closure-array-toplevel-union-arm-call.vl",
  "tests/cases/closures/closure-union-array-narrow.vl",
  "tests/cases/closures/capture-union-closure-write-member-grid.vl",
  "bench/algorithms/dispatch-table/main.vl",
  "tests/cases/maps/basics.vl",
  "tests/cases/strings/basics.vl",
];

const read = (key: string): string | undefined => {
  try {
    return Deno.readTextFileSync(key.startsWith("std:") ? `${STD}/${key.slice(4)}.vl` : key);
  } catch {
    return undefined;
  }
};

const seed = ENABLED ? new WebAssembly.Module(Deno.readFileSync(COMPILER) as BufferSource) : undefined;

type Inst = { exports: Exports; raw: WebAssembly.Exports };

const instance = (twice: boolean, lowMemory: number): Inst => {
  const inst = new WebAssembly.Instance(seed!, {});
  const raw = inst.exports;
  if (lowMemory > 0) (raw.setLowMemoryUnused as (n: number) => number)(lowMemory);
  if (twice) (raw.setIrFactsTwice as (k: number) => number)(1);
  return { exports: raw as unknown as Exports, raw };
};

const emit = async (inst: Inst, path: string): Promise<Uint8Array> => {
  const checker = createWasmChecker(() => inst.exports);
  checker.setOptimized(true);
  const { bytes, diagnostics } = await checker.compile(Deno.readTextFileSync(path), path, read);
  if (bytes === undefined) {
    throw new Error(`${path}: want a module, got diagnostics ${JSON.stringify(diagnostics)}`);
  }
  return bytes.slice();
};

const firstDiff = (a: Uint8Array, b: Uint8Array): number => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
};

// `-O` and `-O3` emit alike (the seed reads only `setOptimized`); `--low-memory-unused` changes emit.
const LOW_MEMORY = [0, 4096];

for (const path of PROGRAMS) for (const low of LOW_MEMORY) {
  Deno.test({
    name: `ir facts twice: ${path}${low > 0 ? ` --low-memory-unused=${low}` : ""}`,
    ignore: !ENABLED,
    fn: async () => {
      const once = instance(false, low);
      const a = await emit(once, path);
      const b = await emit(once, path);
      const at = firstDiff(a, b);
      if (at >= 0) {
        throw new Error(
          `${path}: two -O compiles in one instance: want identical bytes, got a difference at byte ${at} (${a.length} vs ${b.length} bytes)`,
        );
      }
      const twice = await emit(instance(true, low), path);
      const tw = firstDiff(a, twice);
      if (tw >= 0) {
        throw new Error(
          `${path}: the twice-compiled -O build: want the bytes one compile emits, got a difference at byte ${tw} (${a.length} vs ${twice.length} bytes)`,
        );
      }
    },
  });
}
