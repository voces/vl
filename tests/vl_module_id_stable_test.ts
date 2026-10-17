// A MODULE'S MERGED NAMES ARE A FUNCTION OF THE MODULE, NOT OF THE GRAPH (S5's first step).
//
// The module merge renames every top-level declaration to `name$m<id>`. The id used to be the
// module's discovery position, so adding an import above `lib.vl` renamed everything in it —
// which is what stops a per-module check result from being reused across importers
// (docs/internals/incremental-compilation-design.md §3.2). This suite builds one `lib.vl`
// inside three graphs that discover it at different positions and holds its function names,
// read off the `--names` build's name section, to one spelling. A control
// requires the names to carry a suffix at all, so a merge that stopped renaming cannot pass.
//
// GATING: needs the built binary and the seed; reads the name section itself, no wasm-dis.

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER);
if (!ENABLED) {
  console.warn("[module-id-stable] skipped — missing vl or the seed");
}

// The function names (subsection 1) of a module's `name` section.
const namesOf = (bytes: Uint8Array): string[] => {
  let p = 8;
  const leb = (): number => {
    let v = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[p++];
      v += (b & 0x7f) * 2 ** shift;
      shift += 7;
      if ((b & 0x80) === 0) return v;
    }
  };
  const str = (): string => {
    const n = leb();
    const s = new TextDecoder().decode(bytes.subarray(p, p + n));
    p += n;
    return s;
  };
  const out: string[] = [];
  while (p < bytes.length) {
    const id = bytes[p++];
    const size = leb();
    const end = p + size;
    if (id === 0 && str() === "name") {
      while (p < end) {
        const sub = bytes[p++];
        const subEnd = leb() + p;
        if (sub === 1) {
          const count = leb();
          for (let i = 0; i < count; i++) {
            leb();
            out.push(str());
          }
        }
        p = subEnd;
      }
    }
    p = end;
  }
  return out;
};

const LIB = [
  "export type Pt = { x: i32, y: i32 }",
  "export let count = 3",
  "export function hello(n: i32): i32 { n + count }",
  "export function mk(): Pt { { x: hello(1), y: 2 } }",
].join("\n");
const OTHER = "export function other(): i32 { 7 }";
const VIA =
  'import { hello } from "./lib"\nexport function via(): i32 { hello(5) }';

// Each entry imports `lib.vl` (directly or through `via.vl`) at a different discovery position.
const GRAPHS: [string, string][] = [
  ["lib first", 'import { hello, mk } from "./lib"\nprint(hello(2) + mk().y)'],
  [
    "an unrelated import above lib",
    'import { other } from "./other"\nimport { hello, mk } from "./lib"\nprint(hello(other()) + mk().y)',
  ],
  [
    "lib reached through another module",
    'import { other } from "./other"\nimport { via } from "./via"\nimport { mk } from "./lib"\nprint(via() + other() + mk().y)',
  ],
];

// The function names of each graph's build, sorted.
const namesFrom = async (): Promise<string[][]> => {
  const dir = Deno.makeTempDirSync({ prefix: "vl-module-id-" });
  try {
    Deno.writeTextFileSync(`${dir}/lib.vl`, LIB);
    Deno.writeTextFileSync(`${dir}/other.vl`, OTHER);
    Deno.writeTextFileSync(`${dir}/via.vl`, VIA);
    const out: string[][] = [];
    for (const [i, [, src]] of GRAPHS.entries()) {
      Deno.writeTextFileSync(`${dir}/e${i}.vl`, src);
      const p = await new Deno.Command(VL, {
        args: [
          "build",
          `e${i}.vl`,
          "--names",
          "-o",
          `e${i}.wasm`,
          "--compiler",
          COMPILER,
        ],
        cwd: dir,
        env: nativeEnv(),
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (!p.success) {
        throw new Error(
          `vl build e${i}.vl failed:\n${new TextDecoder().decode(p.stdout)}${
            new TextDecoder().decode(p.stderr)
          }`,
        );
      }
      out.push(namesOf(Deno.readFileSync(`${dir}/e${i}.wasm`)).sort());
    }
    return out;
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
};

Deno.test({
  name:
    "module-id-stable: lib.vl's merged names do not move when the graph around it does",
  ignore: !ENABLED,
}, async () => {
  const got = await namesFrom();
  const fns = got.map((ns) => ns.filter((n) => n.includes("@lib.vl:")));
  if (!fns[0].some((n) => /^hello\$m\d+@lib\.vl:/.test(n))) {
    throw new Error(
      `control: want a suffixed hello$m<id>@lib.vl, got ${
        JSON.stringify(fns[0])
      }`,
    );
  }
  for (let i = 1; i < GRAPHS.length; i++) {
    if (JSON.stringify(fns[i]) !== JSON.stringify(fns[0])) {
      throw new Error(
        `"${GRAPHS[i][0]}" renamed lib.vl's functions:\n  want ${
          JSON.stringify(fns[0])
        }\n  got  ${JSON.stringify(fns[i])}`,
      );
    }
  }
});
