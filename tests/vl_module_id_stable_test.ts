// A MODULE'S MERGED NAMES ARE A FUNCTION OF THE MODULE, NOT OF THE GRAPH (S5's first step).
//
// The module merge renames every top-level declaration to `name$m<id>`. The id used to be the
// module's discovery position, so adding an import above `lib.vl` renamed everything in it —
// which is what stops a per-module check result from being reused across importers
// (docs/internals/incremental-compilation-design.md §3.2). This suite builds one `lib.vl`
// inside three graphs that discover it at different positions and holds its function names,
// read off the `--names` build's name section, to one spelling. A fourth arm builds one graph from
// two working directories and compiles it through the editor's checker, and wants one suffix from
// all three: the id keys on the path from the module's own project root (D5760). A control
// requires the names to carry a suffix at all, so a merge that stopped renaming cannot pass.
//
// GATING: needs the built binary and the seed; reads the name section itself, no wasm-dis.

import {
  COMPILER as TREE_COMPILER,
  exists,
  nativeEnv,
  VL as TREE_VL,
} from "./support/tree.ts";
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import { projectRootFor } from "../lsp/src/vlRoot.ts";

// `VL_MODULE_ID_VL` and `VL_MODULE_ID_COMPILER` grade another host and seed, for a before/after.
const VL = Deno.env.get("VL_MODULE_ID_VL") ?? TREE_VL;
const COMPILER = Deno.env.get("VL_MODULE_ID_COMPILER") ?? TREE_COMPILER;

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

// `name$m<id>` of every function the build names from `lib.vl`, sorted.
const libSuffixed = (bytes: Uint8Array): string[] =>
  namesOf(bytes).flatMap((n) => {
    const m = /^([A-Za-z_]\w*\$m\d+)@[^:]*lib\.vl:/.exec(n);
    return m === null ? [] : [m[1]];
  }).sort();

Deno.test({
  name:
    "module-id-stable: one graph names lib.vl alike from two working directories and the editor",
  ignore: !ENABLED,
}, async () => {
  // The project root is the temp dir, marked by `deno.json`; the modules sit one level down.
  const dir = Deno.makeTempDirSync({ prefix: "vl-module-id-root-" });
  try {
    Deno.mkdirSync(`${dir}/sub`);
    Deno.writeTextFileSync(`${dir}/deno.json`, "{}\n");
    Deno.writeTextFileSync(`${dir}/sub/lib.vl`, LIB);
    const main = 'import { hello, mk } from "./lib"\nprint(hello(2) + mk().y)';
    Deno.writeTextFileSync(`${dir}/sub/main.vl`, main);
    const arms: [string, string[]][] = [];
    for (
      const [where, cwd, entry] of [
        ["the project root", dir, "sub/main.vl"],
        ["the module's own directory", `${dir}/sub`, "main.vl"],
      ]
    ) {
      const p = await new Deno.Command(VL, {
        args: [
          "build",
          entry,
          "--names",
          "-o",
          `${dir}/out.wasm`,
          "--compiler",
          COMPILER,
        ],
        cwd,
        env: nativeEnv(),
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (!p.success) {
        throw new Error(
          `vl build from ${where} failed:\n${
            new TextDecoder().decode(p.stdout)
          }${new TextDecoder().decode(p.stderr)}`,
        );
      }
      arms.push([
        `vl build from ${where}`,
        libSuffixed(Deno.readFileSync(`${dir}/out.wasm`)),
      ]);
    }
    const inst = new WebAssembly.Instance(
      new WebAssembly.Module(Deno.readFileSync(COMPILER)),
      {},
    );
    const checker = createWasmChecker(
      () => inst.exports as unknown as Exports,
      undefined,
      undefined,
      projectRootFor,
    );
    checker.setEmitNames(true);
    const { bytes, diagnostics } = await checker.compile(
      main,
      `${dir}/sub/main.vl`,
      (key) => Promise.resolve(Deno.readTextFileSync(key)),
    );
    if (bytes === undefined) {
      throw new Error(
        `the editor's compile failed: ${JSON.stringify(diagnostics)}`,
      );
    }
    arms.push(["the editor's checker", libSuffixed(bytes)]);
    if (!arms[0][1].some((n) => /^hello\$m\d+$/.test(n))) {
      throw new Error(
        `control: want a suffixed hello$m<id>, got ${
          JSON.stringify(arms[0][1])
        }`,
      );
    }
    for (const [name, got] of arms.slice(1)) {
      if (JSON.stringify(got) !== JSON.stringify(arms[0][1])) {
        throw new Error(
          `${name} named lib.vl's functions differently from ${
            arms[0][0]
          }:\n  want ${JSON.stringify(arms[0][1])}\n  got  ${
            JSON.stringify(got)
          }`,
        );
      }
    }
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});

// D8780: with no project root marker the id hashes the module's ABSOLUTE path, and the
// canonical type order used to read the suffixed names as they are, so one source built in
// two directories emitted its struct and list types at different indices. Eight sibling directories, so a
// compiler whose bytes depend on the path cannot agree by luck.
Deno.test({
  name:
    "module-id-stable: a two-module program builds to the same bytes in any marker-less directory",
  ignore: !ENABLED,
}, async () => {
  const dir = Deno.makeTempDirSync({ prefix: "vl-module-id-noroot-" });
  try {
    for (
      let d = dir;
      d !== "/" && d !== ".";
      d = d.replace(/\/[^/]*$/, "") || "/"
    ) {
      for (const m of ["deno.json", "package.json", ".git"]) {
        if (exists(`${d}/${m}`)) {
          throw new Error(
            `precondition: ${d}/${m} marks a project root above the temp dir`,
          );
        }
      }
    }
    const lib = "export type P = { x: i32, y: i32 }\n" +
      "export function mk(): P[] { return [{ x: 1, y: 2 }] }\n";
    const main =
      'import { mk } from "./lib"\nconst ps = mk()\nprint(ps[0].x + ps[0].y)\n';
    const builds: [string, Uint8Array][] = [];
    for (let i = 0; i < 8; i++) {
      const sub = `${dir}/d${i}`;
      Deno.mkdirSync(sub);
      Deno.writeTextFileSync(`${sub}/lib.vl`, lib);
      Deno.writeTextFileSync(`${sub}/main.vl`, main);
      const [cwd, entry] = i % 2 === 0
        ? [sub, "main.vl"]
        : [dir, `${sub}/main.vl`];
      const p = await new Deno.Command(VL, {
        args: ["build", entry, "-o", `${sub}/out.wasm`, "--compiler", COMPILER],
        cwd,
        env: nativeEnv(),
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (!p.success) {
        throw new Error(
          `vl build in ${sub} failed:\n${new TextDecoder().decode(p.stdout)}${
            new TextDecoder().decode(p.stderr)
          }`,
        );
      }
      builds.push([sub, Deno.readFileSync(`${sub}/out.wasm`)]);
    }
    const [want, wantBytes] = builds[0];
    for (const [where, got] of builds.slice(1)) {
      if (
        got.length !== wantBytes.length ||
        got.some((b, k) => b !== wantBytes[k])
      ) {
        throw new Error(
          `the build in ${where} differs from the build in ${want}: want ${wantBytes.length} bytes, got ${got.length} (first difference at ${
            got.findIndex((b, k) => b !== wantBytes[k])
          })`,
        );
      }
    }
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});
