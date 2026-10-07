// AN EMPTY LIST LITERAL AND A CAPTURE-FREE LAMBDA ALLOCATE NOTHING THEY DO NOT OWN (sunpa
// SP-043 and its closure twin). An empty `[]` reads its element type's one shared zero-length
// backing — capacity 0, so the first push reallocates and no list writes it — and a lambda
// that captures nothing is one constant closure per function. Both live in module globals.
// And a `const` holding a map read or a scalar list's `.get`/`.pop`, null-tested and read,
// holds no `S | null` box (SP-046).
//
// Pinned per fixture by OUTPUT (`@log`, so a shared backing that leaked a write shows) and by
// `@allocs`: the `struct.new*` / `array.new*` sites left in the fixture's own function bodies
// in the plain build. A global's initializer runs once, and the shared runtime helpers
// (`__str_concat__` and kin, present whatever the fixture does) are not the fixture's.
import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const DIR = `${ROOT}/tests/fixtures/shared-constants`;
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1" && exists(VL) &&
  exists(COMPILER) && exists(WASM_DIS);
const FIXTURES = [
  "empty-lists",
  "capture-free-closures",
  "nullable-scalar-locals",
  "for-literal-lists",
];

const run = async (bin: string, args: string[]) => {
  const p = await new Deno.Command(bin, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(),
  }).output();
  const dec = new TextDecoder();
  return { code: p.code, out: dec.decode(p.stdout), err: dec.decode(p.stderr) };
};

const allocSites = (wat: string): number => {
  let inFunc = false, n = 0;
  for (const line of wat.split("\n")) {
    if (line.startsWith(" (")) {
      inFunc = line.startsWith(" (func ") && !/^ \(func \$__\w+__ /.test(line);
    }
    if (inFunc) n += line.match(/\((struct|array)\.new/g)?.length ?? 0;
  }
  return n;
};

for (const fx of FIXTURES) {
  Deno.test({
    name: `shared constants: ${fx} prints its @log and keeps only its @allocs sites`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${DIR}/${fx}.vl`;
      const text = Deno.readTextFileSync(src);
      const logs = [...text.matchAll(/^\/\/ @log (.*)$/gm)].map((m) => m[1]);
      const allocs = Number(text.match(/^\/\/ @allocs (\d+)$/m)?.[1] ?? -1);
      const tmp = await Deno.makeTempDir();
      try {
        const out = `${tmp}/m.wasm`;
        const b = await run(VL, ["build", src, "--names", "-o", out, "--compiler", COMPILER]);
        if (b.code !== 0) throw new Error(`${fx}: vl build failed: ${b.err.trim()}`);
        const r = await run(VL, ["run", out]);
        const got = r.out.replace(/\n$/, "").split("\n");
        if (r.code !== 0 || JSON.stringify(got) !== JSON.stringify(logs)) {
          throw new Error(
            `${fx}: prints something else\n  want: ${JSON.stringify(logs)}\n` +
              `  got:  ${JSON.stringify(got)} rc=${r.code} ${r.err.trim()}`,
          );
        }
        const n = allocSites((await run(WASM_DIS, [out, "--all-features"])).out);
        if (n !== allocs) {
          throw new Error(
            `${fx}: ${n} allocation sites in function bodies\n  want: ${allocs} — an empty ` +
              "list literal reads its type's shared backing, a capture-free lambda its " +
              "constant closure, a null-tested scalar local its unboxed value",
          );
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}
