// Put a compiler seed beside the built server bundle — rung 5 of the LSP's seed
// ladder (see `wasmCheckerNode.ts`), the one that makes the extension work in a
// workspace that is not this repo, with no configuration.
//
// Sources, first hit wins:
//   1. ../build/vl-compiler.wasm — this checkout's freshly built seed. The
//      bundle is built FROM this tree, so it must carry this tree's compiler: a
//      PATH-installed `vl` can be arbitrarily older than the sources being
//      bundled (measured: it embedded a pre-filter seed while the server bundle
//      relied on the new `scopeAt`), and the server half of the bundle assumes
//      the seed speaks its ABI.
//   2. `vl seed --out` — an installed CLI's own seed, for building the bundle
//      outside a checkout (no ../build): still a real compiler, never a
//      hand-placed file.
//
// MISSING IS NOT AN ERROR. CI builds the bundle to prove it compiles, on a box
// with no `vl` and no seed, and failing there would gate the whole PR on an
// artifact the bundle does not need to typecheck. The extension degrades to the
// four remaining rungs and says so at runtime. A shell `a || b` chain would do
// this in one line, except `deno task` rejects the redirect forms it needs — and
// a task that silently half-works is worse than a script that states its rules.
const OUT = "dist/vl-compiler.wasm";

const fromCli = (): boolean => {
  try {
    const r = new Deno.Command("vl", { args: ["seed", "--out", OUT] }).outputSync();
    return r.success;
  } catch {
    return false; // no `vl` on PATH, or a build too old to know `seed`
  }
};

const fromCheckout = (): boolean => {
  try {
    Deno.copyFileSync("../build/vl-compiler.wasm", OUT);
    return true;
  } catch {
    return false;
  }
};

Deno.mkdirSync("dist", { recursive: true });
if (fromCheckout()) {
  console.log(`bundled seed: ${OUT} (from ../build/vl-compiler.wasm)`);
} else if (fromCli()) {
  console.log(`bundled seed: ${OUT} (from \`vl seed\`)`);
} else {
  console.log(
    "no seed to bundle — rung 5 will be absent. " +
      "The extension still resolves a seed from vital.compilerWasm, " +
      "$VL_COMPILER_WASM, the workspace build/ dir, or `vl seed`.",
  );
}
