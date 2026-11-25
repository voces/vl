// THE TS HOSTS' CLAIMS-OFF FALLBACK (`lsp/src/claimFallback.ts`, coordinator ruling 2026-11-24): a
// claimed module the engine refuses is compiled again with IR claims off, so legacy's refusal, or
// legacy's bytes, is the answer. The native host's half is tests/vl_ir_claim_fallback_test.ts.
//
// The control below once compiled to an invalid module with claims on; the IR now declines it
// (`bundlePickRefused`), legacy refuses it, and it refuses with claims off too. The LSP's
// `compile` (the playground's Run path) answers with that refusal and the decline's note. A module
// corrupted only while claims are on stands in for a claim legacy builds. No assertion library, per
// CLAUDE.md.
//
// Run with:  deno test -A tests/vl_claim_fallback_wasm_test.ts

import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import { FELL_BACK, withClaimsOff } from "../lsp/src/claimFallback.ts";
import { COMPILER, exists, ROOT } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) console.warn("[claim-fallback-wasm] skipped — missing build/vl-compiler.wasm");

const module = ignore ? undefined : new WebAssembly.Module(Deno.readFileSync(COMPILER) as BufferSource);
const fresh = () => new WebAssembly.Instance(module!, {}).exports as unknown as Exports;
const CONTROL = Deno.readTextFileSync(`${ROOT}/tests/ir-claim-fallback/closure-stored-from-function-refused.vl`);
const REFUSAL = "a function returning a parameter called at two signatures";
const noSiblings = () => undefined;

const pushSrc = (exp: Exports, src: string) => {
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
};
const bytesOf = (exp: Exports) => Uint8Array.from({ length: exp.rbyteLen() }, (_, i) => exp.rbyteAt(i));

Deno.test({
  name: "claim fallback (wasm): the control's claim refuses it, and so does legacy",
  ignore,
  fn: () => {
    const exp = fresh();
    pushSrc(exp, CONTROL);
    const rc = exp.compileSrc();
    if (rc !== 3) {
      throw new Error(`want legacy's emit refusal (rc 3) with claims on, got rc ${rc}`);
    }
    pushSrc(exp, CONTROL);
    const legacy = withClaimsOff(exp, () => exp.compileSrc());
    if (legacy !== 3) throw new Error(`want legacy's emit refusal (rc 3) with claims off, got rc ${legacy}`);
  },
});

Deno.test({
  name: "claim fallback (wasm): the LSP's compile answers the control with legacy's refusal",
  ignore,
  fn: async () => {
    const { bytes, diagnostics } = await createWasmChecker(fresh).compile(CONTROL, "main.vl", noSiblings);
    const note = "the IR declined this statement (bundle result pick refused)";
    if (bytes !== undefined || !diagnostics.some((d) => d.message.includes(REFUSAL)) || !diagnostics.some((d) => d.message.includes(REFUSAL) && d.message.includes(note))) {
      throw new Error(`want no bytes and legacy's refusal, got ${bytes?.length} bytes and ${JSON.stringify(diagnostics.map((d) => d.message))}`);
    }
  },
});

Deno.test({
  name: "claim fallback (wasm): an invalid claimed module legacy builds ships legacy's bytes, with a warning",
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
    const src = Deno.readTextFileSync(`${ROOT}/tests/ir-claim-fallback/claimed-and-valid.vl`);
    const { bytes, diagnostics } = await createWasmChecker(() => patched).compile(src, "main.vl", noSiblings);
    const line = "main.vl:2:10: the emitted module failed to validate inside `f`: ";
    const fell = diagnostics.some((d) => d.message.startsWith(line) && d.message.endsWith(`: ${FELL_BACK}`));
    if (bytes === undefined || !WebAssembly.validate(bytes as Uint8Array<ArrayBuffer>) || !fell) {
      throw new Error(`want legacy's valid bytes and the fallback warning, got ${bytes?.length} bytes and ${JSON.stringify(diagnostics.map((d) => d.message))}`);
    }
  },
});

Deno.test({
  name: "claim fallback (wasm): a valid claimed module takes no fallback",
  ignore,
  fn: async () => {
    const { bytes, diagnostics } = await createWasmChecker(fresh).compile("print(1 + 2)\n", "main.vl", noSiblings);
    if (bytes === undefined || diagnostics.some((d) => d.message === FELL_BACK)) {
      throw new Error(`want bytes and no fallback, got ${bytes?.length} bytes and ${JSON.stringify(diagnostics.map((d) => d.message))}`);
    }
  },
});

// The soft refusal (D17123; coordinator ruling (a)): a claim that meets a shared legacy helper's
// refusal declines in the guest and legacy writes the unit. The LSP reports it with the native
// host's text: legacy's refusal and a note, or legacy's bytes and a warning.
Deno.test({
  name: "claim fallback (wasm): D17123's claim declines; the LSP reports legacy's refusal and the native note",
  ignore,
  fn: async () => {
    const src = Deno.readTextFileSync(`${ROOT}/tests/ir-claim-fallback/claim-helper-refusal-legacy-refused.vl`);
    const { bytes, diagnostics } = await createWasmChecker(fresh).compile(src, "main.vl", noSiblings);
    const legacy = "a union's arm rows were asked of a type no row holds";
    const note = "an IR claim refused inside `take` (emitProgram: scalar map read has no value-box type); legacy's emitter refuses the program";
    if (bytes !== undefined || !diagnostics.some((d) => d.message.includes(legacy)) || !diagnostics.some((d) => d.message === note)) {
      throw new Error(`want legacy's refusal and the note, got ${JSON.stringify(diagnostics.map((d) => d.message))}`);
    }
  },
});

Deno.test({
  name: "claim fallback (wasm): a claim the test hook makes refuse ships legacy's bytes with the native warning",
  ignore,
  fn: async () => {
    const exp = fresh();
    exp.setTestClaimRefusal(2);
    const src = Deno.readTextFileSync(`${ROOT}/tests/ir-claim-fallback/claimed-and-valid.vl`);
    const { bytes, diagnostics } = await createWasmChecker(() => exp).compile(src, "main.vl", noSiblings);
    const fell = diagnostics.some((d) =>
      /^inside `[^`]+`: emitProgram: test claim refusal after the body: IR claim refused; used the legacy emitter$/.test(d.message)
    );
    if (bytes === undefined || !WebAssembly.validate(bytes as Uint8Array<ArrayBuffer>) || !fell) {
      throw new Error(`want legacy's valid bytes and the warning, got ${bytes?.length} bytes and ${JSON.stringify(diagnostics.map((d) => d.message))}`);
    }
  },
});
