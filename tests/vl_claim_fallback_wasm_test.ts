// THE TS HOSTS' CLAIMS-OFF FALLBACK (`lsp/src/claimFallback.ts`, coordinator ruling 2026-11-24): a
// claimed module the engine refuses is compiled again with IR claims off, so legacy's refusal, or
// legacy's bytes, is the answer. The native host's half is tests/vl_ir_claim_fallback_test.ts.
//
// The escape is real on the seed: the control below compiles to an invalid module with claims on,
// and legacy refuses it with claims off. The LSP's `compile` (the playground's Run path) then
// answers with legacy's refusal. A module corrupted only while claims are on stands in for a claim
// legacy builds. No assertion library, per CLAUDE.md.
//
// Run with:  deno test -A tests/vl_claim_fallback_wasm_test.ts

import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import { FELL_BACK, needsClaimsOff, withClaimsOff } from "../lsp/src/claimFallback.ts";
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
  name: "claim fallback (wasm): the control's claimed module is invalid, and legacy refuses it",
  ignore,
  fn: () => {
    const exp = fresh();
    pushSrc(exp, CONTROL);
    const rc = exp.compileSrc();
    if (rc !== 0 || !needsClaimsOff(exp, bytesOf(exp))) {
      throw new Error(`want rc 0 with an invalid claimed module, got rc ${rc}`);
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
    if (bytes !== undefined || !diagnostics.some((d) => d.message.includes(REFUSAL))) {
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
    // The first, claimed, module gains a stray trailing byte; the claims-off rebuild's does not.
    const patched: Exports = {
      ...exp,
      compileSrc: () => (compiles++, exp.compileSrc()),
      rbyteLen: () => exp.rbyteLen() + (compiles === 1 ? 1 : 0),
      rbyteAt: (i: number) => (i < exp.rbyteLen() ? exp.rbyteAt(i) : 0xff),
    };
    const { bytes, diagnostics } = await createWasmChecker(() => patched).compile("print(1 + 2)\n", "main.vl", noSiblings);
    if (bytes === undefined || !WebAssembly.validate(bytes as Uint8Array<ArrayBuffer>) || !diagnostics.some((d) => d.message === FELL_BACK)) {
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
