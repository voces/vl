// The TS hosts' half of the invalid-module report (lsp/src/claimFallback.ts): a claimed module the
// engine refuses is the compiler's bug, located in the source by the guest's spans. The native
// host's half is tests/vl_build_validate_test.ts. The control is a claimed program's own module
// with one code byte corrupted; the uncorrupted module must pass. No assertion library, per
// CLAUDE.md.
//
// Run with:  deno test -A tests/claim_invalid_module_test.ts

import { engineRefusal, invalidClaimedModule, invalidHeadline } from "../lsp/src/claimFallback.ts";
import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
const compiled = ignore ? undefined : new WebAssembly.Module(Deno.readFileSync(COMPILER));

type Exports = Record<string, (...args: number[]) => number>;

const SRC = `function add(a: i32, b: i32): i32 { return a + b }
print(add(1, 2))
`;

/** `SRC` compiled on a fresh instance: the instance and the module bytes. */
const compile = (): { exp: Exports; bytes: Uint8Array } => {
  const exp = new WebAssembly.Instance(compiled!, {}).exports as unknown as Exports;
  exp.srcReset();
  for (const ch of SRC) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.compileSrc();
  if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
  const bytes = Uint8Array.from({ length: exp.rbyteLen() }, (_, i) => exp.rbyteAt(i));
  return { exp, bytes };
};

/** The offset of the code section's first function body's first instruction, or -1. */
const firstBodyOp = (b: Uint8Array): number => {
  const leb = (at: number): [number, number] => {
    let v = 0, shift = 0, i = at;
    for (;;) {
      const x = b[i++];
      v |= (x & 0x7f) << shift;
      if ((x & 0x80) === 0) return [v, i];
      shift += 7;
    }
  };
  let i = 8;
  while (i < b.length) {
    const id = b[i];
    const [size, body] = leb(i + 1);
    if (id === 10) {
      const [, afterCount] = leb(body);
      const [, afterSize] = leb(afterCount);
      const [runs, afterRuns] = leb(afterSize);
      let j = afterRuns;
      for (let r = 0; r < runs; r++) j = leb(j)[1] + 1;
      return j;
    }
    i = body + size;
  }
  return -1;
};

Deno.test({
  name: "claim invalid module: a claimed module the engine refuses is reported, located",
  ignore,
  fn: () => {
    const { exp, bytes } = compile();
    if (invalidClaimedModule(exp, bytes)) throw new Error("want the uncorrupted module valid");
    const at = firstBodyOp(bytes);
    if (at < 0) throw new Error("want a code section in the control's module");
    const bad = bytes.slice();
    bad[at] = 0xff; // no such opcode
    if (!invalidClaimedModule(exp, bad)) throw new Error("want the corrupted claimed module invalid");
    const where = invalidHeadline(exp, engineRefusal(bad), "main.vl");
    if (!where.headline.includes("the emitted module failed to validate")) {
      throw new Error(`want the validator's headline, got ${where.headline}`);
    }
  },
});
