// NATIVE `vl run` ARGUMENT ROUTING — which tokens are the HOST's and which are the
// PROGRAM's. `vl run` is the only subcommand that has both: `check`/`fmt`/`test`
// parse strictly in VL (compiler/cli.vl `cliParseArgs`, pinned by
// tests/vl_check_args_test.ts) and `vl run --batch` bails on an unknown flag, but
// the plain `vl run` walk ended in `_ => {}` — every unrecognised dash-led token was
// consumed and discarded with no diagnostic and no exit code. Measured on 26fa381c:
//
//   vl run p.vl hello world 42   →  3 / hello / world / 42    ok
//   vl run p.vl "" x             →  2 / (empty) / x           ok
//   vl run p.vl -v x             →  1 / x                     `-v` SILENTLY GONE
//   vl run p.vl -o out.wasm      →  1 / out.wasm              flag eaten, VALUE injected
//   vl run -weird.vl             →  no file set; fell through to the stdin read,
//                                   which BLOCKS FOREVER on a pipe (measured: killed
//                                   at 120s) and prints usage on /dev/null
//   vl run p.vl -- --batch x     →  rc 1 "vl run --batch: unknown flag `--`" — the
//                                   batch probe scanned PAST the separator, so a
//                                   program argument spelled `--batch` hijacked the host
//   vl run -e <src> a b          →  1 / b — `a` was assigned to `file`, which the
//                                   `-e` path never reads, so it vanished
//
// That made argv unusable for its motivating consumer: a VL script taking any
// flag-shaped option could not be written. The rule now is the one `deno run`,
// `cargo run` and `npm run` use — `--` ends host parsing, everything after it is the
// program's verbatim — composed with a LOUD rejection before the separator, so a
// dash-led token is never silently reinterpreted in either direction.
//
// `--` is PERMITTED, NOT REQUIRED: `vl run p.vl a b` still passes `a`, `b`. The
// separator is only needed for an argument that looks like a flag.
//
// The probe reads argv through the raw intrinsics `__args_count__` / `__args_get__`
// rather than `std:args`, which is not merged; `__args_get__` returns `u8[]`, decoded
// with the merged `std:utf8`. Both intrinsics are NATIVE-ONLY (tests/support/runWasm.ts
// throws for them — WasmGC values cannot be built from JS), which is why this suite is
// gated on the native binary.
//
// GATING: same as tests/vl_check_args_test.ts — env-gated (`SELFHOST_NATIVE_ALIGN=1`)
// AND requires the built binary + seed wasm.

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-run-args] skipped — missing vl binary or seed wasm.");
}

// Echoes argv: the count, then one line per argument.
const PROBE = `import { decodeUtf8Lossy } from "std:utf8"
const n = __args_count__()
print(n)
let i = 0
while i < n {
  print(decodeUtf8Lossy(__args_get__(i)))
  i = i + 1
}
`;

// stdin is "null", never "piped": a `vl run` that resolves NO source file falls
// through to the stdin read, and on an open pipe that blocks forever. /dev/null makes
// the old hang show up as a wrong MESSAGE (which is asserted) rather than as a CI
// test that never returns.
const run = async (
  args: string[],
  cwd?: string,
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", ...args],
    cwd,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
    // `VL_COMPILER_WASM` rather than `--compiler`, because the point here is
    // argument handling: an extra flag would change what `vl run` is parsing.
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

/** stdout as lines, with the trailing blank from the final newline dropped. */
const lines = (s: string): string[] => s.replace(/\n$/, "").split("\n");

const withProbe = async (
  fn: (file: string, dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_run_args_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, PROBE);
  try {
    await fn(file, dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

/** Assert the program ran and saw exactly `want` as its argument list. */
const expectArgs = (
  r: { code: number; out: string; err: string },
  want: string[],
  what: string,
): void => {
  if (r.code !== 0) {
    throw new Error(`${what}: expected exit 0, got ${r.code}: ${r.err.trim()}`);
  }
  const got = lines(r.out);
  const expected = [String(want.length), ...want];
  if (got.length !== expected.length || got.some((l, i) => l !== expected[i])) {
    throw new Error(
      `${what}: expected argv ${JSON.stringify(expected)}, got ${
        JSON.stringify(got)
      }`,
    );
  }
};

// ── The bug: a flag-shaped PROGRAM argument must reach the guest ──────────────

Deno.test({
  name: "run: a flag-shaped program argument arrives after `--`",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      // The headline case. On 26fa381c this printed `1` / `x`.
      expectArgs(await run([file, "--", "-v", "x"]), ["-v", "x"], "-- -v x");
      // Long flags, a flag with an `=` value, and a bare `-` all pass verbatim.
      expectArgs(
        await run([file, "--", "--verbose", "--out=x", "-"]),
        ["--verbose", "--out=x", "-"],
        "long/=/bare-dash",
      );
      // A token that collides with one of the HOST's own flags is still the
      // program's once it is past the separator.
      expectArgs(
        await run([file, "--", "--compiler", "-O", "--batch"]),
        ["--compiler", "-O", "--batch"],
        "host-flag spellings past `--`",
      );
      // A SECOND `--` is data, not a second separator.
      expectArgs(
        await run([file, "--", "--", "-v"]),
        ["--", "-v"],
        "double --",
      );
      // Positionals before the separator keep their place ahead of the tail.
      expectArgs(await run([file, "a", "--", "-b"]), ["a", "-b"], "a -- -b");
      // `--` with nothing after it is an empty argument list, not an error.
      expectArgs(await run([file, "--"]), [], "trailing --");
    });
  },
});

Deno.test({
  name: "run: `--batch` after `--` is the program's, not the host's",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      // The batch probe used to scan the whole command line, so this dispatched
      // into `run_batch` and died with "vl run --batch: unknown flag `--`" (rc 1).
      const r = await run([file, "--", "--batch", "x"]);
      expectArgs(r, ["--batch", "x"], "-- --batch x");
    });
  },
});

// ── The rejection: loud, exit 2, names the token and the remedy ───────────────

Deno.test({
  name: "run: an unknown dash-led token before `--` is a usage error naming it",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      const r = await run([file, "-v", "x"]);
      // 2 is this CLI's usage-error code (`usage()` here, `cliUsageErr` in
      // compiler/cli.vl); 1 means the program or its compilation failed.
      if (r.code !== 2) {
        throw new Error(`expected exit 2, got ${r.code}: ${r.err.trim()}`);
      }
      if (!r.err.includes("unknown flag `-v`")) {
        throw new Error(`the error must NAME the token, got: ${r.err}`);
      }
      if (!r.err.includes("after `--`")) {
        throw new Error(
          "the error must name `--` as the remedy, got: " + r.err,
        );
      }
      // ...and it must name the token IN the remedy, so the note is a runnable line.
      if (!r.err.includes("vl run <file.vl> -- -v")) {
        throw new Error(`the remedy must echo the token, got: ${r.err}`);
      }
      // The rejection replaces the run — the program must not have executed.
      if (r.out !== "") {
        throw new Error(`the program ran anyway, stdout: ${r.out}`);
      }
    });
  },
});

Deno.test({
  name:
    "run: `-o <path>` no longer eats the flag and injects its value into argv",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file, dir) => {
      // `-o` is a `vl build` flag and has never meant anything to `run`. It used to
      // be swallowed while `out.wasm` became the program's ONLY argument.
      const r = await run([file, "-o", `${dir}/out.wasm`]);
      if (r.code !== 2) {
        throw new Error(`expected exit 2, got ${r.code}: ${r.err.trim()}`);
      }
      if (!r.err.includes("unknown flag `-o`")) {
        throw new Error("the error must name `-o`, got: " + r.err);
      }
    });
  },
});

Deno.test({
  name:
    "run: a dash-led FILE argument errors with the `./` remedy, never hangs",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (_file, dir) => {
      const weird = `${dir}/-weird.vl`;
      await Deno.writeTextFile(weird, PROBE);
      // Bare `-weird.vl` is indistinguishable from a flag. It used to set no file
      // and fall into the stdin read; now it names the token AND, because the token
      // also names an existing path, the `./` spelling that fixes it. The child runs
      // IN `dir` (Deno.Command's own cwd) rather than the suite calling `Deno.chdir`,
      // which would move the whole worker process out from under any sibling test.
      const bad = await run(["-weird.vl", "a"], dir);
      if (bad.code !== 2) {
        throw new Error(`expected exit 2, got ${bad.code}: ${bad.err.trim()}`);
      }
      if (!bad.err.includes("unknown flag `-weird.vl`")) {
        throw new Error(`the error must name the token, got: ${bad.err}`);
      }
      if (!bad.err.includes("./-weird.vl")) {
        throw new Error(
          `an existing dash-led path must get the ./ remedy, got: ${bad.err}`,
        );
      }
      // And the remedy it names actually works.
      expectArgs(await run(["./-weird.vl", "a"], dir), ["a"], "./-weird.vl a");
    });
  },
});

Deno.test({
  name:
    "run: a value-taking flag with no value is a usage error, not a silent default",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      // Used to leave `compiler` unset and resolve the DEFAULT seed, so a truncated
      // command line silently ran against a compiler the caller never named.
      const r = await run([file, "--compiler"]);
      if (r.code !== 2) {
        throw new Error(`expected exit 2, got ${r.code}: ${r.err.trim()}`);
      }
      if (!r.err.includes("`--compiler` requires a value")) {
        throw new Error(`expected a missing-value usage error, got: ${r.err}`);
      }
    });
  },
});

// ── The spellings that worked before must still work ──────────────────────────

Deno.test({
  name: "run: today's working spellings are unchanged (no separator needed)",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      // No arguments at all — the list is empty, not absent.
      expectArgs(await run([file]), [], "vl run p.vl");
      // Plain positionals, with NO `--`: the separator is permitted, not required.
      expectArgs(await run([file, "a", "b"]), ["a", "b"], "vl run p.vl a b");
      expectArgs(
        await run([file, "hello", "world", "42"]),
        ["hello", "world", "42"],
        "three positionals",
      );
      // An EMPTY argument is a real argument and survives (`""` is not dash-led).
      expectArgs(await run([file, "", "x"]), ["", "x"], "empty arg preserved");
      // `-O` is a build flag that `run` has always accepted and ignored — it must
      // not become an error, and it must not enter argv.
      expectArgs(await run(["-O", file, "a"]), ["a"], "vl run -O p.vl a");
      expectArgs(await run(["-O3", file, "a"]), ["a"], "vl run -O3 p.vl a");
      expectArgs(
        await run(["--names", file, "a"]),
        ["a"],
        "vl run --names p.vl a",
      );
      expectArgs(await run([file, "--wat", "a"]), ["a"], "vl run p.vl --wat a");
      expectArgs(
        await run([file, "--no-validate", "a"]),
        ["a"],
        "vl run p.vl --no-validate a",
      );
      // `--compiler X` AFTER the file — the spelling tests/vl_union_return_sink_test.ts
      // and tests/vl_diag_pos use. Neither the flag nor its value reaches argv.
      expectArgs(
        await run([file, "--compiler", COMPILER, "a"]),
        ["a"],
        "vl run p.vl --compiler X a",
      );
      // ...and before the file, too.
      expectArgs(
        await run(["--compiler", COMPILER, file, "a"]),
        ["a"],
        "vl run --compiler X p.vl a",
      );
    });
  },
});

Deno.test({
  name: "run: `-e` keeps every positional as a program argument",
  ignore: !ENABLED,
  fn: async () => {
    // With `-e` there is no source file, so no positional is one. The first used to
    // be assigned to `file` — which the `-e` path never reads — and disappear.
    const src = `print(__args_count__())`;
    const r = await run(["-e", src, "a", "b"]);
    if (r.code !== 0) {
      throw new Error(`expected exit 0, got ${r.code}: ${r.err.trim()}`);
    }
    if (lines(r.out)[0] !== "2") {
      throw new Error(`expected 2 args on the -e path, got: ${r.out.trim()}`);
    }
    // `-e` with no positionals is still an empty list.
    const none = await run(["-e", src]);
    if (lines(none.out)[0] !== "0") {
      throw new Error(`expected 0 args, got: ${none.out.trim()}`);
    }
  },
});

Deno.test({
  name: "run: --batch and the stdin path are untouched",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file, dir) => {
      // `--batch` before any separator still dispatches to the batch runner, which
      // writes one `.out` per case. Program arguments are empty under `--batch` (one
      // process, many programs), which is what the probe reports.
      const out = `${dir}/bout`;
      const r = await run(["--batch", "--out-dir", out, file]);
      if (r.code !== 0) {
        throw new Error(`--batch exited ${r.code}: ${r.err.trim()}`);
      }
      const got = await Deno.readTextFile(`${out}/probe.vl.out`);
      if (lines(got)[0] !== "0") {
        throw new Error(`expected 0 args under --batch, got: ${got.trim()}`);
      }
    });
  },
});
