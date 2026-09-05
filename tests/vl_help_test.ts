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
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-help] skipped — missing vl binary or seed wasm.");
}

const run = async (
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; out: string; err: string; outBytes: Uint8Array }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1", ...env }),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
    outBytes: stdout,
  };
};

/** Mirrors `seed_hash` in scripts/vl-host/src/main.rs — `std_hash`'s own FNV-1a
 * fold applied to one `("seed", bytes)` pair. Lets a test derive the digest
 * `vl --version` SHOULD print straight from the seed file, rather than trusting
 * (or copying) whatever the binary happens to say. */
const seedHashBytes = (bytes: Uint8Array): string => {
  const MASK = (1n << 64n) - 1n;
  const PRIME = 0x100000001b3n;
  const enc = new TextEncoder();
  let h = 0xcbf29ce484222325n;
  const feed = (b: Uint8Array): void => {
    for (const byte of b) h = ((h ^ BigInt(byte)) * PRIME) & MASK;
  };
  feed(enc.encode("seed"));
  feed(new Uint8Array([0]));
  feed(enc.encode(String(bytes.length)));
  feed(new Uint8Array([0]));
  feed(bytes);
  feed(new Uint8Array([0]));
  return h.toString(16).padStart(16, "0");
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
    for (const cmd of ["run", "build", "check", "fmt", "test", "seed", "std"]) {
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

// The FIRST line stays `vl <version> (host ABI N)` and nothing else — the shape
// `--version | head -1` and every `startsWith("vl ")` reader depends on. The
// lines under it are D1573/D1574's answer to "which seed and which std is this
// binary", which was previously unanswerable from outside.
Deno.test({
  name: "vl-help: --version leads with one `vl <version>` line, then names seed and std",
  ignore: !ENABLED,
  fn: async () => {
    // Derived from the seed file, not copied from a printed value — see
    // "reproduce the ORIGINAL, not a reconstruction" in CLAUDE.md.
    const seedBytes = await Deno.readFile(COMPILER);
    const wantHash = seedHashBytes(seedBytes);
    for (const flag of ["--version", "-V"]) {
      const r = await run([flag]);
      const lines = r.out.trimEnd().split("\n");
      if (r.code !== 0 || !/^vl \S+ \(host ABI \d+\)$/.test(lines[0] ?? "")) {
        throw new Error(
          `want a \`vl <version> (host ABI N)\` first line at exit 0 from ${flag}, got ${r.code}:\n${r.out}`,
        );
      }
      for (const want of ["commit:", "seed:", "std:"]) {
        if (!lines.some((l) => l.startsWith(want))) {
          throw new Error(`${flag} should carry a \`${want}\` line, got:\n${r.out}`);
        }
      }
      // The seed line carries a content hash in the same shape as the std
      // line's (`N bytes, <16 hex digits>`) — a byte COUNT alone cannot tell
      // two seeds apart when they happen to match.
      const seedLine = lines.find((l) => l.startsWith("seed:")) ?? "";
      const m = seedLine.match(/\((\d+) bytes, ([0-9a-f]{16})\)/);
      if (!m) {
        throw new Error(
          `\`seed:\` line should carry \`(N bytes, <16 hex digits>)\`, got:\n${seedLine}`,
        );
      }
      if (Number(m[1]) !== seedBytes.length) {
        throw new Error(
          `\`seed:\` line's byte count disagrees with the seed file (want ${seedBytes.length}):\n${seedLine}`,
        );
      }
      if (m[2] !== wantHash) {
        throw new Error(
          `\`seed:\` line's hash does not match the seed file's own FNV-1a fold ` +
            `(want ${wantHash}, computed from ${COMPILER}):\n${seedLine}`,
        );
      }
    }
  },
});

// Two seeds sharing a byte count are exactly the case a byte count alone
// cannot distinguish — the consumer ask this closes. A one-byte flip keeps
// the length identical and must still change the printed hash.
Deno.test({
  name: "vl-help: --version's seed hash tells apart two same-length seeds",
  ignore: !ENABLED,
  fn: async () => {
    const original = await Deno.readFile(COMPILER);
    const mutated = new Uint8Array(original);
    mutated[0] = mutated[0] ^ 0xff;
    const dir = await Deno.makeTempDir({ prefix: "vl_seed_hash_" });
    try {
      const altPath = `${dir}/vl-compiler.wasm`;
      await Deno.writeFile(altPath, mutated);
      const r = await run(["--version"], { VL_COMPILER_WASM: altPath });
      if (r.code !== 0) throw new Error(`want exit 0, got ${r.code}:\n${r.err}`);
      const seedLine = r.out.split("\n").find((l) => l.startsWith("seed:")) ?? "";
      const m = seedLine.match(/\((\d+) bytes, ([0-9a-f]{16})\)/);
      if (!m) throw new Error(`\`seed:\` line missing its hash:\n${seedLine}`);
      if (Number(m[1]) !== original.length) {
        throw new Error(`the mutated seed changed length, which defeats this test's premise`);
      }
      const wantOriginal = seedHashBytes(original);
      const wantMutated = seedHashBytes(mutated);
      if (wantOriginal === wantMutated) {
        throw new Error("test bug: the one-byte flip did not change the reference hash");
      }
      if (m[2] !== wantMutated) {
        throw new Error(
          `want the MUTATED seed's hash ${wantMutated}, got ${m[2]} in:\n${seedLine}`,
        );
      }
      if (m[2] === wantOriginal) {
        throw new Error(
          `\`vl --version\` printed the ORIGINAL seed's hash for a mutated, same-length seed:\n${seedLine}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
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
