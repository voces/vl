// A MODULE'S PARSE IMAGE IS A FUNCTION OF THE MODULE, NOT OF THE GRAPH (S5's second step).
//
// Every module parses into one shared arena, so a module's node, token and spelling indices
// start wherever the modules parsed before it ended. A per-module parse cache can only replay
// an image that does not depend on that. This suite parses one `lib.vl` inside three graphs
// that put different modules ahead of it — one of them declaring the same extern, so the
// shared link rows dedupe differently — and holds its RELATIVE image (`parse_image.vl`) to one
// text. The control is the ABSOLUTE image, the arena as it is stored: it must differ across
// the same three graphs, or the graphs did not move the module and the check proves nothing.
//
// GATING: needs the seed.

import { COMPILER as TREE_COMPILER, exists } from "./support/tree.ts";

// `VL_PARSE_IMAGE_COMPILER` grades another seed, for the before/after of a change to the parse.
const COMPILER = Deno.env.get("VL_PARSE_IMAGE_COMPILER") ?? TREE_COMPILER;

const ENABLED = exists(COMPILER);
if (!ENABLED) {
  console.warn("[parse-image-stable] skipped — missing the seed");
}

type Exports = {
  modReset(): number;
  modKeyPush(cp: number): number;
  modSrcPush(cp: number): number;
  modCommit(n: number): number;
  modPendingCount(): number;
  modPendingLen(i: number): number;
  modPendingAt(i: number, j: number): number;
  srcReset(): number;
  srcPush(cp: number): number;
  checkSrc(): number;
  parseImageArm(mode: number): number;
  parseImageCount(): number;
  parseImageKeyLen(i: number): number;
  parseImageKeyAt(i: number, j: number): number;
  parseImageLen(i: number): number;
  parseImageAt(i: number, j: number): number;
};

const LIB_KEY = "/proj/lib.vl";

const LIB = `extern function hostTick(a: i32): i32
extern let hostFlag: i32

type Box<T> = { v: T }
type Circle = { r: f64 }
type Square = { s: f64 }
export type Shape = Circle | Square

export function area(s: Shape): f64 {
  match s {
    Circle => 3.0 * s.r * s.r
    Square => s.s * s.s
  }
}

export function wrap<T>(x: T): Box<T> { return { v: x } }

export function tick(n: i32): i32 {
  type Local = { k: i32 }
  const l: Local = { k: n }
  const xs: i32[] = [1, 2, ...[3]]
  let t = 0
  for x in xs { t = t + x }
  return hostTick(l.k + t + hostFlag) + wrap<i32>(n).v
}
`;

// Three graphs, each an entry plus the sources its imports resolve to. `lib.vl` is parsed
// first in A, after `other.vl` (which links `hostTick` first) in B, and after two modules in C.
const GRAPHS: { name: string; entry: string; deps: Record<string, string> }[] =
  [
    {
      name: "A (entry → lib)",
      entry: 'import { tick } from "./lib"\nprint(tick(1))\n',
      deps: { [LIB_KEY]: LIB },
    },
    {
      name: "B (entry → other, lib)",
      entry:
        'import { twice } from "./other"\nimport { tick } from "./lib"\nprint(twice(tick(2)))\n',
      deps: {
        "/proj/other.vl": "extern function hostTick(a: i32): i32\n" +
          "type Pair = { a: i32, b: i32 }\n" +
          "export function twice(n: i32): i32 {\n  const p: Pair = { a: n, b: n }\n" +
          "  return hostTick(p.a + p.b)\n}\n",
        [LIB_KEY]: LIB,
      },
    },
    {
      name: "C (entry → mid → zed, lib)",
      entry: 'import { both } from "./mid"\nprint(both(3))\n',
      deps: {
        "/proj/mid.vl":
          'import { zz } from "./zed"\nimport { tick, area } from "./lib"\n' +
          "export function both(n: i32): i32 { return zz(n) + tick(n) }\n",
        "/proj/zed.vl":
          "extern let hostFlag: i32\nexport function zz(n: i32): i32 {\n" +
          "  let s = 0\n  for i in 0 to n { s = s + i + hostFlag }\n  return s\n}\n",
        [LIB_KEY]: LIB,
      },
    },
  ];

const push = (fn: (cp: number) => number, text: string) => {
  for (const b of new TextEncoder().encode(text)) fn(b);
};
const readStr = (len: number, at: (j: number) => number) => {
  const b = new Uint8Array(len);
  for (let j = 0; j < len; j++) b[j] = at(j);
  return new TextDecoder().decode(b);
};

// Check one graph on `exp` with images armed in `mode`, answering every module's image by key.
const imagesOf = (
  exp: Exports,
  mode: number,
  g: (typeof GRAPHS)[number],
): Map<string, string> => {
  exp.parseImageArm(mode);
  exp.modReset();
  const commit = (key: string, src: string) => {
    push(exp.modKeyPush, key);
    push(exp.modSrcPush, src);
    exp.modCommit(1);
  };
  commit("/proj/main.vl", g.entry);
  for (;;) {
    const n = exp.modPendingCount();
    if (n === 0) break;
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      keys.push(readStr(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
    }
    for (const k of keys) {
      const src = g.deps[k];
      if (src === undefined) {
        throw new Error(`graph ${g.name}: unexpected import key ${k}`);
      }
      commit(k, src);
    }
  }
  exp.srcReset();
  push(exp.srcPush, g.entry);
  exp.checkSrc();
  const out = new Map<string, string>();
  for (let i = 0; i < exp.parseImageCount(); i++) {
    const key = readStr(
      exp.parseImageKeyLen(i),
      (j) => exp.parseImageKeyAt(i, j),
    );
    out.set(key, readStr(exp.parseImageLen(i), (j) => exp.parseImageAt(i, j)));
  }
  exp.parseImageArm(0);
  return out;
};

// The first line where two images part, for a failure message that names the field.
const firstDiff = (a: string, b: string): string => {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return `line ${i + 1}: want ${la[i]} / got ${lb[i]}`;
  }
  return "(none)";
};

const libImages = (mode: number): string[] => {
  // One instance for all three graphs, so the second and third serve lib's tokens from the
  // per-instance token cache while the first tokenizes it: both paths must agree.
  const exp = new WebAssembly.Instance(
    new WebAssembly.Module(Deno.readFileSync(COMPILER)),
    {},
  ).exports as unknown as Exports;
  return GRAPHS.map((g) => {
    const img = imagesOf(exp, mode, g).get(LIB_KEY);
    if (img === undefined) {
      throw new Error(`graph ${g.name}: no parse image for ${LIB_KEY}`);
    }
    return img;
  });
};

Deno.test({
  name: "parse-image: lib.vl's relative image is one text in all three graphs",
  ignore: !ENABLED,
  fn: () => {
    const imgs = libImages(1);
    if (!imgs[0].includes("\next ") || !imgs[0].includes("\nextg ")) {
      throw new Error(
        `the image carries no extern rows, so the link dedupe is untested:\n${
          imgs[0]
        }`,
      );
    }
    if (imgs[0].includes("!")) {
      throw new Error(
        `an index in lib.vl's image points outside lib.vl's own range: ${
          imgs[0].split("\n").find((l) => l.includes("!"))
        }`,
      );
    }
    for (let i = 1; i < imgs.length; i++) {
      if (imgs[i] !== imgs[0]) {
        throw new Error(
          `GRAPH-DEPENDENT PARSE — ${
            GRAPHS[i].name
          } parsed lib.vl to a different image than ` +
            `${GRAPHS[0].name}: ${firstDiff(imgs[0], imgs[i])}`,
        );
      }
    }
  },
});

Deno.test({
  name:
    "parse-image: the absolute image (the arena as stored) moves across the same graphs",
  ignore: !ENABLED,
  fn: () => {
    const imgs = libImages(2);
    if (imgs[1] === imgs[0] || imgs[2] === imgs[0] || imgs[2] === imgs[1]) {
      throw new Error(
        "CONTROL — the absolute images agree, so the three graphs did not move lib.vl in the " +
          "arena and the relative check above is vacuous",
      );
    }
  },
});
