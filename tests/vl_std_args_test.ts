// `std:args` WITH A REAL ARGUMENT VECTOR — the native `vl` binary, spawned with
// arguments, over the shipping `std/args.vl`.
//
// WHY THIS IS NOT A `tests/cases/` FIXTURE, which is the whole reason the file
// exists. The corpus RUN tier is adjudicated two ways and NEITHER can hand a case
// an argv:
//   • `tests/cases_wasm_test.ts` drives the case under V8, where `__args_get__`
//     returns a WasmGC array JS can neither read nor build — the harness stubs it
//     with a throw, which is why `tests/cases/std/args-none.vl` carries `@skip`.
//   • `tests/selfhost_native_align_test.ts` honours no `@skip` and runs the case
//     natively, but through `vl run --batch`, which never reaches the host's
//     `set_program_args` (several programs share one process there, so "the
//     program's arguments" has no meaning). Its `vl check` leg passes none either.
// So the corpus can only ever see the EMPTY vector, and `args-none.vl` pins
// exactly that. Everything that depends on argv actually arriving — that index 0
// is the first USER argument, that an empty string survives as an argument, that
// a multi-byte argument decodes to code points — has to spawn `vl run` itself.
// This is that spawn, and it is the only automated coverage of those facts.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native`
// auto-discovers (tests/ci_seed_coverage_test.ts), and a seed-backed test matching
// neither glob nor an explicit ci.yml step runs nowhere in CI.
//
// GATING: same as the other `vl_*`/`selfhost_native_*` suites — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm, so it
// self-ignores on a fresh clone and runs in `ci-native` (which has a seed).

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
const STD = `${ROOT}/std`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) console.warn("[vl-std-args] skipped — missing vl binary or seed wasm.");

// The probe program: the whole vector, rendered so every property under test is
// visible in one stdout. `n=` is the count; each line then carries the INDEX, the
// argument bracketed (so an empty one is `[]` rather than nothing), and its length
// in CODE POINTS (so a multi-byte argument is distinguishable from its byte count).
const ECHO = `import { programArgs } from "std:args"
import { Utf8Error } from "std:utf8"

const args = programArgs()
if args is Utf8Error {
  print("ERR " + args.msg)
} else {
  print("n=" + toString(args.length))
  let i = 0
  while i < args.length {
    print(toString(i) + ":[" + args[i] + "]:" + toString(args[i].length))
    i = i + 1
  }
}
`;

/** `vl run <entry> --compiler <seed> <argv…>` with `VL_STD` pinned to this tree. */
const runWith = async (argv: string[]): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_std_args_" });
  const entry = `${dir}/echo.vl`;
  await Deno.writeTextFile(entry, ECHO);
  try {
    const { code, stdout, stderr } = await new Deno.Command(VL, {
      args: ["run", entry, "--compiler", COMPILER, ...argv],
      stdout: "piped",
      stderr: "piped",
      // VL_STD pins the std dir to THIS tree: agent worktrees symlink the cargo
      // target into the main checkout, so the binary's exe-relative std/ fallback
      // (/proc/self/exe resolves symlinks) would otherwise point at the WRONG one.
      env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: STD },
    }).output();
    const dec = new TextDecoder();
    const out = dec.decode(stdout);
    if (code !== 0) {
      throw new Error(`\`vl run\` exited ${code}\nstdout:\n${out}\nstderr:\n${dec.decode(stderr)}`);
    }
    return out.trimEnd();
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const expect = async (argv: string[], want: string[]) => {
  const got = await runWith(argv);
  const wantText = want.join("\n");
  if (got !== wantText) {
    throw new Error(`vl run … ${JSON.stringify(argv)}\n  want:\n${wantText}\n  got:\n${got}`);
  }
};

Deno.test({
  // The fact every programmer arriving from C/Python/Node gets wrong, and the one
  // this module's header spends its longest paragraph on. If a program name ever
  // appears at index 0 this test says so on the first line.
  name: "std:args: index 0 is the FIRST USER ARGUMENT — no program name in the list",
  ignore: !ENABLED,
  fn: async () => {
    await expect(["--", "one", "two", "three"], [
      "n=3",
      "0:[one]:3",
      "1:[two]:3",
      "2:[three]:5",
    ]);
  },
});

Deno.test({
  // The host accepts the vector two ways (`run_cmd`: every positional after the
  // source file, and everything after a literal `--`). They must agree, because a
  // caller picks between them on whether an argument starts with `-`, not on what
  // the program will see.
  name: "std:args: positional and post-`--` spellings deliver the same vector",
  ignore: !ENABLED,
  fn: async () => {
    const bare = await runWith(["one", "two", "three"]);
    const dashed = await runWith(["--", "one", "two", "three"]);
    if (bare !== dashed) throw new Error(`spellings disagree:\n  bare:\n${bare}\n  --:\n${dashed}`);
  },
});

Deno.test({
  // The empty-plus-errno protocol, from the outside. The floor signals failure by
  // answering an EMPTY `u8[]`, and `""` is a legitimate argument that answers the
  // same way — the errno is the only thing separating them, and `std/args.vl` reads
  // it inside the loop. Get that wrong and an empty argument either vanishes or
  // traps; both are visible here, at BOTH ends of the vector and in the middle.
  name: "std:args: an empty-string argument is an argument, not the end of the list",
  ignore: !ENABLED,
  fn: async () => {
    await expect(["--", "", "x", ""], [
      "n=3",
      "0:[]:0",
      "1:[x]:1",
      "2:[]:0",
    ]);
  },
});

Deno.test({
  // argv crosses as BYTES and `std:args` decodes them, so a multi-byte argument is
  // the only proof the decode is a decode: `héllo→` is 6 code points and 9 UTF-8
  // bytes, so a module that forgot to decode would report 9.
  name: "std:args: a multi-byte UTF-8 argument decodes to code points, not bytes",
  ignore: !ENABLED,
  fn: async () => {
    await expect(["--", "héllo→", "naïve"], [
      "n=2",
      "0:[héllo→]:6",
      "1:[naïve]:5",
    ]);
  },
});

Deno.test({
  // No arguments is the ANSWER, not a failure: an empty `string[]`, never the error
  // arm and never a null. The corpus pins this too (`tests/cases/std/args-none.vl`);
  // it is repeated here so this file alone covers the shape of the surface.
  name: "std:args: no arguments is an empty list, not an error",
  ignore: !ENABLED,
  fn: async () => {
    await expect([], ["n=0"]);
  },
});

Deno.test({
  // WAS A HOST WART, NOW A LOUD ERROR — and this test is the reason the change was
  // noticed rather than silently reshaping what programs see.
  //
  // `vl run p.vl -v x` used to SILENTLY DROP `-v` and deliver only `x`: the host's
  // flag loop fell through unrecognised dash-led tokens to `_ => {}` with no
  // diagnostic. Nothing inside `std:args` could tell a dropped argument from an
  // un-passed one — a dropped argument and an absent one are the same absence — so
  // out here was the only place it could be asserted at all. Fixed in #1818; the
  // token is now rejected with exit 2 and a runnable remedy.
  //
  // `--` was ALWAYS the way to pass one and still is, unchanged.
  name: "std:args: a dash-led argument is a loud error unless it follows `--` (#1818)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_std_args_dash_" });
    const entry = `${dir}/echo.vl`;
    await Deno.writeTextFile(entry, ECHO);
    try {
      const { code, stderr } = await new Deno.Command(VL, {
        args: ["run", entry, "--compiler", COMPILER, "-v", "x"],
        stdout: "null",
        stderr: "piped",
        env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: STD },
      }).output();
      const err = new TextDecoder().decode(stderr);
      // Exit 2 is the usage code `usage()` and `cliUsageErr` already reserve; 1 would
      // mean the PROGRAM failed, which is a different thing entirely.
      if (code !== 2) {
        throw new Error(`want exit 2 for an unknown flag, got ${code}\nstderr:\n${err}`);
      }
      // The message must name the ACTUAL token, not a placeholder — a remedy the
      // reader cannot copy is barely better than the silent drop it replaced.
      if (!err.includes("`-v`")) {
        throw new Error(`the error should name the token \`-v\`\nstderr:\n${err}`);
      }
      if (!err.includes("--")) {
        throw new Error(`the error should point at \`--\` as the remedy\nstderr:\n${err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }

    // The `--` spelling is unchanged, and carries every dash shape through verbatim.
    await expect(["--", "-v", "--long=1", "x"], [
      "n=3",
      "0:[-v]:2",
      "1:[--long=1]:8",
      "2:[x]:1",
    ]);
  },
});