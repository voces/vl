// `-O` RUNS ONCE, OVER THE LINKED MODULE — S5 step 5 (docs/internals/s5-per-module-artifacts.md §5,
// §13, §14). Four parts, each a different claim:
//
//   1. The optimiser reads nothing but bytes. Its import closure is `opt_*`, the wasm reader,
//      writer and name table, and `listutil`; no emitter, link or driver module imports an
//      `opt_*` one, and only `entry.vl` re-exports the chain to the host. So an artifact cannot
//      have been through an optimiser pass, and the chain cannot read emitter state the linked
//      module does not carry.
//   2. The emitter's `-O` flavour is exactly the decisions named in `FLAVOUR_READERS`. Each reads
//      `gOptimized` or `gLowMemUnused`, so an artifact emitted for `-O` differs from a plain one
//      at those sites, and the artifact key carries the flavour (§13). A new reader is a new
//      decision the key has to name, so the list is exhaustive and this test says which moved.
//   3. The artifact key carries every program-wide fact (`LinkFacts`): only `elFacts` reads
//      the flavour and the map-delete bit into the link section, and the delete bit is
//      written only by the per-module merge, so the link can re-derive it.
//   4. The host calls the chain once per `-O` / `-O3` build and never on a plain one. The
//      multi-value step prints its header once per chain run under `$VL_MV_EXPLAIN`.

import { ROOT, VL, COMPILER, binaryen, exists, nativeEnv } from "./support/tree.ts";

const COMPILER_DIR = `${ROOT}/compiler`;

const sources = (): Map<string, string> => {
  const out = new Map<string, string>();
  for (const e of Deno.readDirSync(COMPILER_DIR)) {
    if (e.isFile && e.name.endsWith(".vl")) {
      out.set(e.name.slice(0, -3), Deno.readTextFileSync(`${COMPILER_DIR}/${e.name}`));
    }
  }
  return out;
};

const importsOf = (src: string): string[] =>
  [...src.matchAll(/from\s+"\.\/([A-Za-z0-9_]+)"/g)].map((m) => m[1]);

const isOpt = (m: string) => m.startsWith("opt_");

// What the optimiser may import besides itself: the byte-level reader, writer and name table,
// and list helpers. None of them imports emitter state.
const OPT_DEPS = new Set(["wasm_read", "wasm_write", "wasm_names", "listutil"]);

Deno.test("opt-after-link: the optimiser's import closure is bytes only", () => {
  const src = sources();
  const seen = new Set<string>();
  const work = [...src.keys()].filter(isOpt);
  while (work.length > 0) {
    const m = work.pop()!;
    if (seen.has(m)) continue;
    seen.add(m);
    for (const d of importsOf(src.get(m) ?? "")) work.push(d);
  }
  const outside = [...seen].filter((m) => !isOpt(m) && !OPT_DEPS.has(m)).sort();
  if (outside.length > 0) {
    throw new Error(
      `the optimiser's import closure reaches ${outside.join(", ")}; want only opt_* and ` +
        `${[...OPT_DEPS].join(", ")} (the chain must read the linked module's bytes, nothing else)`,
    );
  }
});

Deno.test("opt-after-link: only entry.vl hands the optimiser to the host", () => {
  const src = sources();
  const importers = [...src.entries()]
    .filter(([m, s]) => !isOpt(m) && importsOf(s).some(isOpt))
    .map(([m]) => m)
    .sort();
  if (importers.join(",") !== "entry") {
    throw new Error(
      `modules importing an opt_* module: want [entry], got [${importers.join(", ")}] ` +
        `(an emitter-side import would let an artifact carry an optimiser pass)`,
    );
  }
});

// Every function outside the setters that reads an `-O` flavour global, as `file:function`.
const FLAVOUR_READERS = [
  // A map set calls `__map_set_<row>__` in a plain build and stores inline under `-O`.
  "emit_sections:assignSharedHelperIndices gOptimized",
  // A plain build fills long pooled strings from a passive segment; `-O` builds each inline.
  "emit_sections:strFillPlan gOptimized",
  // `--low-memory-unused` (only with `-O`) folds an address's constant into the memarg.
  "wasmEmit:emitCallCoreUserFn gLowMemUnused",
  "wasmEmit:emitLowMemAccessorCall gLowMemUnused",
  "wasmEmit:emitMemAddr gLowMemUnused",
];
const FLAVOUR_GLOBALS = ["gOptimized", "gLowMemUnused"];
// The one function that reads the program-wide facts into an artifact's key (`LinkFacts`,
// link.vl), and every fact it has to carry: the flavour, and the program's map-delete bit,
// which every map struct's layout reads.
const KEY_READER = "emit_link:elFacts";
const KEY_FACTS = [...FLAVOUR_GLOBALS, "gMapDeletes"];

const readersOf = (file: string, src: string, globals = FLAVOUR_GLOBALS): string[] => {
  const out = new Set<string>();
  let fn = "";
  for (const line of src.split("\n")) {
    const head = line.match(/^(?:export )?function ([A-Za-z0-9_]+)/);
    if (head) fn = head[1];
    const code = line.replace(/\/\/.*$/, "");
    for (const g of globals) {
      if (!new RegExp(`\\b${g}\\b`).test(code)) continue;
      if (/^\s*[A-Za-z0-9_]+,\s*$/.test(code)) continue; // an import list entry
      if (/^export let /.test(code)) continue; // the declaration
      if (fn === "setOptimized" || fn === "setLowMemoryUnused") continue;
      out.add(`${file}:${fn} ${g}`);
    }
  }
  return [...out];
};

Deno.test("opt-after-link: the emitter's -O flavour is the named decisions", () => {
  const got = [...sources().entries()]
    .flatMap(([m, s]) => readersOf(m, s))
    .filter((r) => !r.startsWith(`${KEY_READER} `))
    .sort();
  const want = [...FLAVOUR_READERS].sort();
  const added = got.filter((r) => !want.includes(r));
  const gone = want.filter((r) => !got.includes(r));
  if (added.length > 0 || gone.length > 0) {
    throw new Error(
      `-O flavour readers moved. new: [${added.join("; ")}], gone: [${gone.join("; ")}]. ` +
        "A new reader is an emitter decision an -O artifact differs on: name it here and in " +
        "s5-per-module-artifacts.md §13, or move it behind the link.",
    );
  }
});

Deno.test("opt-after-link: the artifact key carries every program-wide fact", () => {
  const src = sources().get("emit_link") ?? "";
  const got = readersOf("emit_link", src, KEY_FACTS).sort();
  const want = KEY_FACTS.map((g) => `${KEY_READER} ${g}`).sort();
  if (got.join(";") !== want.join(";")) {
    throw new Error(
      `the link section's fact readers: want [${want.join("; ")}], got [${got.join("; ")}]. ` +
        "Each fact an artifact's bodies read is a field of its key (`LinkFacts`), read in one place.",
    );
  }
});

// The program's map-delete bit is the merge of each module's `.delete` calls, written only by
// the merge and its reset, so the link can re-derive it from the artifacts.
Deno.test("opt-after-link: gMapDeletes is written only by the per-module merge", () => {
  const writers: string[] = [];
  for (const [m, s] of sources()) {
    let fn = "";
    for (const line of s.split("\n")) {
      const head = line.match(/^(?:export )?function ([A-Za-z0-9_]+)/);
      if (head) fn = head[1];
      const code = line.replace(/\/\/.*$/, "");
      if (/\bgMapDeletes\s*=[^=]/.test(code) && !/^export let /.test(code)) {
        writers.push(`${m}:${fn}`);
      }
    }
  }
  const want = ["emit_state:mapDeleteMerge", "emit_state:mapDeleteReset"];
  if (writers.sort().join(";") !== want.join(";")) {
    throw new Error(`gMapDeletes writers: want [${want.join("; ")}], got [${writers.join("; ")}]`);
  }
});

const WASM_OPT = binaryen("wasm-opt");
const HOST = exists(VL) && exists(COMPILER) && exists(WASM_OPT);
const PROGRAM = [
  "function main() {",
  "  const m: { [string]: i32 } = Map()",
  '  m["a"] = 1',
  '  print(m["a"] ?? 0)',
  "}",
  "main()",
  "",
].join("\n");
const HEADER = "mv-explain: writes are charged";

const chainRuns = async (flags: string[]): Promise<number> => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${dir}/p.vl`, PROGRAM);
    const { code, stderr } = await new Deno.Command(VL, {
      args: ["build", `${dir}/p.vl`, ...flags, "-o", `${dir}/p.wasm`, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
      // A cache hit would skip the chain this counts.
      env: nativeEnv({ VL_COMPILE_CACHE: "0", VL_MV_EXPLAIN: "1", VL_WASM_OPT: WASM_OPT }),
    }).output();
    const err = new TextDecoder().decode(stderr);
    if (code !== 0) throw new Error(`vl build ${flags.join(" ")} exited ${code}: ${err}`);
    return err.split("\n").filter((l) => l.startsWith(HEADER)).length;
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

for (const [flags, want] of [[[], 0], [["-O"], 1], [["-O3"], 1], [["-O", "-O3"], 1]] as const) {
  Deno.test({
    name: `opt-after-link: vl build ${flags.join(" ") || "(plain)"} runs the -O chain ${want} time(s)`,
    ignore: !HOST,
    fn: async () => {
      const got = await chainRuns([...flags]);
      if (got !== want) {
        throw new Error(`want ${want} chain run(s), got ${got} ("${HEADER}" lines on stderr)`);
      }
    },
  });
}
