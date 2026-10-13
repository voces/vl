// THE LINT'S COPY OF THE EMIT PASS LIST MUST STAY THE EMITTER'S LIST.
//
// `arena-scan-outside-pass` (compiler/lint.vl) exempts a loop inside a pass, and
// names the passes in `asPasses`. The emitter's own list is the set of functions
// `runEmitPass` dispatches (compiler/emit_sections.vl). If a pass is added there and
// not here, the lint reports its scans as violations and the ratchet's count moves
// for no reason a reader can find; this names the missing pass instead.
//
// Pure file reads — no seed, no binary, so it runs everywhere.
//
// @test-timing sweep n=30

import { filePath } from "./support/filePath.ts";

const ROOT = filePath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");

const read = (rel: string): string => Deno.readTextFileSync(`${ROOT}/${rel}`);

/** The quoted entries of `const <name> = [ … ]` in a VL source, in order. */
const vlList = (src: string, name: string): string[] => {
  const m = new RegExp(`^const ${name} = \\[\\n([\\s\\S]*?)^\\]$`, "m").exec(src);
  if (m === null) throw new Error(`compiler/lint.vl has no \`const ${name} = [\``);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
};

/** The pass names `runEmitPass` dispatches. */
const emitPassNames = (): Set<string> => {
  const src = read("compiler/emit_sections.vl");
  const i = src.indexOf("function runEmitPass(");
  if (i < 0) throw new Error("compiler/emit_sections.vl has no `function runEmitPass(`");
  const end = src.indexOf("\n}\n", i);
  const body = src.slice(i, end < 0 ? src.length : end);
  return new Set([...body.matchAll(/return\s+([A-Za-z0-9_]+)\(/g)].map((m) => m[1]));
};

Deno.test("arena-scan: compiler/lint.vl's asPasses names every pass runEmitPass dispatches", () => {
  const passes = new Set(vlList(read("compiler/lint.vl"), "asPasses"));
  const emit = emitPassNames();
  if (emit.size === 0) {
    throw new Error("found no pass in runEmitPass — the reader is blind, not the list complete");
  }
  const missing = [...emit].filter((p) => !passes.has(p)).sort();
  if (missing.length > 0) {
    throw new Error(
      `compiler/lint.vl's \`asPasses\` is missing pass(es) that \`runEmitPass\` dispatches: ` +
        missing.join(" "),
    );
  }
});
