// `std:process` and `std:env` ACROSS BOTH LIVE HOSTS — the five imports the process
// floor added, asserted where each host can actually answer for them.
//
// What is pinned here:
//   • NATIVE (`scripts/vl-host/src/main.rs`): `runProgram` spawns and waits, a non-zero
//     exit is a `code` and not an error, both streams come back whole and separately, an
//     EMPTY argument survives the NUL-separated argv encoding while a NUL BYTE in one is
//     refused before the spawn, a missing program is an `IoError`, `getEnv` reads what the
//     spawn was given and answers `null` for unset, and `exit(3)` really ends it at 3;
//   • V8 (`tests/support/runWasm.ts`): `__proc_exit__` is the ONE process import that
//     harness can honour — it unwinds as `VLExitError` carrying the code — and the four
//     that carry a `u8[]` throw the documented "not available" refusal, the same wall
//     the filesystem floor meets there.
//
// The two EMITTER positions a void host import has are covered on purpose: a bare
// `exit(3)` statement, and a function whose whole body is one. Each is a separate arm
// of the emitter's drop/tail-value ladders, and each was invalid wasm before this
// landed.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native` auto-discovers
// (tests/ci_seed_coverage_test.ts), and a seed-backed test matching neither glob nor an
// explicit ci.yml step runs nowhere in CI.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed
// wasm, so it self-ignores on a fresh clone and runs in `ci-native`.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";
import { VLExitError, runWasm } from "./support/runWasm.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-std-process] skipped — missing vl binary or seed wasm.");
}

type Ran = { code: number; out: string; err: string };

const tmpEntry = async (src: string): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_std_process_" });
  const p = `${dir}/probe.vl`;
  await Deno.writeTextFile(p, src);
  return p;
};

/** Compile and run `src` through the native `vl`, with the tree's own std pinned. */
const runNative = async (
  src: string,
  env: Record<string, string> = {},
): Promise<Ran> => {
  const entry = await tmpEntry(src);
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", entry, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1", ...env }),
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

/** Build `src` to wasm bytes with the native `vl` — the input the V8 harness takes. */
const buildWasm = async (src: string): Promise<Uint8Array> => {
  const entry = await tmpEntry(src);
  const out = `${entry}.wasm`;
  const built = await new Deno.Command(VL, {
    args: ["build", entry, "--compiler", COMPILER, "-o", out],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  if (built.code !== 0) {
    throw new Error(
      `\`vl build\` exited ${built.code}\n${new TextDecoder().decode(built.stderr)}`,
    );
  }
  return await Deno.readFile(out);
};

const want = (got: unknown, expected: unknown, what: string): void => {
  const g = JSON.stringify(got);
  const e = JSON.stringify(expected);
  if (g !== e) throw new Error(`${what}: want ${e}, got ${g}`);
};

const PRELUDE = `import { IoError, exit, runProgram } from "std:process"
import { getEnv } from "std:env"
import { Utf8Error, decodeUtf8 } from "std:utf8"
import { toString } from "std:fmt"

const none: string[] = []

function text(bytes: u8[]): string {
  const t = decodeUtf8(bytes)
  if t is Utf8Error { return "<not utf-8>" }
  t
}
`;

Deno.test({
  name: "std:process — exit codes, captured streams, and the empty argument",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runNative(`${PRELUDE}
const ok = runProgram("true", none)
if ok is IoError { print("ERR " + ok.msg) } else { print("true=" + toString(ok.code)) }

const bad = runProgram("false", none)
if bad is IoError { print("ERR " + bad.msg) } else { print("false=" + toString(bad.code)) }

// \`printf\` takes the format and one argument, so an EMPTY argument has to survive the
// NUL-separated argv block for the output to read \`[|]\`.
const pf = runProgram("printf", ["[%s|%s]", "", "z"])
if pf is IoError {
  print("ERR " + pf.msg)
} else {
  print("printf=" + text(pf.stdout))
  print("stderr=" + toString(pf.stderr.length))
}

// Two streams, separately: \`sh -c\` writes one line to each.
const two = runProgram("sh", ["-c", "echo out; echo err 1>&2; exit 7"])
if two is IoError {
  print("ERR " + two.msg)
} else {
  // The byte counts as well as the text: \`echo\`'s trailing newline is part of what
  // was captured, and a line-oriented comparison of the printed text cannot see it.
  print("code=" + toString(two.code))
  print("outlen=" + toString(two.stdout.length))
  print("errlen=" + toString(two.stderr.length))
  print("out=" + text(two.stdout))
  print("err=" + text(two.stderr))
}
`);
    want(r.code, 0, `exit code (stderr: ${r.err})`);
    want(r.out.split("\n").filter((l) => l.length > 0), [
      "true=0",
      "false=1",
      "printf=[|z]",
      "stderr=0",
      "code=7",
      "outlen=4",
      "errlen=4",
      "out=out",
      "err=err",
    ], "output");
  },
});

Deno.test({
  name: "std:process — a program that cannot start is an IoError, not a code",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runNative(`${PRELUDE}
const missing = runProgram("vl-definitely-no-such-program", none)
if missing is IoError { print(missing.msg) } else { print("SPAWNED " + toString(missing.code)) }

const blank = runProgram("", none)
if blank is IoError { print(blank.msg) } else { print("SPAWNED " + toString(blank.code)) }
`);
    want(r.code, 0, `exit code (stderr: ${r.err})`);
    const lines = r.out.split("\n").filter((l) => l.length > 0);
    want(lines.length, 2, "line count");
    if (!lines[0].includes("ENOENT")) {
      throw new Error(`a missing program should name ENOENT, got ${lines[0]}`);
    }
    want(lines[1], "process.runProgram: the command is empty", "empty command");
  },
});

Deno.test({
  name: "std:process — a NUL byte is refused before the spawn, not split into an argv",
  ignore: !ENABLED,
  fn: async () => {
    // A VL `string` CAN carry a NUL, and the argv block separates on that byte — so
    // without this pre-flight the child receives one more argument than the caller
    // wrote, silently. The control below proves the value really does hold the byte.
    const r = await runNative(`${PRELUDE}
const nul = decodeUtf8([97, 0, 98])
if nul is Utf8Error {
  print("ERR the control is not a string")
} else {
  print("len=" + toString(nul.length))
  const inArg = runProgram("echo", ["[", nul, "]"])
  if inArg is IoError { print(inArg.msg) } else { print("SPAWNED " + text(inArg.stdout)) }
  const inCmd = runProgram(nul, none)
  if inCmd is IoError { print(inCmd.msg) } else { print("SPAWNED " + toString(inCmd.code)) }
}
`);
    want(r.code, 0, `exit code (stderr: ${r.err})`);
    want(r.out.split("\n").filter((l) => l.length > 0), [
      "len=3",
      "process.runProgram: argument 1 contains a NUL byte",
      "process.runProgram: the command contains a NUL byte",
    ], "output");
  },
});

Deno.test({
  name: "std:env — set, unset, and a name no environment can hold",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runNative(
      `${PRELUDE}
const set = getEnv("VL_PROCESS_SUITE_VAR")
if set == null {
  print("null")
} else {
  if set is IoError { print("ERR " + set.msg) } else { print("set=" + set) }
}

const unset = getEnv("VL_PROCESS_SUITE_ABSENT")
if unset == null {
  print("unset=null")
} else {
  if unset is IoError { print("ERR " + unset.msg) } else { print("unset=" + unset) }
}

const blank = getEnv("")
if blank == null {
  print("blank=null")
} else {
  if blank is IoError { print("blank=" + blank.msg) } else { print("blank=" + blank) }
}
`,
      { VL_PROCESS_SUITE_VAR: "a value with spaces" },
    );
    want(r.code, 0, `exit code (stderr: ${r.err})`);
    want(r.out.split("\n").filter((l) => l.length > 0), [
      "set=a value with spaces",
      "unset=null",
      "blank=env.getEnv: the name is empty",
    ], "output");
  },
});

Deno.test({
  name: "std:process — exit(3) ends the process, in both emitter positions",
  ignore: !ENABLED,
  fn: async () => {
    // STATEMENT position: `exit(3)` stands alone, and the emitter must not `drop` a
    // value the diverging import never leaves.
    const stmt = await runNative(`${PRELUDE}
print("before")
exit(3)
print("after")
`);
    want(stmt.code, 3, `statement-position exit code (stderr: ${stmt.err})`);
    want(stmt.out, "before\n", "output survives the exit");

    // TAIL position: a function whose whole body is the diverging call, which the
    // emitter must classify as a statement rather than as that function's value.
    const tail = await runNative(`${PRELUDE}
function bail(n: i32) { exit(n) }
print("before")
bail(4)
print("after")
`);
    want(tail.code, 4, `tail-position exit code (stderr: ${tail.err})`);
    want(tail.out, "before\n", "output survives the exit");
  },
});

Deno.test({
  name: "V8 harness — exit unwinds as VLExitError, the u8[] four refuse",
  ignore: !ENABLED,
  fn: async () => {
    const exiting = await buildWasm(`${PRELUDE}
print("before")
exit(5)
`);
    let caught: unknown = null;
    try {
      await runWasm(exiting);
    } catch (err) {
      caught = err;
    }
    if (!(caught instanceof VLExitError)) {
      throw new Error(
        `want a VLExitError from __proc_exit__, got ${String(caught)}`,
      );
    }
    want(caught.code, 5, "the code the guest asked for");

    const spawning = await buildWasm(`${PRELUDE}
const r = runProgram("true", none)
if r is IoError { print(r.msg) } else { print(toString(r.code)) }
`);
    let refusal: unknown = null;
    try {
      await runWasm(spawning);
    } catch (err) {
      refusal = err;
    }
    const msg = refusal instanceof Error ? refusal.message : String(refusal);
    if (!msg.includes("__proc_run__") || !msg.includes("not available")) {
      throw new Error(
        `want the documented V8 refusal naming __proc_run__, got ${msg}`,
      );
    }
  },
});
