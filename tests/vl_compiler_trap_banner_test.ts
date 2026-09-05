// A COMPILER CRASH MUST NOT WEAR THE PROGRAM'S ERROR.
//
// D1500: the first external VL consumer hit a seed bug on the first compile of a
// DEFLATE decoder and lost a session to the message. The host printed the SEED's
// own trap —
//
//   Error: error while executing at wasm backtrace:
//       0:  0xea9a4 - <unknown>!<wasm function 2141>   … eight anonymous frames …
//   Caused by:
//       wasm trap: out of bounds array access
//   note: an index outside the bounds of an array.
//
// — which is byte-for-byte what a program indexing past the end of its own array
// gets, so the reporter went looking inside their decoder. The host knows which of
// the two modules trapped (one it loaded as the seed, one it instantiated from the
// compile result); it just never said. It does now: a banner plus exit 70, keyed on
// WHICH INSTANCE the failing call went into and never on the message text.
//
// THE PIN IS BOTH DIRECTIONS. A test that only proves the banner fires would pass a
// host that printed it for every trap, which is the same defect with the blame
// reversed — so the user-trap controls below assert the OLD output, unchanged.
//
// FIXTURES ARE BUILT, NOT CHECKED IN, AND THEY ARE NOT D1500. Pointing this at the
// D1500 witness would make the pin evaporate the day the compiler bug is fixed
// (#2479), and a checked-in .wasm is an opaque artifact nobody can re-derive. So
// each fixture is a tiny VL program compiled by the real seed and then handed BACK
// to `vl` as `--compiler`: a module that satisfies enough of the host↔seed ABI to
// be loaded as the compiler, and then traps. Two of them, because the two rungs
// fail in different places:
//
//   compileSrc-trap  — traps inside the `compileSrc` call, the D1500 rung exactly
//                      (`vl run`, `vl build`, `vl check --codegen`)
//   start-trap       — traps in the seed's own start function, before any ABI
//                      handshake, which is the rung `vl check`/`fmt`/`test` reach
//                      through the command pump
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-compiler-trap-banner] skipped — missing vl binary or seed wasm.");
}

/** The exit code `report` uses for a crash inside the compiler (sysexits EX_SOFTWARE). */
const EXIT_COMPILER_BUG = 70;
const BANNER = "the compiler itself trapped";

// A seed the host can LOAD (`hostAbi` answers the ABI generation, the staging and
// read-back accessors exist) whose `compileSrc` then dies on an out-of-bounds
// index — the same trap, from the same opcode, as D1500's. `rbyteLen()` rather
// than a literal `0` so the index is not a constant the emitter could fold away.
const SEED_TRAPS_IN_COMPILE = `const empty: i32[] = []

export function hostAbi(): i32 { 2 }
export function srcReset(): i32 { 0 }
export function srcPush(c: i32): i32 { c }
export function rbyteLen(): i32 { 0 }
export function rbyteAt(i: i32): i32 { i }

export function compileSrc(): i32 {
  empty[rbyteLen()]
}
`;

// A seed whose TOP LEVEL traps, so instantiation fails before the ABI handshake.
// No `print` — the compiler linker defines none of the program imports, and an
// unknown-import failure is a link error rather than the trap under test.
const SEED_TRAPS_AT_START = `const empty: i32[] = []
export function hostAbi(): i32 { 2 }
const boom: i32 = empty[hostAbi() - 2]
`;

// The controls that must NOT banner: a program whose own index is out of range,
// and one that does not parse.
const USER_TRAPS = `const xs: i32[] = []\nprint(xs[3])\n`;
const USER_PARSE_ERROR = `let x = = 3\n`;
const USER_FINE = `print(1)\n`;

type Res = { code: number; out: string; err: string };

const vl = async (args: string[]): Promise<Res> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

/** A temp dir with `probe.vl` written, plus a place to build fixtures. */
const withDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_compiler_trap_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

/** Compile `src` with the REAL seed and return the path to the module. */
const buildFixture = async (dir: string, name: string, src: string): Promise<string> => {
  const srcPath = `${dir}/${name}.vl`;
  const outPath = `${dir}/${name}.wasm`;
  await Deno.writeTextFile(srcPath, src);
  const built = await vl(["build", srcPath, "-o", outPath, "--compiler", COMPILER]);
  if (built.code !== 0 || !exists(outPath)) {
    throw new Error(
      `could not build the ${name} fixture with the real seed (rc ${built.code}) — the ` +
        `fixture source has drifted from what the compiler accepts, so this pin is inert. ` +
        `Fix the fixture; do NOT delete the pin.\n${built.err.trim()}`,
    );
  }
  return outPath;
};

const banner = (r: Res): string[] => r.err.split("\n").filter((l) => l.includes(BANNER));

Deno.test({
  name:
    "vl-compiler-trap-banner: a trap INSIDE compileSrc banners, names the file, and exits 70",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const seed = await buildFixture(dir, "seed_compile_trap", SEED_TRAPS_IN_COMPILE);
      const prog = `${dir}/probe.vl`;
      await Deno.writeTextFile(prog, USER_FINE);

      for (const cmd of [["run", prog], ["build", prog, "-o", `${dir}/probe.wasm`]]) {
        const r = await vl([...cmd, "--compiler", seed]);
        if (r.code !== EXIT_COMPILER_BUG) {
          throw new Error(
            `vl ${cmd[0]}: want exit ${EXIT_COMPILER_BUG} when the compiler traps, got ${r.code}\n${r.err}`,
          );
        }
        const lines = banner(r);
        if (lines.length !== 1) {
          throw new Error(
            `vl ${cmd[0]}: want exactly one banner line, got ${lines.length}\n${r.err}`,
          );
        }
        // The banner has to be readable as "not your fault" AND name the file, or
        // it does not do the one job it exists for.
        if (!lines[0].includes(prog)) {
          throw new Error(`vl ${cmd[0]}: the banner does not name the source file\n${lines[0]}`);
        }
        if (!/bug in vl, not in your program/.test(r.err)) {
          throw new Error(`vl ${cmd[0]}: the banner does not say whose bug it is\n${r.err}`);
        }
        // The seed's size is what identifies WHICH compiler crashed in a report
        // from a checkout we cannot see, so it must be the real number.
        const size = Deno.statSync(seed).size;
        if (!r.err.includes(`seed ${size} bytes`)) {
          throw new Error(
            `vl ${cmd[0]}: the banner should carry the resolved seed's size (${size})\n${r.err}`,
          );
        }
        // …and the underlying failure must still be printed, unchanged, below it.
        if (!/wasm trap: out of bounds array access/.test(r.err)) {
          throw new Error(`vl ${cmd[0]}: the original error was swallowed\n${r.err}`);
        }
      }
    });
  },
});

Deno.test({
  name:
    "vl-compiler-trap-banner: the command pump (check / fmt / test) banners on a seed that traps at start",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const seed = await buildFixture(dir, "seed_start_trap", SEED_TRAPS_AT_START);
      const prog = `${dir}/probe.vl`;
      await Deno.writeTextFile(prog, USER_FINE);

      for (const cmd of [["check", prog], ["fmt", prog], ["test", dir]]) {
        const r = await vl([...cmd, "--compiler", seed]);
        if (r.code !== EXIT_COMPILER_BUG) {
          throw new Error(
            `vl ${cmd[0]}: want exit ${EXIT_COMPILER_BUG} when the seed traps, got ${r.code}\n${r.err}`,
          );
        }
        if (banner(r).length !== 1) {
          throw new Error(`vl ${cmd[0]}: want exactly one banner line\n${r.err}`);
        }
      }
    });
  },
});

Deno.test({
  name:
    "vl-compiler-trap-banner: a USER program's trap keeps the old output and exit 1 — no banner",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const prog = `${dir}/probe.vl`;
      await Deno.writeTextFile(prog, USER_TRAPS);
      const r = await vl(["run", prog, "--compiler", COMPILER]);
      if (r.code !== 1) {
        throw new Error(`want exit 1 for a program's own trap, got ${r.code}\n${r.err}`);
      }
      if (banner(r).length !== 0) {
        throw new Error(
          `a program's own out-of-bounds index must NOT be blamed on the compiler\n${r.err}`,
        );
      }
      // The exact bytes a failing `vl run` printed before this change: anyhow's
      // rendering, then the VL-level note. Both suites and users match on these.
      if (!/^Error: error while executing at wasm backtrace:/.test(r.err)) {
        throw new Error(`the trap rendering changed\n${r.err}`);
      }
      if (!/wasm trap: out of bounds array access/.test(r.err)) {
        throw new Error(`the trap cause changed\n${r.err}`);
      }
      if (!/\nnote: an index outside the bounds of an array\.\n?$/.test(r.err)) {
        throw new Error(`the trailing VL-level note changed\n${JSON.stringify(r.err)}`);
      }
    });
  },
});

Deno.test({
  name:
    "vl-compiler-trap-banner: a compile DIAGNOSTIC is not a compiler crash — exit 1, no banner",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const prog = `${dir}/probe.vl`;
      await Deno.writeTextFile(prog, USER_PARSE_ERROR);
      // A non-zero rc out of `compileSrc` is the compiler REPORTING on the program.
      // It reaches `report` through the same function as the trap, so it is the
      // control that proves attribution is not "anything that came back unhappy".
      const r = await vl(["run", prog, "--compiler", COMPILER]);
      if (r.code !== 1) {
        throw new Error(`want exit 1 for a parse error, got ${r.code}\n${r.err}`);
      }
      if (banner(r).length !== 0) {
        throw new Error(`a parse error must not print the compiler-bug banner\n${r.err}`);
      }
      if (!/parse error/.test(r.err)) {
        throw new Error(`the diagnostic rendering changed\n${r.err}`);
      }
    });
  },
});

Deno.test({
  name: "vl-compiler-trap-banner: a trapping TEST is the program's failure, not the compiler's",
  ignore: !ENABLED,
  fn: async () => {
    // `vl test` runs user modules inside the same process that drives the
    // compiler, so it is the one command where the two instances interleave.
    const r = await vl([
      "test",
      `${ROOT}/tests/fixtures/vl-test/trap.test.vl`,
      "--compiler",
      COMPILER,
    ]);
    if (r.code !== 1) {
      throw new Error(`want exit 1 from a file with failing tests, got ${r.code}\n${r.err}`);
    }
    if (banner(r).length !== 0) {
      throw new Error(`a trapping test must not be blamed on the compiler\n${r.err}${r.out}`);
    }
    // The runner's report is a stderr stream (CMD_PRINT_ERR), so the failing
    // test's own trap text has to arrive there, beside where a banner would be.
    if (!/FAIL traps on an out-of-bounds index/.test(r.err)) {
      throw new Error(`the runner report changed\n${r.err}`);
    }
  },
});
