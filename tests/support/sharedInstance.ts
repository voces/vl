// One seed, many instances — the support half of `vl_shared_instance_test.ts`.
//
// Every caller gets a FRESH `WebAssembly.Instance` over the same compiled `Module`, because
// the point of the suite is to compare a fresh instance against a reused one. Compiling the
// module once and instantiating per call is what makes that cheap.
const SEED = new URL("../../build/vl-compiler.wasm", import.meta.url);

const module: WebAssembly.Module | undefined = (() => {
  try {
    return new WebAssembly.Module(Deno.readFileSync(SEED));
  } catch {
    return undefined; // no seed: a fresh clone, or the `ci` job. Callers self-ignore.
  }
})();

/** False when there is no seed to read, so a suite can `ignore` instead of throwing. */
export const assertSeed = (): boolean => module !== undefined;

/** A fresh instance of the seed. Throws only if called without checking `assertSeed`. */
export const seedExports = (): Record<string, (...a: number[]) => number> => {
  if (!module) throw new Error("no seed at build/vl-compiler.wasm");
  return new WebAssembly.Instance(module, {}).exports as unknown as Record<
    string,
    (...a: number[]) => number
  >;
};
