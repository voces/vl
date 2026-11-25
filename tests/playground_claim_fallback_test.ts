// THE PLAYGROUND'S RUN PATH CARRIES G3 (coordinator ruling 2026-11-24): `runProgram` compiles
// through the LSP's `compile`, so a claim that writes an invalid module or meets a shared legacy
// helper's refusal answers with legacy, as the native host does. Two events, two outcomes each:
//
//   legacy refuses — nothing runs; legacy's refusal and the note naming the claim;
//   legacy builds  — legacy's module runs, with the fallback warning;
//
// and a valid claim takes no fallback. The playground has no strict mode. The LSP-level tests are
// tests/vl_claim_fallback_wasm_test.ts. No assertion library, per CLAUDE.md.
//
// Run with:  deno test -A tests/playground_claim_fallback_test.ts

import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import { FELL_BACK } from "../lsp/src/claimFallback.ts";
import { type PlaygroundResult, runProgram } from "../playground/src/playground.ts";
import { COMPILER, exists, ROOT } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) console.warn("[playground-claim-fallback] skipped — missing build/vl-compiler.wasm");

const module = ignore ? undefined : new WebAssembly.Module(Deno.readFileSync(COMPILER) as BufferSource);
const fresh = () => new WebAssembly.Instance(module!, {}).exports as unknown as Exports;
const fixture = (name: string) => Deno.readTextFileSync(`${ROOT}/tests/ir-claim-fallback/${name}`);
const messages = (r: PlaygroundResult) => JSON.stringify(r.diagnostics.map((d) => d.message));
const bytesOf = (exp: Exports) => Uint8Array.from({ length: exp.rbyteLen() }, (_, i) => exp.rbyteAt(i));

Deno.test({
  name: "playground claim fallback: a claim's refusal legacy shares runs nothing, with the refusal and the note",
  ignore,
  fn: async () => {
    const r = await runProgram(fixture("closure-stored-from-function-refused.vl"), createWasmChecker(fresh));
    const refusal = "a function returning a parameter called at two signatures";
    const note = "an IR claim refused inside `@start` (";
    if (r.compiled || !r.diagnostics.some((d) => d.message.includes(refusal)) || !r.diagnostics.some((d) => d.message.startsWith(note))) {
      throw new Error(`want no run, legacy's refusal and the note, got compiled ${r.compiled}, ${messages(r)}`);
    }
  },
});

Deno.test({
  name: "playground claim fallback: an invalid claimed module legacy builds runs legacy's module, with the warning",
  ignore,
  fn: async () => {
    const exp = fresh();
    let compiles = 0;
    // In the first, claimed, module `f`'s `local.get 0; i32.const 1; i32.add` becomes
    // `local.get 0; drop; drop; i32.add`: a stack underflow inside `f`. The rebuild's is untouched.
    let hit = -1;
    const patched: Exports = {
      ...exp,
      compileSrc: () => (compiles++, hit = -1, exp.compileSrc()),
      rbyteAt: (i: number) => {
        if (compiles !== 1) return exp.rbyteAt(i);
        if (hit < 0) {
          const b = bytesOf(exp);
          hit = b.findIndex((_, k) => [0x20, 0, 0x41, 1, 0x6a].every((v, j) => b[k + j] === v));
        }
        return hit >= 0 && (i === hit + 2 || i === hit + 3) ? 0x1a : exp.rbyteAt(i);
      },
    };
    const r = await runProgram(fixture("claimed-and-valid.vl"), createWasmChecker(() => patched));
    const fell = r.diagnostics.some((d) => d.message.includes("inside `f`") && d.message.endsWith(`: ${FELL_BACK}`));
    if (!r.compiled || r.logs.join("\n").trim() !== "3" || !fell) {
      throw new Error(`want legacy's module to run printing 3, with the warning, got compiled ${r.compiled}, logs ${JSON.stringify(r.logs)}, ${messages(r)}`);
    }
  },
});

Deno.test({
  name: "playground claim fallback: D17123's soft refusal runs nothing, with legacy's refusal and the note",
  ignore,
  fn: async () => {
    const r = await runProgram(fixture("claim-helper-refusal-legacy-refused.vl"), createWasmChecker(fresh));
    const refusal = "a union's arm rows were asked of a type no row holds";
    const note = "an IR claim refused inside `take` (emitProgram: scalar map read has no value-box type); legacy's emitter refuses the program";
    if (r.compiled || !r.diagnostics.some((d) => d.message.includes(refusal)) || !r.diagnostics.some((d) => d.message === note)) {
      throw new Error(`want no run, legacy's refusal and the note, got compiled ${r.compiled}, ${messages(r)}`);
    }
  },
});

Deno.test({
  name: "playground claim fallback: a soft refusal legacy builds runs legacy's module, with the warning",
  ignore,
  fn: async () => {
    const exp = fresh();
    exp.setTestClaimRefusal(2);
    const r = await runProgram(fixture("claimed-and-valid.vl"), createWasmChecker(() => exp));
    const fell = r.diagnostics.some((d) =>
      /^inside `[^`]+`: emitProgram: test claim refusal after the body: IR claim refused; used the legacy emitter$/.test(d.message)
    );
    if (!r.compiled || r.logs.join("\n").trim() !== "3" || !fell) {
      throw new Error(`want legacy's module to run printing 3, with the warning, got compiled ${r.compiled}, logs ${JSON.stringify(r.logs)}, ${messages(r)}`);
    }
  },
});

Deno.test({
  name: "playground claim fallback: a valid claimed module runs with no fallback",
  ignore,
  fn: async () => {
    const r = await runProgram(fixture("claimed-and-valid.vl"), createWasmChecker(fresh));
    if (!r.compiled || r.logs.join("\n").trim() !== "3" || r.diagnostics.some((d) => d.message.includes("legacy emitter"))) {
      throw new Error(`want a run printing 3 and no fallback, got compiled ${r.compiled}, logs ${JSON.stringify(r.logs)}, ${messages(r)}`);
    }
  },
});
