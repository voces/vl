// RE-EXPORT → wasm ABI: `export { … } from "dep"` must alias the PUBLIC name onto
// the merged target in the export section, following the re-export chain to the
// module that actually DECLARES the function.
//
// Why this needs a host-side test rather than a `tests/cases` fixture: the corpus
// tier adjudicates `@log` output, and the failure this pins is INVISIBLE THERE. A
// one-hop resolver drops the alias silently — `emitExportSection` looks the target
// name up in `fnStmts` and skips the entry when it misses — so the program still
// compiles, still runs, and still prints the right thing, while the name the entry
// declared it exports is simply absent from the module's ABI. Only reading the
// export section catches it.
//
// The RENAME is what makes the case bite. Without it every intermediate module
// re-exports under the SAME public name, so the deepest re-export row (the one
// adjacent to the declaration, which always resolves in one hop) supplies a correct
// entry under that name and masks the broken one. An `as` rename mid-chain gives the
// intermediate rows DIFFERENT public names, so nothing else can cover for the entry's
// own row and the missing alias becomes observable.
//
// The `vl_` prefix is load-bearing — it is one of the globs `ci-native` auto-discovers
// (see tests/ci_seed_coverage_test.ts); a seed-backed test matching neither glob nor an
// explicit ci.yml step runs nowhere in CI.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;

const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const ENABLED = haveBin && haveSeed;
if (!ENABLED) {
  console.warn(
    `[reexport-abi] skipped — ${
      !haveBin ? "missing vl binary" : "missing seed wasm"
    }. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/refresh-compiler.sh",
  );
}

const { runWasm } = await import("./support/runWasm.ts");

/** Write a module graph to a temp dir and build `entry.vl` through the native tool. */
const buildGraph = async (
  files: Record<string, string>,
): Promise<Uint8Array> => {
  const dir = await Deno.makeTempDir();
  try {
    for (const [name, src] of Object.entries(files)) {
      await Deno.writeTextFile(`${dir}/${name}`, src);
    }
    const out = `${dir}/out.wasm`;
    const { code, stderr } = await new Deno.Command(VL, {
      args: ["build", `${dir}/entry.vl`, "-o", out, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (code !== 0) {
      throw new Error(
        `vl build failed: ${new TextDecoder().decode(stderr).trim()}`,
      );
    }
    return await Deno.readFile(out);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

// `.slice()` re-backs the bytes with a plain `ArrayBuffer` — `Deno.readFile`'s
// `ArrayBufferLike` does not satisfy `BufferSource` under `deno check`.
const exportNames = (bytes: Uint8Array): string[] =>
  WebAssembly.Module.exports(new WebAssembly.Module(bytes.slice().buffer))
    .map((e) => e.name)
    .sort();

Deno.test({
  name:
    "reexport-abi: a RENAMING re-export chain exports the entry's public name (not just the deepest link's)",
  ignore: !ENABLED,
  fn: async () => {
    // a declares `base`; b re-exports it unchanged; c re-exports it AS `doubled`;
    // the entry re-exports `doubled`. The entry's alias must resolve past b and c
    // all the way to a's declaration.
    const bytes = await buildGraph({
      "a.vl": `export function base(n: i32): i32 { return n * 2 }\n`,
      "b.vl": `export { base } from "./a"\n`,
      "c.vl": `export { base as doubled } from "./b"\n`,
      "entry.vl": `export { doubled } from "./c"\n\nprint(doubled(21))\n`,
    });

    const names = exportNames(bytes);
    if (!names.includes("doubled")) {
      throw new Error(
        `the entry re-exports \`doubled\` but the wasm ABI does not contain it; ` +
          `exports = ${JSON.stringify(names)}`,
      );
    }

    // …and the alias must point at the real function, not merely exist.
    const { exports, logs } = await runWasm(bytes);
    if (typeof exports.doubled !== "function") {
      throw new Error(`exports.doubled is ${typeof exports.doubled}, want function`);
    }
    if ((exports.doubled as (n: number) => number)(21) !== 42) {
      throw new Error("exports.doubled did not resolve to a's `base`");
    }
    if (JSON.stringify(logs) !== JSON.stringify(["42"])) {
      throw new Error(`top level logs = ${JSON.stringify(logs)}, want ["42"]`);
    }
  },
});

Deno.test({
  name: "reexport-abi: a re-export through an intermediate module exports the name once",
  ignore: !ENABLED,
  fn: async () => {
    // The unrenamed shape: entry re-exports a name its dependency also only
    // re-exports. Every link publishes the same public name, and the ABI must
    // carry exactly one entry for it.
    const bytes = await buildGraph({
      "home.vl": `export function homeFn(n: i32): i32 { return n + 1 }\n`,
      "mid.vl": `export { homeFn } from "./home"\n`,
      "entry.vl": `export { homeFn } from "./mid"\n\nprint(homeFn(41))\n`,
    });

    const names = exportNames(bytes);
    if (JSON.stringify(names) !== JSON.stringify(["homeFn"])) {
      throw new Error(
        `exports = ${JSON.stringify(names)}, want exactly ["homeFn"]`,
      );
    }
    const { exports } = await runWasm(bytes);
    if ((exports.homeFn as (n: number) => number)(41) !== 42) {
      throw new Error("exports.homeFn did not resolve to home's declaration");
    }
  },
});

Deno.test({
  name:
    "reexport-abi: a DEPENDENCY's re-export is not part of the entry's ABI",
  ignore: !ENABLED,
  fn: async () => {
    // The other half of the alias rule. `mid` republishes `passed` for its own
    // importers; the ENTRY exports nothing at all, so the module's ABI must be
    // empty. Aliasing every module's re-export row — not just the root's — put a
    // dependency's bare name in the wasm export section of a program that never
    // asked to publish it, which is the same leak 4c's "an internal function …
    // never leaks into the wasm ABI" rules out for every other kind of name.
    //
    // The entry still IMPORTS through the re-export, so this cannot pass by the
    // re-export failing to resolve: the program has to run and print.
    const bytes = await buildGraph({
      "home.vl": `export function passed(n: i32): i32 { return n * 2 }\n`,
      "mid.vl": `export { passed } from "./home"\n`,
      "entry.vl": `import { passed } from "./mid"\n\nprint(passed(21))\n`,
    });

    const names = exportNames(bytes);
    if (names.length !== 0) {
      throw new Error(
        `the entry exports nothing, but the wasm ABI carries ${
          JSON.stringify(names)
        } — a dependency's re-export leaked`,
      );
    }
    const { logs } = await runWasm(bytes);
    if (JSON.stringify(logs) !== JSON.stringify(["42"])) {
      throw new Error(`top level logs = ${JSON.stringify(logs)}, want ["42"]`);
    }
  },
});

Deno.test({
  name:
    "reexport-abi: the root's rename resolves without the dependency rows to lean on",
  ignore: !ENABLED,
  fn: async () => {
    // The renaming chain of the first test, with the entry's own public name the
    // ONLY thing the ABI may carry. Before the root-only alias rule, `b`'s and
    // `c`'s rows contributed `base` and `doubled` entries of their own; the entry's
    // row had to be correct anyway (it renames), but nothing measured the dependency
    // rows' ABSENCE. This does, and it is the pin that would catch a regression to
    // one-hop resolution masquerading as "the name is exported".
    const bytes = await buildGraph({
      "a.vl": `export function base(n: i32): i32 { return n * 2 }\n`,
      "b.vl": `export { base } from "./a"\n`,
      "c.vl": `export { base as doubled } from "./b"\n`,
      "entry.vl": `export { doubled } from "./c"\n\nprint(doubled(21))\n`,
    });

    const names = exportNames(bytes);
    if (JSON.stringify(names) !== JSON.stringify(["doubled"])) {
      throw new Error(
        `exports = ${JSON.stringify(names)}, want exactly ["doubled"]`,
      );
    }
  },
});
