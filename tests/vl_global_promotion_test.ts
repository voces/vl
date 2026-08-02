// START-LOCAL PROMOTION of top-level bindings (G2c) — the STRUCTURAL half of the pin.
//
// A top-level `let`/`const` whose name no function body spells does not need to be
// module state. `compiler/emit_sections.vl`'s `computeGlobalPromotion` gives such a
// binding a LOCAL of the synthetic start function instead of a global cell, because a
// mutable wasm global is observable state an engine keeps in memory while a local lives
// in a register — a top-level accumulator loop pays several times over for the
// difference, and `wasm-opt --closed-world -O3 --gufa` does not undo it.
//
// The two corpus fixtures this file builds already pin the BEHAVIOUR (their `@log`
// oracles run in `cases_wasm_test.ts` and the native-align suite). What a corpus case
// cannot pin is that the promotion HAPPENED, and that the safety predicate REFUSED when
// it had to. Both are visible in one number: how many entries the module's global
// section declares.
//
//   promoted-scalar-start-locals.vl        5 cells -> 0. Nothing is left to address.
//   promotion-blocked-by-function-read.vl  2 cells -> 1, the one a function body reads.
//
// EXACTLY ONE is the sharp form of the control. Zero would mean the predicate promoted
// a binding that a function reads (a wrong-frame `local.get`); two would mean it refused
// a binding nothing else names, and the fixture would stop testing anything.
//
// Zero declared globals is also a COMPLETE argument that no `global.get`/`global.set`
// survives in the first fixture, without scanning opcodes for byte patterns that could
// be immediates: `vl build` validates the module it writes, and a `global.get` of an
// index that no global section declares does not validate.
//
// Neither fixture may contain a string literal — the string-literal POOL rides the same
// global section (indices 0..pool-1), so a literal would make these counts read the pool
// rather than the cells.
//
// The `vl_` prefix is load-bearing: it is one of the two globs `ci-native` auto-discovers,
// and a seed-backed test matching neither glob nor an explicit ci.yml step runs NOWHERE
// (`tests/ci_seed_coverage_test.ts` is the guard).

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
    `[global-promotion] skipped — ${
      !haveBin ? "missing vl binary" : "missing seed wasm"
    }. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/refresh-compiler.sh",
  );
}

const { runWasm } = await import("./support/runWasm.ts");

/** Compile a corpus fixture to wasm bytes through the native tool (the real pipeline). */
const build = async (relPath: string): Promise<Uint8Array> => {
  const tmp = await Deno.makeTempDir();
  try {
    const o = `${tmp}/t.wasm`;
    const { code, stderr } = await new Deno.Command(VL, {
      args: ["build", relPath, "-o", o, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (code !== 0) {
      throw new Error(
        `vl build ${relPath} failed: ${
          new TextDecoder().decode(stderr).trim()
        }`,
      );
    }
    return await Deno.readFile(o);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

/**
 * The number of entries in the module's GLOBAL section (id 6), or 0 when the module
 * declares none. Walks the section framing directly rather than shelling out to a
 * disassembler, so the suite has no tool dependency that could make it self-ignore.
 */
const globalCount = (bytes: Uint8Array): number => {
  let p = 8; // magic (4) + version (4)
  const uleb = (): number => {
    let r = 0, s = 0;
    for (;;) {
      const b = bytes[p++];
      r |= (b & 0x7f) << s;
      if ((b & 0x80) === 0) return r >>> 0;
      s += 7;
    }
  };
  while (p < bytes.length) {
    const id = bytes[p++];
    const size = uleb();
    const payloadStart = p;
    if (id === 6) return uleb();
    p = payloadStart + size;
  }
  return 0;
};

/** The `@log` lines a corpus fixture declares, in order — its behavioural oracle. */
const expectedLogs = async (relPath: string): Promise<string[]> =>
  (await Deno.readTextFile(`${ROOT}/${relPath}`))
    .split("\n")
    .filter((l) => l.startsWith("// @log "))
    .map((l) => l.slice("// @log ".length));

const assertEq = (got: unknown, want: unknown, what: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

const PROMOTED = "tests/cases/globals/promoted-scalar-start-locals.vl";
const BLOCKED = "tests/cases/globals/promotion-blocked-by-function-read.vl";

Deno.test({
  name:
    "global-promotion: every scalar no function names becomes a start-fn local",
  ignore: !ENABLED,
  fn: async () => {
    const bytes = await build(PROMOTED);
    assertEq(
      globalCount(bytes),
      0,
      "the fixture's five top-level scalars must leave NO global cell behind\n" +
        "  (a nonzero count means the predicate refused a binding it should have taken)",
    );
    const { logs } = await runWasm(bytes);
    assertEq(
      logs,
      await expectedLogs(PROMOTED),
      "promoted program's behaviour moved",
    );
  },
});

Deno.test({
  name: "global-promotion: a binding a function body reads STAYS a global cell",
  ignore: !ENABLED,
  fn: async () => {
    const bytes = await build(BLOCKED);
    assertEq(
      globalCount(bytes),
      1,
      "exactly one cell must survive — `pinned`, which `readPinned` reads\n" +
        "  0 = the predicate promoted a binding a function reads (a wrong-frame local.get)\n" +
        "  2 = the predicate refused `promoted`, and this control tests nothing",
    );
    const { logs } = await runWasm(bytes);
    assertEq(
      logs,
      await expectedLogs(BLOCKED),
      "blocked program's behaviour moved",
    );
  },
});

Deno.test({
  name:
    "global-promotion: the corpus's cross-function global cases keep their cells",
  ignore: !ENABLED,
  fn: async () => {
    // The pre-existing corpus already carries the shape the predicate must refuse, and
    // these are the rows that would have gone silently wrong: every one of them writes a
    // module global from one function and reads it from another or from the top level.
    // Asserting they still DECLARE a cell is independent of asserting they still print
    // the right thing, and it fails one step earlier.
    for (
      const f of [
        "tests/cases/globals/cross-function.vl",
        "tests/cases/globals/mutate-in-loop.vl",
        "tests/cases/globals/mutate-through-fn.vl",
        "tests/cases/globals/read-through.vl",
      ]
    ) {
      const n = globalCount(await build(f));
      if (n < 1) throw new Error(`${f}: expected >=1 global cell, got ${n}`);
    }
  },
});
