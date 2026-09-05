// `vl std` and the RESOLUTION SURFACE of the native host — the consumer-facing
// half of D1573/D1574: std ships inside the binary, a pin is one file, and every
// development override is something `vl --version` will name.
//
// What is pinned here, and what is deliberately NOT:
//   • the host's `std_hash` reproduces `stdHash` in scripts/gen-std.ts, digit for
//     digit — two independent implementations, so the identity `vl std --hash`
//     prints is cross-checked rather than trusted;
//   • `--dump` round-trips: the bytes it writes hash back to what `--hash` said;
//   • `--list` names every module with its size, `--hash` prints that and nothing
//     else, an unknown flag is exit 2, and `vl help std` exists;
//   • `--version` names the seed and the std, each with the rung it came from.
//
// NOT pinned: that this binary's EMBEDDED std equals the tree. A development
// build resolves the tree's `std/` anyway, so a std edit does not invalidate it
// — and demanding byte-equality here would make every std PR need a cargo
// rebuild. The two instruments that DO ask it are tests/std_embedded_test.ts
// (the generated sources, no binary needed) and ci.yml's `ci-embed-seed`, which
// builds the release binary from scratch and diffs `vl std --dump` against
// `std/`. When the local binary is behind, the tree comparison below says so
// out loud instead of failing.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary.
//
// @test-timing native

import { ROOT, VL, exists } from "./support/tree.ts";

import { collectStdSources, stdHash } from "../scripts/gen-std.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL);
if (GATED && !ENABLED) console.warn("[vl-std-cmd] skipped — missing vl binary.");

const run = async (
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    stdout: "piped",
    stderr: "piped",
    cwd: ROOT,
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", ...env },
    clearEnv: true,
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

/** The `[name, source]` pairs of a std DIRECTORY, in `stdHash` order. */
const readStdDir = async (dir: string): Promise<[string, string][]> => {
  const out: [string, string][] = [];
  const walk = async (d: string, prefix: string): Promise<void> => {
    for await (const e of Deno.readDir(d)) {
      if (e.isDirectory) await walk(`${d}/${e.name}`, `${prefix}${e.name}/`);
      else if (e.isFile && e.name.endsWith(".vl")) {
        out.push([
          prefix + e.name.slice(0, -3),
          await Deno.readTextFile(`${d}/${e.name}`),
        ]);
      }
    }
  };
  await walk(dir, "");
  out.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return out;
};

Deno.test({
  name: "vl-std: `--hash` is 16 hex digits and nothing else",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run(["std", "--hash"]);
    if (r.code !== 0) throw new Error(`want exit 0, got ${r.code}:\n${r.err}`);
    if (!/^[0-9a-f]{16}\n$/.test(r.out)) {
      throw new Error(`want one 16-hex-digit line, got ${JSON.stringify(r.out)}`);
    }
  },
});

Deno.test({
  name: "vl-std: `--dump` round-trips — the bytes written hash back to `--hash`",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_std_dump_" });
    try {
      const dump = await run(["std", "--dump", dir]);
      if (dump.code !== 0) throw new Error(`--dump failed ${dump.code}:\n${dump.err}`);
      const hash = (await run(["std", "--hash"])).out.trim();
      const back = stdHash(await readStdDir(dir));
      if (back !== hash) {
        throw new Error(
          `\`vl std --dump\` does not round-trip: --hash says ${hash}, the written ` +
            `files hash as ${back}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-std: the host's std_hash agrees with scripts/gen-std.ts on the SAME tree",
  ignore: !ENABLED,
  fn: async () => {
    // Point the binary at a tree this test hashes itself: the two implementations
    // then answer about identical bytes, which is the only way the agreement
    // means anything (a dump comparison would only re-ask the binary).
    const dir = await Deno.makeTempDir({ prefix: "vl_std_hash_" });
    try {
      const dump = await run(["std", "--dump", dir]);
      if (dump.code !== 0) throw new Error(`--dump failed ${dump.code}:\n${dump.err}`);
      await Deno.writeTextFile(`${dir}/zz_probe.vl`, "export function probe(): i32 {\n  return 1\n}\n");
      const want = stdHash(await readStdDir(dir));
      const r = await run(["std"], { VL_STD: dir });
      if (r.code !== 0) throw new Error(`\`vl std\` failed ${r.code}:\n${r.err}`);
      if (!r.out.includes(want)) {
        throw new Error(
          `the host and scripts/gen-std.ts disagree about one tree — gen-std says ` +
            `${want}, the host printed:\n${r.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-std: `--list` names every embedded module with its size",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run(["std", "--list"]);
    if (r.code !== 0) throw new Error(`want exit 0, got ${r.code}:\n${r.err}`);
    const lines = r.out.trimEnd().split("\n");
    if (lines.length === 0) throw new Error("`vl std --list` printed nothing");
    for (const line of lines) {
      if (!/^std:[a-z0-9_/]+\t\d+ bytes$/.test(line)) {
        throw new Error(`want \`std:NAME<TAB>N bytes\`, got ${JSON.stringify(line)}`);
      }
    }
    for (const want of ["std:array", "std:fmt", "std:json", "std:test"]) {
      if (!lines.some((l) => l.startsWith(`${want}\t`))) {
        throw new Error(`\`vl std --list\` never mentions ${want}:\n${r.out}`);
      }
    }
  },
});

Deno.test({
  name: "vl-std: an unknown flag is exit 2, and `vl help std` exists",
  ignore: !ENABLED,
  fn: async () => {
    const bad = await run(["std", "--frobnicate"]);
    if (bad.code !== 2) throw new Error(`want exit 2 for an unknown flag, got ${bad.code}`);
    if (!bad.err.includes("--frobnicate") || !bad.err.includes("vl help std")) {
      throw new Error(`the error must name the flag and point at the help:\n${bad.err}`);
    }
    const help = await run(["help", "std"]);
    if (help.code !== 0 || !help.out.includes("vl std")) {
      throw new Error(`want \`vl help std\` at exit 0, got ${help.code}:\n${help.out}`);
    }
  },
});

Deno.test({
  name: "vl-std: `--version` names the seed and the std, each with its rung",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run(["--version"]);
    if (r.code !== 0) throw new Error(`want exit 0, got ${r.code}:\n${r.err}`);
    if (!r.out.startsWith("vl ")) throw new Error(`want a leading \`vl \` line:\n${r.out}`);
    for (const want of ["commit:", "seed:", "std:"]) {
      if (!r.out.includes(want)) {
        throw new Error(`\`vl --version\` should carry a \`${want}\` line, got:\n${r.out}`);
      }
    }
    // A development build resolves the checkout it sits in — the rung whose loss
    // would silently re-point every gate at another tree's std.
    if (!r.out.includes("development tree")) {
      throw new Error(
        `this binary is a development build and should say so in --version, got:\n${r.out}`,
      );
    }
  },
});

Deno.test({
  name: "vl-std: `$VL_STD` wins, and `vl std` says the two copies differ",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_std_over_" });
    try {
      const dump = await run(["std", "--dump", dir]);
      if (dump.code !== 0) throw new Error(`--dump failed ${dump.code}:\n${dump.err}`);
      await Deno.writeTextFile(`${dir}/zz_probe.vl`, "export function probe(): i32 {\n  return 1\n}\n");
      const r = await run(["std"], { VL_STD: dir });
      if (r.code !== 0) throw new Error(`\`vl std\` failed ${r.code}:\n${r.err}`);
      if (!r.out.includes(dir) || !r.out.includes("$VL_STD override")) {
        throw new Error(`\`vl std\` should name the override, got:\n${r.out}`);
      }
      if (!r.out.includes("DIFFERENT")) {
        throw new Error(
          `a std with one extra module is not the embedded one, and \`vl std\` should ` +
            `say so:\n${r.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-std: the binary's embedded std matches the tree (informational when behind)",
  ignore: !ENABLED,
  fn: async () => {
    const hash = (await run(["std", "--hash"])).out.trim();
    const tree = stdHash(await collectStdSources());
    if (hash !== tree) {
      // NOT a failure: a development build reads `std/` off the tree, so it is
      // only this binary's baked copy that is behind. tests/std_embedded_test.ts
      // gates the generated sources, and ci-embed-seed gates a fresh binary.
      console.warn(
        `[vl-std-cmd] this vl binary's embedded std is ${hash}, the tree is ${tree} — ` +
          `rebuild the host (cargo build --release) to re-arm this comparison`,
      );
    }
  },
});
