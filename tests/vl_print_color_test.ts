// COLORED `print` — STAGE C0, and the one property it exists to protect: ANSI
// NEVER LEAKS. The ruling is docs/serde-design.md §"Print, templates, and color
// ride the same renderer"; the mechanism is `Palette` in scripts/vl-host/src/main.rs.
//
// The policy, and the row of this file that pins each clause:
//
//   escapes only when stdout isatty …………………… "a pipe is escape-free"
//   … AND NO_COLOR unset ……………………………………… "NO_COLOR suppresses on a tty"
//   … AND TERM != dumb ………………………………………… "TERM=dumb suppresses on a tty"
//   --color=always overrides (even onto a pipe) …… "--color=always colors a pipe"
//   --color=never overrides (even on a tty) ……… "--color=never suppresses on a tty"
//   a bare STRING is never colored ………………………… "a string is never colored"
//   the renderer's strings stay pure ……………………… "std:fmt output carries no escape"
//   machine artifacts stay clean ………………………………… "--batch output is never colored"
//   the test runner does not double-wrap ………………… "vl test relays program output plain"
//
// WHY MOST ROWS NEED NO TTY. `Deno.Command` gives the child pipes, which is the
// negative arm by construction — so a suite written only with it would prove the
// leak-free half and never once see a colored byte, and would pass identically
// against a host that had no color at all. `--color=always` is what makes the
// POSITIVE arm reachable without a terminal, and the three tty rows below use
// util-linux `script -qec` (a real pty) and skip themselves where it is absent.
//
// THE PALETTE IS NODE'S, MEASURED. `util.inspect.styles` on node v24.11.1 gives
// number/bigint/boolean = yellow and `util.inspect.colors.yellow = [33, 39]`;
// `console.log(5)` on a pty emits `ESC[33m5ESC[39m` and `console.log("s")` emits
// `s`. The exact-bytes assertions below are that measurement, pinned.
//
// GATING: as tests/vl_run_args_test.ts — env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND
// requires the built native binary + the seed wasm.

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const STD = `${ROOT}/std`;
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-print-color] skipped — missing vl binary or seed wasm.");
}

const ESC = "\x1b";
/** Node's yellow, open and close — `util.inspect.colors.yellow === [33, 39]`. */
const YELLOW = `${ESC}[33m`;
const YELLOW_OFF = `${ESC}[39m`;

/** Every 0x1b in `s`. The whole policy is a statement about this number. */
const escapes = (s: string): number => s.split(ESC).length - 1;

const run = async (
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
    env: {
      RUST_BACKTRACE: "0",
      VL_COMPILER_WASM: COMPILER,
      VL_STD: STD,
      ...env,
    },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

/** A temp dir holding one file, removed afterwards. */
const withFile = async (
  name: string,
  source: string,
  fn: (file: string, dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl-print-color-" });
  const file = `${dir}/${name}`;
  await Deno.writeTextFile(file, source);
  try {
    await fn(file, dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

/** Four printed VALUES and one printed STRING — the whole split in one program. */
const MIXED = `print(5)
print(1.5)
print(true)
print(false)
print("a bare string")
`;
/** What every arm of the policy must produce once the escapes are stripped. */
const MIXED_PLAIN = "5\n1.5\ntrue\nfalse\na bare string\n";
/** Four values wrapped, the string bare: 4 × 2 escapes. */
const MIXED_COLORED = [5, 1.5, true, false]
  .map((v) => `${YELLOW}${v}${YELLOW_OFF}\n`)
  .join("") + "a bare string\n";

const eq = (what: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}: want ${w}, got ${g}`);
};

// ── the negative arm: a pipe, under every environment ────────────────────────

Deno.test({
  name: "print color: a pipe is escape-free",
  ignore: !ENABLED,
  fn: async () => {
    await withFile("m.vl", MIXED, async (file) => {
      // Default, and with a color-capable TERM set — neither makes a pipe a tty.
      for (const env of [{}, { TERM: "xterm-256color" }]) {
        const { code, out } = await run(["run", file], env);
        eq("exit code", code, 0);
        eq(`escapes with TERM=${JSON.stringify(env)}`, escapes(out), 0);
        eq("output", out, MIXED_PLAIN);
      }
    });
  },
});

// ── the positive arm without a terminal: --color=always ──────────────────────

Deno.test({
  name: "print color: --color=always colors a pipe, and only the VALUES",
  ignore: !ENABLED,
  fn: async () => {
    await withFile("m.vl", MIXED, async (file) => {
      const { code, out } = await run(["run", file, "--color=always"]);
      eq("exit code", code, 0);
      // The exact bytes, not a count: this is Node's palette, pinned.
      eq("output", out, MIXED_COLORED);
      eq("escapes", escapes(out), 8);
      // And the string line is byte-identical to the piped run's.
      const plainLast = MIXED_PLAIN.split("\n").at(-2);
      eq("the string line", out.split("\n").at(-2), plainLast);
    });
  },
});

Deno.test({
  name: "print color: --color=never suppresses, --color=auto is the default",
  ignore: !ENABLED,
  fn: async () => {
    await withFile("m.vl", MIXED, async (file) => {
      for (const flag of ["--color=never", "--color=auto"]) {
        const { code, out } = await run(["run", file, flag]);
        eq(`exit code (${flag})`, code, 0);
        eq(`escapes (${flag})`, escapes(out), 0);
      }
    });
  },
});

Deno.test({
  name: "print color: an explicit --color overrides NO_COLOR",
  ignore: !ENABLED,
  fn: async () => {
    // The NO_COLOR spec asks software to honor the variable "when it is not
    // overridden by a command-line option", which is what this pins: the flag is
    // the override, the variable is the ambient default. Without this row the
    // precedence would be an unstated implementation detail.
    await withFile("m.vl", MIXED, async (file) => {
      const forced = await run(["run", file, "--color=always"], {
        NO_COLOR: "1",
      });
      eq("escapes with NO_COLOR + --color=always", escapes(forced.out), 8);
      const off = await run(["run", file], { NO_COLOR: "1" });
      eq("escapes with NO_COLOR alone", escapes(off.out), 0);
    });
  },
});

// ── the string layer stays pure ──────────────────────────────────────────────

Deno.test({
  name: "print color: a string is never colored, even under --color=always",
  ignore: !ENABLED,
  fn: async () => {
    // `print("42")` is the sharp case: the same CHARACTERS a colored `print(42)`
    // produces, arriving down the string channel (__print_char__ /
    // __print_str_flush__) rather than the value channel. If the two were ever
    // routed together this row is what would catch it.
    const src = `print("plain")\nprint("42")\nprint("true")\n`;
    await withFile("s.vl", src, async (file) => {
      const { code, out } = await run(["run", file, "--color=always"]);
      eq("exit code", code, 0);
      eq("output", out, "plain\n42\ntrue\n");
      eq("escapes", escapes(out), 0);
    });
  },
});

Deno.test({
  name: "print color: std:fmt output carries no escape",
  ignore: !ENABLED,
  fn: async () => {
    // The ruling's load-bearing half: `toString`/`show<T>` output NEVER contains
    // ANSI, so a template hole, a serialized payload and a log file cannot
    // capture one. A rendered number is a STRING by the time print sees it.
    const src = `import { toString } from "std:fmt"
const n = 7
print("n = " + toString(n))
print(toString(n))
`;
    await withFile("f.vl", src, async (file) => {
      const { code, out, err } = await run(["run", file, "--color=always"]);
      // Assert it RAN: a program that fails to compile prints nothing to stdout,
      // and "no output" would satisfy "no escapes" while measuring nothing.
      eq(`exit code (stderr: ${err})`, code, 0);
      eq("output", out, "n = 7\n7\n");
      eq("escapes", escapes(out), 0);
    });
  },
});

// ── machine artifacts and the test runner ────────────────────────────────────

Deno.test({
  name: "print color: --batch output is never colored",
  ignore: !ENABLED,
  fn: async () => {
    // A `.out` file is compared byte-for-byte by the distilled corpus, so
    // `--color=always` must not reach it. The flag is accepted (and its value
    // validated) so the spelling is uniform, then deliberately ignored.
    await withFile("b.vl", MIXED, async (file, dir) => {
      const out = `${dir}/out`;
      const { code } = await run([
        "run",
        "--batch",
        "--out-dir",
        out,
        file,
        "--color=always",
      ]);
      eq("exit code", code, 0);
      const text = await Deno.readTextFile(`${out}/b.vl.out`);
      eq("captured output", text, MIXED_PLAIN);
      eq("escapes", escapes(text), 0);
    });
  },
});

Deno.test({
  name: "print color: vl test relays program output plain",
  ignore: !ENABLED,
  fn: async () => {
    // A failing test's captured output is pushed CHARACTER BY CHARACTER into a VL
    // string for the reporter to lay out (CMD_TEST_RUN's `out_push`). An escape
    // there would be an escape inside a VL string value — the one thing the
    // ruling forbids outright — and it would land inside the reporter's own
    // styling rather than beside it. So the runner's own report may color; the
    // program's output may not.
    const src = `import { expect, it, toEqual } from "std:test"

it("prints a number then fails", () => {
  print(7)
  expect(1).toEqual(2)
})
`;
    await withFile("c0.test.vl", src, async (_file, dir) => {
      const { out, err } = await run(["test", dir, "--color=always"]);
      const report = out + err;
      // It must actually have RELAYED something, or the rest grades an empty
      // string. The runner prints the captured block under its own header.
      if (!report.includes("captured output")) {
        throw new Error(`no captured-output block in the report:\n${report}`);
      }
      if (!/^\s+7$/m.test(report)) {
        throw new Error(`the relayed line \`7\` is missing:\n${report}`);
      }
      if (report.includes(`${YELLOW}7${YELLOW_OFF}`)) {
        throw new Error(`vl test double-wrapped program output:\n${report}`);
      }
      // ...while the report around it IS colored, so this is a real split and
      // not just a run with color switched off everywhere.
      if (escapes(report) === 0) {
        throw new Error(`the runner's own report lost its color:\n${report}`);
      }
    });
  },
});

// ── the flag itself ──────────────────────────────────────────────────────────

Deno.test({
  name: "print color: an unrecognized --color value is a usage error",
  ignore: !ENABLED,
  fn: async () => {
    // Not a silent fallback to "never": a flag that quietly ignores its own value
    // is a flag that lies about what it did. Exit 2 is this CLI's usage code.
    await withFile("m.vl", MIXED, async (file, dir) => {
      const r = await run(["run", file, "--color=purple"]);
      eq("run exit code", r.code, 2);
      if (!r.err.includes("always, never, or auto")) {
        throw new Error(`expected the accepted values named, got: ${r.err}`);
      }
      // The same rejection on the pump-driven subcommands, which resolve the
      // flag in the host and hand the answer to the VL formatter.
      const c = await run(["check", dir, "--color=purple"]);
      eq("check exit code", c.code, 2);
      if (!c.err.includes("always, never, or auto")) {
        throw new Error(`expected the accepted values named, got: ${c.err}`);
      }
      const b = await run([
        "run",
        "--batch",
        "--out-dir",
        `${dir}/o`,
        file,
        "--color=purple",
      ]);
      if (b.code === 0) throw new Error("--batch accepted --color=purple");
    });
  },
});

// ── the tty arm, where a pty is available ────────────────────────────────────

/** util-linux `script -qec CMD /dev/null` — a real pty, so `isatty` says yes. */
const hasScript = await (async () => {
  try {
    const { code } = await new Deno.Command("script", {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    }).output();
    return code === 0;
  } catch {
    return false;
  }
})();
if (ENABLED && !hasScript) {
  console.warn("[vl-print-color] tty rows skipped — no util-linux `script`.");
}

/** Run `cmd` under a pty and return its combined output. */
const onTty = async (cmd: string): Promise<string> => {
  const { stdout } = await new Deno.Command("script", {
    args: ["-qec", cmd, "/dev/null"],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  return new TextDecoder().decode(stdout);
};

Deno.test({
  name: "print color: a tty colors by default, NO_COLOR and TERM=dumb suppress",
  ignore: !ENABLED || !hasScript,
  fn: async () => {
    await withFile("m.vl", MIXED, async (file) => {
      const base = `VL_COMPILER_WASM=${COMPILER} VL_STD=${STD}`;
      const colored = await onTty(`env TERM=xterm ${base} ${VL} run ${file}`);
      // The pty turns \n into \r\n, so compare on the escapes and the wrapping
      // rather than the whole buffer.
      eq("escapes on a tty", escapes(colored), 8);
      if (!colored.includes(`${YELLOW}5${YELLOW_OFF}`)) {
        throw new Error(`a number was not wrapped in yellow: ${colored}`);
      }
      if (!/(^|\r|\n)a bare string/.test(colored)) {
        throw new Error(`the string line was not raw: ${colored}`);
      }

      for (const off of ["NO_COLOR=1", "TERM=dumb"]) {
        const suppressed = await onTty(
          `env TERM=xterm ${off} ${base} ${VL} run ${file}`,
        );
        eq(`escapes on a tty with ${off}`, escapes(suppressed), 0);
      }

      const never = await onTty(
        `env TERM=xterm ${base} ${VL} run ${file} --color=never`,
      );
      eq("escapes on a tty with --color=never", escapes(never), 0);
    });
  },
});
