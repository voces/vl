// NATIVE `vl` SELF-DISCOVERY — the help/usage surface of the Rust host
// (scripts/vl-host/src/main.rs, the self-discovery block).
//
// The contracts under test, each load-bearing for a real consumer:
//   * bare `vl` is RESERVED for a future REPL: a SHORT stderr hint, exit 2 —
//     and it still EXECUTES, which is all lsp/src/extension.ts's spawn probe
//     needs (`spawnSync(vl, [])`, any exit code);
//   * `vl --help` / `-h` / `vl help` print the overview to STDOUT, exit 0;
//   * `vl help <cmd>` and `vl <cmd> --help` print that command's help, exit 0;
//   * an unknown command exits 2 with a one-liner + `vl --help` pointer, and a
//     near-miss (`vl chekc`) carries a did-you-mean;
//   * `vl seed` stdout stays RAW WASM BYTES — the LSP seed ladder execs it
//     straight into `new WebAssembly.Module`, so not one styled byte may leak
//     there (the reason color is gated per printer, never wrapped globally);
//   * `vl run p.vl --help` keeps its exit-2 diagnostic: after the source file,
//     tokens belong to the PROGRAM, and the diagnostic explains `--`.
//
// GATING: same as tests/vl_check_args_test.ts — env-gated (`SELFHOST_NATIVE_ALIGN=1`)
// AND requires the built binary + seed wasm.

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
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-help] skipped — missing vl binary or seed wasm.");
}

const run = async (
  args: string[],
): Promise<{ code: number; out: string; err: string; outBytes: Uint8Array }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_COMPILER_WASM: COMPILER },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
    outBytes: stdout,
  };
};

Deno.test({
  name: "vl-help: bare `vl` is a short stderr hint, exit 2 (reserved for a REPL)",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run([]);
    if (r.code !== 2) {
      throw new Error(`want exit 2 from bare \`vl\`, got ${r.code}\nstderr:\n${r.err}`);
    }
    if (r.out !== "") {
      throw new Error(`bare \`vl\` must print nothing to stdout, got:\n${r.out}`);
    }
    if (!r.err.includes("vl --help")) {
      throw new Error(`the hint must point at \`vl --help\`, got:\n${r.err}`);
    }
    // SHORT: a hint, not the overview — the overview is 30+ lines.
    const lines = r.err.trimEnd().split("\n").length;
    if (lines > 8) {
      throw new Error(`the bare hint should stay short, got ${lines} lines:\n${r.err}`);
    }
  },
});

Deno.test({
  name: "vl-help: --help / -h / `vl help` print the overview to stdout, exit 0",
  ignore: !ENABLED,
  fn: async () => {
    for (const args of [["--help"], ["-h"], ["help"]]) {
      const r = await run(args);
      if (r.code !== 0) {
        throw new Error(`want exit 0 from vl ${args[0]}, got ${r.code}\nstderr:\n${r.err}`);
      }
      if (r.err !== "") {
        throw new Error(`vl ${args[0]} must not write stderr, got:\n${r.err}`);
      }
      for (const want of ["Usage:", "run", "build", "check", "fmt", "test", "seed", "vl help <command>"]) {
        if (!r.out.includes(want)) {
          throw new Error(`vl ${args[0]} overview should mention ${JSON.stringify(want)}, got:\n${r.out}`);
        }
      }
    }
  },
});

Deno.test({
  name: "vl-help: `vl help <cmd>` and `vl <cmd> --help` agree, stdout, exit 0",
  ignore: !ENABLED,
  fn: async () => {
    for (const cmd of ["run", "build", "check", "fmt", "test", "seed"]) {
      const a = await run(["help", cmd]);
      const b = await run([cmd, "--help"]);
      if (a.code !== 0 || b.code !== 0) {
        throw new Error(`want exit 0 for ${cmd} help, got help=${a.code} --help=${b.code}`);
      }
      if (a.out !== b.out) {
        throw new Error(`\`vl help ${cmd}\` and \`vl ${cmd} --help\` should print the same text`);
      }
      if (!a.out.includes("Usage:") || !a.out.includes(`vl ${cmd}`)) {
        throw new Error(`help for ${cmd} should carry a synopsis, got:\n${a.out}`);
      }
    }
  },
});

Deno.test({
  name: "vl-help: unknown command exits 2 with a pointer; a near-miss suggests",
  ignore: !ENABLED,
  fn: async () => {
    const bad = await run(["frobnicate"]);
    if (bad.code !== 2) {
      throw new Error(`want exit 2 for an unknown command, got ${bad.code}`);
    }
    if (!bad.err.includes("`frobnicate`") || !bad.err.includes("vl --help")) {
      throw new Error(`the error must name the offender and point at vl --help, got:\n${bad.err}`);
    }
    const typo = await run(["chekc", "x.vl"]);
    if (typo.code !== 2 || !typo.err.includes("check")) {
      throw new Error(
        `\`vl chekc\` should exit 2 and suggest \`check\`, got ${typo.code}:\n${typo.err}`,
      );
    }
  },
});

Deno.test({
  name: "vl-help: --version prints one line, exit 0",
  ignore: !ENABLED,
  fn: async () => {
    for (const flag of ["--version", "-V"]) {
      const r = await run([flag]);
      if (r.code !== 0 || !r.out.startsWith("vl ") || r.out.trimEnd().includes("\n")) {
        throw new Error(`want one \`vl <version>\` line at exit 0 from ${flag}, got ${r.code}:\n${r.out}`);
      }
    }
  },
});

Deno.test({
  name: "vl-help: `vl seed` stdout stays raw wasm bytes, byte-identical to the seed",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run(["seed"]);
    if (r.code !== 0) {
      throw new Error(`want exit 0 from \`vl seed\` to a pipe, got ${r.code}\nstderr:\n${r.err}`);
    }
    const seed = await Deno.readFile(COMPILER);
    if (r.outBytes.length !== seed.length) {
      throw new Error(
        `\`vl seed\` stdout must be exactly the seed: want ${seed.length} bytes, got ${r.outBytes.length}`,
      );
    }
    for (let i = 0; i < seed.length; i++) {
      if (r.outBytes[i] !== seed[i]) {
        throw new Error(`\`vl seed\` stdout differs from the seed at byte ${i}`);
      }
    }
  },
});

Deno.test({
  name: "vl-help: `vl run <file> --help` keeps the exit-2 program-args diagnostic",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_help_run_" });
    const file = `${dir}/probe.vl`;
    await Deno.writeTextFile(file, "print(1)\n");
    try {
      const r = await run(["run", file, "--help"]);
      if (r.code !== 2) {
        throw new Error(`want exit 2 (tokens after the file are the program's), got ${r.code}`);
      }
      if (!r.err.includes("after `--`")) {
        throw new Error(`the diagnostic should explain \`--\`, got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
