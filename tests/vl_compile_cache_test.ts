// THE WHOLE-COMPILE FILE CACHE (opt-in, `VL_COMPILE_CACHE=1`) — stage S1 of
// docs/internals/incremental-compilation-design.md, gates 2 and 3 of its §4.2.
//
//   1. A hit serves what a cold compile wrote: an `-O` build `cmp`-equal, each pooled
//      `vl test` file's report unchanged, and an edit to one file missing for it alone.
//   2. A MUTATION MATRIX: changing any one input class makes the next lookup MISS — the
//      entry, a file at a recorded-absent path, a flag, a keyed variable, the seed, the
//      cwd, the entry's spelling, the colour.
//   3. Controls: an INERT variable must still HIT (a matrix that always missed would pass
//      without it), and a BYPASS variable neither hits nor stores.
//   4. A forged result that differs from a cold compile exits 71 under verify mode.
//   5. Stage S2, the `-O` chain (`-O hit`, `-O miss`, … in the trace): a hit writes the
//      module and source map a cold run wrote, and each chain input misses — the rung, the
//      seed, a `BINARYEN_*` variable, the `wasm-opt`'s bytes or its absence, `-o` under
//      `--source-map` — while `-o` alone still hits.
//   6. The guard against an unrecorded input: every guest export the host calls and every
//      `CMD_*` code is classified below, and an unclassified one fails this file.
//
// Evidence is `VL_COMPILE_CACHE_TRACE=1`'s stderr lines and the files on disk, never timing.
// Every case gets a private `VL_CACHE_DIR`. The population is one two-module program and two
// test files, named here; it is a check over those programs, not a claim about all of them.
// Each case is the only one some planted defect in the host's cache reds; a case that only
// re-caught another's was removed rather than kept as a second witness.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-compile-cache] skipped — missing vl binary or seed wasm.");
}

/** The `PATH` this test's builds see: `$VL_BINARYEN` first when set, since ci-native has no
 * binaryen on `PATH` and that is its only one. */
const PATH = [Deno.env.get("VL_BINARYEN"), Deno.env.get("PATH")].filter((d) => d).join(":");
/** The `wasm-opt` this test's builds resolve: `$VL_WASM_OPT`, else the first on `PATH`. */
const realWasmOpt = (): string | undefined =>
  Deno.env.get("VL_WASM_OPT") ?? PATH.split(":").map((d) => `${d}/wasm-opt`).find(exists);
// The `-O` cases need binaryen; with none they register ignored, like the other `-O` suites.
const HAVE_OPT = realWasmOpt() !== undefined;

type Ran = { code: number; out: string; err: string; trace: string[] };

const PREFIX = "vl: compile cache ";

/** Run `vl` with the cache on; an `extra` value of `null` removes that variable from the
 * inherited environment rather than setting it (an empty `$VL_WASM_OPT` is a path, not unset). */
const vl = async (
  args: string[],
  cwd: string,
  extra: Record<string, string | null> = {},
): Promise<Ran> => {
  const unset = Object.keys(extra).filter((k) => extra[k] === null);
  const set = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== null)) as Record<string, string>;
  const env = nativeEnv({
    VL_CACHE_DIR: `${cwd}/../cache`,
    VL_COMPILE_CACHE: "1",
    VL_COMPILE_CACHE_TRACE: "1",
    // An ambient verify adds `verified` lines to every trace; a case opts in itself.
    VL_COMPILE_CACHE_VERIFY: "0",
    NO_COLOR: "1",
    PATH,
    ...set,
  });
  const inherited = Deno.env.toObject();
  for (const k of unset) delete inherited[k];
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
    clearEnv: unset.length > 0,
    env: unset.length > 0 ? { ...inherited, ...env } : env,
  }).output();
  const err = new TextDecoder().decode(stderr);
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err,
    trace: err.split("\n").filter((l) => l.startsWith(PREFIX)).map((l) => l.slice(PREFIX.length)),
  };
};

const expect = (got: unknown, want: unknown, what: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

const LIB = "export function twice(x: i32): i32 { return x * 2 }\n";
const MAIN = 'import { twice } from "./lib"\nprint(twice(21))\n';
const TEST_A = 'import { expect, it, toEqual } from "std:test"\nimport { twice } from "./lib"\n' +
  'it("twice", () => { expect(twice(2)).toEqual(4) })\n';
const TEST_B = 'import { expect, it, toEqual } from "std:test"\nit("one", () => { expect(1).toEqual(1) })\n';

/** `<tmp>/p` holds the program and the test files; `<tmp>/cache` is the cache root. */
const setup = async (): Promise<{ tmp: string; p: string }> => {
  const tmp = await Deno.makeTempDir({ prefix: "vl-compilecache-" });
  const p = `${tmp}/p`;
  await Deno.mkdir(p);
  await Deno.writeTextFile(`${p}/lib.vl`, LIB);
  await Deno.writeTextFile(`${p}/main.vl`, MAIN);
  await Deno.writeTextFile(`${p}/a.test.vl`, TEST_A);
  await Deno.writeTextFile(`${p}/b.test.vl`, TEST_B);
  return { tmp, p };
};

const files = (tmp: string): string[] => {
  try {
    return [...Deno.readDirSync(`${tmp}/cache/compile`)].map((e) => e.name)
      .filter((n) => n.endsWith(".m") || n.endsWith(".r")).sort();
  } catch {
    return [];
  }
};

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b));
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));
const enc = (s: string) => new TextEncoder().encode(s);

/** The host's `seed_content_key` (vl-host main.rs): FNV-1a over 8-byte words in four lanes. */
const seedContentKey = (bytes: Uint8Array): string => {
  const M = (1n << 64n) - 1n, PRIME = 0x100000001b3n;
  const h = [0, 1, 2, 3].map(() => 0xcbf29ce484222325n);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const whole = bytes.length - bytes.length % 32;
  for (let i = 0; i < whole; i += 32) {
    for (let l = 0; l < 4; l++) h[l] = ((h[l] ^ dv.getBigUint64(i + l * 8, true)) * PRIME) & M;
  }
  const rotl = (x: bigint, r: bigint) => ((x << r) | (x >> (64n - r))) & M;
  let acc = h[0] ^ rotl(h[1], 16n) ^ rotl(h[2], 32n) ^ rotl(h[3], 48n);
  acc = ((acc ^ BigInt(bytes.length)) * PRIME) & M;
  for (let i = whole; i < bytes.length; i++) acc = ((acc ^ BigInt(bytes[i])) * PRIME) & M;
  return acc.toString(16).padStart(16, "0");
};

/** `[path, engine tag]` of each `<seed>.<key>.<tag>.cwasm` sidecar beside `seed`. */
const cwasmSidecars = (seed: string, key: string): [string, string][] => {
  const dir = seed.replace(/\/[^/]*$/, ""), stem = `${seed.slice(dir.length + 1)}.${key}.`;
  return [...Deno.readDirSync(dir)].map((e) => e.name)
    .filter((n) => n.startsWith(stem) && n.endsWith(".cwasm"))
    .map((n) => [`${dir}/${n}`, n.slice(stem.length, -".cwasm".length)]);
};

const test = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name: `native compile cache: ${name}`, ignore: !ENABLED, fn });
const testOpt = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name: `native compile cache: ${name}`, ignore: !ENABLED || !HAVE_OPT, fn });

const BUILD = ["build", "main.vl", "-o", "out.wasm"];

testOpt("an -O hit is byte-identical to its cold build", async () => {
  // `-O` is a second action (S2), the host's chain on the served bytes; a hit writes them.
  const { tmp, p } = await setup();
  try {
    const o1 = await vl(["build", "main.vl", "-O", "-o", "o1.wasm"], p);
    const o2 = await vl(["build", "main.vl", "-O", "-o", "o2.wasm"], p);
    expect([o1.trace, o2.trace], [["miss", "stored", "-O miss", "-O stored"], ["hit", "-O hit"]], "-O cold then hit");
    expect(await Deno.readFile(`${p}/o2.wasm`), await Deno.readFile(`${p}/o1.wasm`), "-O bytes");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("vl test: each pooled file hits on an unchanged rerun, with the same report", async () => {
  const { tmp, p } = await setup();
  try {
    const cold = await vl(["test", "."], p);
    expect([cold.code, cold.trace], [0, ["miss", "miss", "stored", "stored"]], "cold run");
    const hit = await vl(["test", "."], p);
    expect([hit.code, hit.trace, hit.out], [0, ["hit", "hit"], cold.out], "warm run");
    // An edit to one test file misses for that file alone.
    await Deno.writeTextFile(`${p}/b.test.vl`, TEST_B + "// edited\n");
    const edit = await vl(["test", "."], p);
    expect([edit.trace.sort(), edit.out], [["hit", "miss", "stored"], cold.out], "one file edited");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

/** Warm `args` in `cwd`, apply `mutate`, and return the next lookup's trace. */
const afterMutation = async (
  p: string,
  mutate: () => Promise<{ args?: string[]; cwd?: string; env?: Record<string, string> }>,
  args = BUILD,
): Promise<string[]> => {
  await vl(args, p);
  const warm = (await vl(args, p)).trace;
  expect(warm.length > 0 && warm.every((t) => t === "hit"), true, `warm before mutation (${args.join(" ")})`);
  const m = await mutate();
  return (await vl(m.args ?? args, m.cwd ?? p, m.env ?? {})).trace;
};

test("the mutation matrix: each input class misses", async () => {
  const { tmp, p } = await setup();
  try {
    const misses = (t: string[]) => t[0] === "miss";
    const rows: [string, () => Promise<{ args?: string[]; cwd?: string; env?: Record<string, string> }>][] = [
      ["a keyed variable set", () => Promise.resolve({ env: { VL_OPT_NO_FLAT: "1" } })],
      ["the cwd changed", async () => {
        const q = `${tmp}/q`;
        await Deno.mkdir(q, { recursive: true });
        for (const f of ["lib.vl", "main.vl"]) await Deno.copyFile(`${p}/${f}`, `${q}/${f}`);
        return { cwd: q };
      }],
      ["the entry spelled ./main.vl", () => Promise.resolve({ args: ["build", "./main.vl", "-o", "out.wasm"] })],
    ];
    for (const [what, mutate] of rows) {
      const t = await afterMutation(p, mutate);
      if (!misses(t)) throw new Error(`${what}: want a miss, got ${JSON.stringify(t)}`);
    }
    // The colour reaches a pooled `vl test` file as its synthetic `--color=` argument.
    const color = await afterMutation(
      p,
      () => Promise.resolve({ args: ["test", ".", "--color=always"] }),
      ["test", ".", "--color=never"],
    );
    expect(color.filter((t) => t === "miss").length, 2, "colour: both files miss");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("the token after -o is still a flag: `-o --names` and `-o --initial-memory=` miss", async () => {
  // Flags are scanned anywhere, so that token is both the output path and a staged flag;
  // a key built from a filtered argv served the plain build's bytes to it.
  const { tmp, p } = await setup();
  try {
    await vl(BUILD, p);
    for (const flag of ["--names", "--initial-memory=2MiB"]) {
      const t = await vl(["build", "main.vl", "-o", flag], p, { VL_COMPILE_CACHE_VERIFY: "1" });
      expect([t.code, t.trace[0]], [0, "miss"], `-o ${flag}`);
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("the seed's bytes are keyed, not its path", async () => {
  // The seed is copied with its Cranelift sidecars (content-keyed, so they still apply),
  // and then overwritten in place: the path and every variable stay the same. The lookup
  // runs before the seed loads, so a seed that cannot load still shows the miss.
  const { tmp, p } = await setup();
  try {
    const seed = `${tmp}/seed.wasm`;
    await Deno.copyFile(COMPILER, seed);
    const dir = COMPILER.replace(/\/[^/]*$/, ""), base = COMPILER.slice(dir.length + 1);
    for (const e of Deno.readDirSync(dir)) {
      if (e.name.startsWith(`${base}.`) && e.name.endsWith(".cwasm")) {
        await Deno.copyFile(`${dir}/${e.name}`, `${tmp}/seed.wasm${e.name.slice(base.length)}`);
      }
    }
    const env = { VL_COMPILER_WASM: seed };
    expect((await vl(BUILD, p, env)).trace, ["miss", "stored"], "cold");
    expect((await vl(BUILD, p, env)).trace, ["hit"], "warm");
    await Deno.writeFile(seed, new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
    expect((await vl(BUILD, p, env)).trace[0], "miss", "the seed overwritten");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("a file appearing at a recorded-absent path misses", async () => {
  // No successful compile in this population probes an absent path, so the transcript
  // carrying one is written by hand from the real one: same manifest key, the real reads
  // plus `ghost.vl` absent, and the real result under the result key that transcript names.
  const { tmp, p } = await setup();
  try {
    await vl(BUILD, p);
    const dir = `${tmp}/cache/compile`;
    const m = files(tmp).find((n) => n.endsWith(".m"))!;
    const r = files(tmp).find((n) => n.endsWith(".r"))!;
    const lines = (await Deno.readTextFile(`${dir}/${m}`)).trimEnd().split("\n");
    // The dependency's read, and the project-root query of each module (D5760).
    expect(lines.slice(0, 2), ["VLCM1", "T 3"], "the manifest holds one three-read transcript");
    const transcript = `T 4\n${lines.slice(2, 5).join("\n")}\n- ${hex(enc("ghost.vl"))}\n`;
    const rkey = await sha(new Uint8Array([...unhex(m.slice(0, 64)), ...enc(transcript)]));
    await Deno.writeTextFile(`${dir}/${m}`, `VLCM1\n${transcript}`);
    await Deno.copyFile(`${dir}/${r}`, `${dir}/${hex(rkey)}.r`);
    expect((await vl(BUILD, p)).trace, ["hit"], "ghost.vl absent: the forged transcript replays");
    await Deno.writeTextFile(`${p}/ghost.vl`, "");
    expect((await vl(BUILD, p)).trace, ["miss", "stored"], "ghost.vl present");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("controls: an inert variable hits, a bypass variable neither hits nor stores", async () => {
  const { tmp, p } = await setup();
  try {
    const off = await vl(BUILD, p, { VL_FUEL: "1" });
    expect([off.code, off.trace, files(tmp)], [0, ["off (bypass VL_FUEL)"], []], "bypass on a cold cache");
    await vl(BUILD, p);
    expect((await vl(BUILD, p, { VL_COMPILE_CACHE_MAX_MB: "64" })).trace, ["hit"], "inert variable");
    const n = files(tmp).length;
    const warm = await vl(BUILD, p, { VL_GC_STATS: "1" });
    expect([warm.trace, files(tmp).length], [["off (bypass VL_GC_STATS)"], n], "bypass on a warm cache");
    expect((await vl(BUILD, p, { VL_COMPILE_CACHE: "0" })).trace, ["off (not enabled)"], "opt-in only");
    // A failed compile stores nothing.
    await Deno.writeTextFile(`${p}/main.vl`, 'import { gone } from "./missing"\nprint(gone)\n');
    const bad = await vl(BUILD, p);
    expect([bad.code !== 0, bad.trace, files(tmp).length], [true, ["miss"], n], "a failed compile");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("verify mode exits 71 when a stored result differs from a cold compile", async () => {
  const { tmp, p } = await setup();
  try {
    await vl(BUILD, p);
    const dir = `${tmp}/cache/compile`;
    const r = files(tmp).find((n) => n.endsWith(".r"))!;
    const real = (await Deno.readFile(`${dir}/${r}`)).slice(40);
    const forged = real.slice();
    forged[forged.length - 1] ^= 0xff;
    const env = new Uint8Array([...enc("VLCR0001"), ...await sha(forged), ...forged]);
    await Deno.writeFile(`${dir}/${r}`, env);
    const v = await vl(BUILD, p, { VL_COMPILE_CACHE_VERIFY: "1" });
    expect([v.code, v.trace[0]], [71, "hit"], "verify mismatch");
    if (!v.err.includes("compile cache MISMATCH")) throw new Error(`no mismatch message:\n${v.err}`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

// ── `vl check`: one action per invocation ──────────────────────────────────

/** What a check run shows a user: its exit code, stdout, and stderr without the trace. */
const shown = (r: Ran) => [r.code, r.out, r.err.split("\n").filter((l) => !l.startsWith(PREFIX)).join("\n")];
const BAD = "let n: i32 = \"s\"\nprint(n)\n";

test("vl check: a hit replays the cold run's output and exit code, and verify mode agrees", async () => {
  const { tmp, p } = await setup();
  try {
    await Deno.writeTextFile(`${p}/bad.vl`, BAD);
    for (const args of [["check", "."], ["check", "main.vl"], ["check", "bad.vl", "--json"]]) {
      const off = await vl(args, p, { VL_COMPILE_CACHE: "0" });
      const cold = await vl(args, p);
      expect([cold.trace, shown(cold)], [["miss", "stored"], shown(off)], `cold ${args.join(" ")}`);
      const hit = await vl(args, p);
      expect([hit.trace, shown(hit)], [["hit"], shown(off)], `warm ${args.join(" ")}`);
      const ver = await vl(args, p, { VL_COMPILE_CACHE_VERIFY: "1" });
      expect([ver.trace, shown(ver)], [["hit", "verified"], shown(off)], `verify ${args.join(" ")}`);
    }
    // The failing check's code survives the hit.
    expect((await vl(["check", "."], p)).code, 1, "a failing check exits 1 on a hit");
    // Another flag or the colour is another key.
    expect((await vl(["check", ".", "--severity", "error"], p)).trace, ["miss", "stored"], "a flag");
    expect((await vl(["check", ".", "--color=always"], p)).trace, ["miss", "stored"], "the colour");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("vl check: an edited import misses, from a file or a directory check", async () => {
  // A directory check hands its roots to pool workers on other threads (`VL_JOBS=2` keeps
  // the pool on), and an import from outside the directory is read by those workers alone.
  const { tmp, p } = await setup();
  try {
    const sub = `${p}/sub`;
    await Deno.mkdir(sub);
    for (const n of ["x", "y", "z"]) {
      await Deno.writeTextFile(`${sub}/${n}.vl`, 'import { twice } from "../lib"\nprint(twice(1))\n');
    }
    const env = { VL_JOBS: "2" };
    for (const args of [["check", "main.vl"], ["check", "."], ["check", "sub"]]) {
      await Deno.writeTextFile(`${p}/lib.vl`, LIB);
      await vl(args, p, env);
      expect((await vl(args, p, env)).trace, ["hit"], `warm ${args.join(" ")}`);
      await Deno.writeTextFile(`${p}/lib.vl`, 'export function twice(x: string): i32 { return 2 }\n');
      const off = await vl(args, p, { ...env, VL_COMPILE_CACHE: "0" });
      const edit = await vl(args, p, env);
      expect([edit.trace, shown(edit)], [["miss", "stored"], shown(off)], `lib.vl edited: ${args.join(" ")}`);
      expect(edit.code, 1, `the edit is an error: ${args.join(" ")}`);
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("vl check: a file added to a checked directory misses; one added elsewhere hits", async () => {
  const { tmp, p } = await setup();
  try {
    await vl(["check", "."], p);
    expect((await vl(["check", "."], p)).trace, ["hit"], "warm");
    await Deno.writeTextFile(`${tmp}/elsewhere.vl`, BAD);
    expect((await vl(["check", "."], p)).trace, ["hit"], "a file outside the checked directory");
    await Deno.mkdir(`${p}/sub`);
    await Deno.writeTextFile(`${p}/sub/c.vl`, BAD);
    const off = await vl(["check", "."], p, { VL_COMPILE_CACHE: "0" });
    const added = await vl(["check", "."], p);
    expect([added.trace, shown(added)], [["miss", "stored"], shown(off)], "sub/c.vl added");
    expect(added.code, 1, "the added file is reported");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("vl check: an edited std module the program imports misses", async () => {
  // `std:` is read through the same recorded reader, from `$VL_STD` here.
  const { tmp, p } = await setup();
  try {
    const std = `${tmp}/std`;
    await Deno.mkdir(std);
    for (const e of Deno.readDirSync(`${ROOT}/std`)) {
      if (e.isFile && e.name.endsWith(".vl")) await Deno.copyFile(`${ROOT}/std/${e.name}`, `${std}/${e.name}`);
    }
    const env = { VL_STD: std };
    const args = ["check", "a.test.vl"];
    await vl(args, p, env);
    expect((await vl(args, p, env)).trace, ["hit"], "warm");
    const src = await Deno.readTextFile(`${std}/test.vl`);
    await Deno.writeTextFile(`${std}/test.vl`, `${src}\nexport function zzzUnused(): i32 { return 1 }\n`);
    expect((await vl(args, p, env)).trace, ["miss", "stored"], "std/test.vl edited");
    // A std module the program does not import is not in its transcript.
    await Deno.writeTextFile(`${std}/json.vl`, (await Deno.readTextFile(`${std}/json.vl`)) + "\n// edited\n");
    expect((await vl(args, p, env)).trace, ["hit"], "std/json.vl edited");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("vl check --fix: a run that writes stores nothing, and a hit never stands in for a write", async () => {
  const { tmp, p } = await setup();
  try {
    const before = "let keep = 2\nprint(keep)\n", after = "const keep = 2\nprint(keep)\n";
    await Deno.writeTextFile(`${p}/f.vl`, before);
    const args = ["check", "f.vl", "--fix"];
    const n = files(tmp).length;
    const wrote = await vl(args, p);
    expect([wrote.trace, files(tmp).length, await Deno.readTextFile(`${p}/f.vl`)], [["miss"], n, after], "writes");
    expect((await vl(args, p)).trace, ["miss", "stored"], "a fixed file: nothing to write");
    expect((await vl(args, p)).trace, ["hit"], "and then a hit");
    await Deno.writeTextFile(`${p}/f.vl`, before);
    const again = await vl(args, p);
    expect([again.trace, await Deno.readTextFile(`${p}/f.vl`)], [["miss"], after], "the old source again");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

test("vl check: bypass variables neither hit nor store; a forged result exits 71 under verify", async () => {
  const { tmp, p } = await setup();
  try {
    await vl(["check", "."], p);
    const n = files(tmp).length;
    for (const v of ["VL_CHECK_STATS", "VL_FUEL"]) {
      const r = await vl(["check", "."], p, { [v]: "1" });
      expect([r.trace, files(tmp).length], [[`off (bypass ${v})`], n], v);
    }
    expect((await vl(["check", "."], p, { VL_COMPILE_CACHE_MAX_MB: "64" })).trace, ["hit"], "inert variable");
    const dir = `${tmp}/cache/compile`;
    const r = files(tmp).find((f) => f.endsWith(".r"))!;
    const forged = (await Deno.readFile(`${dir}/${r}`)).slice(40);
    forged[0] ^= 1;
    await Deno.writeFile(`${dir}/${r}`, new Uint8Array([...enc("VLCR0001"), ...await sha(forged), ...forged]));
    const v = await vl(["check", "."], p, { VL_COMPILE_CACHE_VERIFY: "1" });
    expect([v.code, v.trace[0]], [71, "hit"], "verify mismatch");
    if (!v.err.includes("compile cache MISMATCH")) throw new Error(`no mismatch message:\n${v.err}`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

// ── stage S2: the `-O` chain ───────────────────────────────────────────────

const OPT = ["build", "main.vl", "-O3", "-o", "o.wasm"];
const optTrace = (t: string[]) => t.filter((l) => l.startsWith("-O "));

testOpt("-O3: a chain hit writes the module and source map a cold run wrote", async () => {
  const { tmp, p } = await setup();
  try {
    const args = [...OPT, "--source-map"];
    const cold = await vl(args, p);
    expect([cold.code, optTrace(cold.trace)], [0, ["-O miss", "-O stored"]], "cold");
    const mod = await Deno.readFile(`${p}/o.wasm`), map = await Deno.readFile(`${p}/o.wasm.map`);
    await Deno.remove(`${p}/o.wasm`);
    await Deno.remove(`${p}/o.wasm.map`);
    const hit = await vl(args, p);
    expect([hit.code, hit.trace], [0, ["hit", "-O hit"]], "warm");
    expect(await Deno.readFile(`${p}/o.wasm`), mod, "hit module equals cold module");
    expect(await Deno.readFile(`${p}/o.wasm.map`), map, "hit map equals cold map");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

testOpt("-O3: each chain input misses; -o without --source-map does not", async () => {
  const opt = realWasmOpt();
  if (!opt) throw new Error("no wasm-opt to wrap: set $VL_WASM_OPT or put binaryen on PATH");
  const { tmp, p } = await setup();
  try {
    const bin = `${tmp}/bin`;
    await Deno.mkdir(bin);
    const wrapper = `${bin}/wasm-opt`;
    const wrap = async (extra: string) => {
      await Deno.writeTextFile(wrapper, `#!/bin/sh\n${extra}exec '${opt}' "$@"\n`);
      await Deno.chmod(wrapper, 0o755);
    };
    await wrap("");
    /** Warm `args`, then run `next`; answer the chain's trace lines and the exit code. */
    const after = async (
      args: string[],
      next: string[],
      env: Record<string, string | null> = {},
      base: Record<string, string | null> = {},
    ) => {
      await vl(args, p, base);
      expect(optTrace((await vl(args, p, base)).trace), ["-O hit"], `warm (${args.join(" ")})`);
      const r = await vl(next, p, { ...base, ...env });
      return { code: r.code, t: optTrace(r.trace) };
    };
    const missRows: [string, string[], string[], Record<string, string | null>][] = [
      ["the rung (-O3 → -O)", OPT, ["build", "main.vl", "-O", "-o", "o.wasm"], {}],
      ["a BINARYEN_* variable", OPT, OPT, { BINARYEN_CORES: "3" }],
      [
        "-o under --source-map",
        [...OPT, "--source-map"],
        ["build", "main.vl", "-O3", "-o", "o2.wasm", "--source-map"],
        {},
      ],
    ];
    for (const [what, args, next, env] of missRows) {
      const { code, t } = await after(args, next, env);
      expect([code, t[0]], [0, "-O miss"], what);
    }
    // The same wrapper path with different bytes: the file is keyed, not only its path.
    const viaWrapper = { VL_WASM_OPT: wrapper };
    await vl(OPT, p, viaWrapper);
    await wrap(": swapped\n");
    expect(optTrace((await vl(OPT, p, viaWrapper)).trace)[0], "-O miss", "the wrapper's bytes changed");
    // No wasm-opt at all: never served, so the build still refuses. `$VL_WASM_OPT` overrides
    // the PATH scan, so it is removed from the inherited environment.
    const gone = await after(OPT, OPT, { PATH: `${tmp}/empty`, VL_WASM_OPT: null });
    expect([gone.code !== 0, gone.t], [true, ["-O miss"]], "wasm-opt missing");
    // Control: -o is not an input of the chain unless a source map names it.
    const o = await after(OPT, ["build", "main.vl", "-O3", "-o", "o3.wasm"]);
    expect([o.code, o.t], [0, ["-O hit"]], "-o alone");
    expect(await Deno.readFile(`${p}/o3.wasm`), await Deno.readFile(`${p}/o.wasm`), "-o alone: same bytes");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

testOpt("-O3: the seed is a chain input, since its optPipeStart reads the rung's input", async () => {
  const { tmp, p } = await setup();
  try {
    // The same compiler with one empty custom section appended: every emitted byte is the
    // same, so only the seed's own key can make the chain miss.
    const seed = `${tmp}/seed.wasm`;
    const seedBytes = new Uint8Array([...await Deno.readFile(COMPILER), 0, 2, 1, 0x78]);
    await Deno.writeFile(seed, seedBytes);
    // `--compiler`, not `$VL_COMPILER_WASM`: a `VL_*` variable is keyed on its own.
    const a = await vl(["build", "main.vl", "-O3", "-o", "a.wasm", "--compiler", COMPILER], p);
    // The section changes no code, so COMPILER's compiled sidecars serve the new seed under
    // its own key, and the host skips a whole-seed Cranelift compile.
    const sidecars = cwasmSidecars(COMPILER, seedContentKey(await Deno.readFile(COMPILER)));
    expect(sidecars.length > 0, true, "the ported seed key names COMPILER's own sidecar");
    const key = seedContentKey(seedBytes);
    for (const [path, tag] of sidecars) await Deno.copyFile(path, `${seed}.${key}.${tag}.cwasm`);
    const b = await vl(["build", "main.vl", "-O3", "-o", "b.wasm", "--compiler", seed], p);
    expect(
      [a.code, optTrace(a.trace), b.code, optTrace(b.trace)],
      [0, ["-O miss", "-O stored"], 0, ["-O miss", "-O stored"]],
      "another seed",
    );
    expect(await Deno.readFile(`${p}/b.wasm`), await Deno.readFile(`${p}/a.wasm`), "same module");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

testOpt("-O3: an explain variable bypasses the chain, stores nothing", async () => {
  const { tmp, p } = await setup();
  try {
    await vl(OPT, p);
    const n = files(tmp).length;
    const r = await vl(OPT, p, { VL_INLINE_EXPLAIN: "1" });
    expect(
      [r.code, optTrace(r.trace), files(tmp).length],
      [0, ["-O off (bypass VL_INLINE_EXPLAIN)"], n],
      "bypass",
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

// ── the guard: every host→guest channel is classified ──────────────────────
//
// `input` is a staging call or a command reply the cache keys (by the staged values, the
// transcript, or the host build for the engine's own verdicts); `output` is read back and
// never keyed; `uncached` is used only on a path no cached action runs or stores (the
// `vl test`/`vl fmt` pump, test collect/run, a write or a stdin read, which a `check` run
// never stores, and the rep-shadow, check-stats and keep-modules paths, which are bypasses).
// A new export or command joins this table only by someone deciding which it is.
const EXPORTS: Record<string, "input" | "output" | "uncached"> = {
  checkEntryPathCommit: "input", checkEntryPathPush: "input", cliArgCommit: "input",
  cliArgPush: "input", cliArgReset: "input", cliCheckNextRoot: "input",
  cliCheckParentOf: "input", cliCheckPoolStage: "input", cliCheckPooledCommit: "input",
  cliCheckPresetRoot: "input", cliCmdData: "output", cliCmdPath: "output",
  cliDirCommit: "input", cliDirEntryPush: "input", cliDirNamePush: "input",
  cliExitCode: "output", cliFileCommit: "input", cliNext: "output", cliResult: "input",
  cliTestCompiledCommit: "uncached", cliTestFileCommit: "uncached",
  cliTestJobsWanted: "uncached", cliTestNameCommit: "uncached", cliTestNamePush: "uncached",
  cliTestOutPush: "uncached", cliTestPlanCount: "uncached", cliTestPlanFile: "uncached",
  cliTestPlanTest: "uncached", cliTestPoolStage: "input", cliTestResultCommit: "uncached",
  cliValidateCommit: "input", cliValidateNamesFile: "uncached", cwdCommit: "input",
  cwdPush: "input", diagAt: "output",
  diagCol: "output", diagCount: "output", diagLen: "output", diagLine: "output",
  diagModule: "output", diagMsgAt: "output", diagMsgLen: "output", elabLateAt: "uncached",
  elabLateCount: "uncached", elabLateLen: "uncached", emitFnSpanAt: "output",
  emitFnSpanCol: "output", emitFnSpanKindOf: "output", emitFnSpanLine: "output",
  emitFnSpanModule: "output", emitFnSpanNameAt: "output", emitFnSpanNameLen: "output",
  emitTypeLabelAt: "output", emitTypeLabelLen: "output",
  heapWindowRead: "output", hostAbi: "output", identAuditArm: "uncached",
  identAuditDropSet: "uncached", identAuditRowAt: "uncached", identAuditRowCount: "uncached",
  identAuditRowLen: "uncached", identAuditRowN: "uncached",
  identAuditUnresolved: "uncached", modCommit: "input", modKey: "input",
  modKeyAtCharAt: "output", modKeyAtLen: "output", modKeyCount: "output",
  modPendingAt: "output", modPendingCount: "output", modPendingLen: "output",
  modReset: "input", modRootCommit: "input", modRootDir: "input", modRootKey: "input",
  modSrc: "input", optInLoad: "input", optInReset: "input",
  optOut: "output", optPipeArgv: "input", optPipeResume: "input", optPipeStart: "input",
  optStripSrc: "input",
  rbyte: "output", repShadowCount: "uncached",
  repShadowMsgAt: "uncached", repShadowMsgLen: "uncached", repShadowReasonAt: "uncached",
  repShadowReasonCount: "uncached", repShadowReasonLen: "uncached",
  repShadowReasonN: "uncached", repShadowStat: "uncached", setEmitNames: "input",
  setEmitSrcMap: "input", setHeapWindow: "input", setImportMemory: "input",
  setLowMemoryUnused: "input", setMemoryPages: "input", setOneShot: "input",
  setOptimized: "input", setRepShadow: "uncached", setSharedMemory: "input", src: "input",
  srcReset: "input",
  vlRootCommit: "input", vlRootPush: "input", vltCount: "uncached", vltFailAt: "uncached",
  vltFailLen: "uncached", vltNameAt: "uncached", vltNameLen: "uncached", vltRun: "uncached",
  vltSkipped: "uncached", wiModStat: "uncached", wiStat: "uncached", wiTraceAt: "uncached",
  wiTraceCount: "uncached", wiTraceLen: "uncached",
};

// A pooled worker answers DONE, LIST_DIR (a constant 0), READ_FILE (recorded), the two
// prints and STASH (outputs), and refuses every other code; `vl build` issues none. A
// `vl check` action serves LIST_DIR and READ_FILE through the recorded reader, keys
// VALIDATE on the host build, and stores no run that issued WRITE_FILE or READ_STDIN.
const COMMANDS: Record<string, "input" | "output" | "uncached"> = {
  CMD_DONE: "output", CMD_LIST_DIR: "input", CMD_READ_FILE: "input",
  CMD_WRITE_FILE: "uncached", CMD_PRINT_OUT: "output", CMD_PRINT_ERR: "output",
  CMD_READ_STDIN: "uncached", CMD_TEST_STASH: "output", CMD_TEST_COLLECT: "uncached",
  CMD_TEST_RUN: "uncached", CMD_VALIDATE: "input", CMD_TEST_ENQUEUE: "uncached",
  CMD_TEST_COMPILE: "uncached", CMD_CHECK_ENQUEUE: "input", CMD_CHECK_POOL: "input",
  CMD_CHECK_ROOT_DONE: "output",
};

Deno.test("compile cache: the seed is keyed on the bytes that compile, read once", async () => {
  // A seed replaced mid-run must not file one seed's output under the other's key, so the
  // key's hash and the compile share one read (`seed_bytes`) and nothing reads the seed file
  // a second time.
  const src = await Deno.readTextFile(`${ROOT}/scripts/vl-host/src/main.rs`);
  const body = (name: string) => src.slice(src.indexOf(`fn ${name}(`), src.indexOf("\n}\n", src.indexOf(`fn ${name}(`)));
  for (const fn of ["load_compiler_module", "compiler_hash"]) {
    if (!body(fn).includes("seed_bytes(")) throw new Error(`${fn} does not read the seed through seed_bytes`);
  }
  if (/std::fs::read\(compiler_path\)/.test(src)) throw new Error("a second read of the seed file");
});

Deno.test("compile cache: every guest export and CMD code the host uses is classified", async () => {
  const src = await Deno.readTextFile(`${ROOT}/scripts/vl-host/src/main.rs`);
  const used = new Set<string>();
  for (const m of src.matchAll(/get_typed_func::<[^>]*>\([^,]*,\s*"(\w+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/(?:StrIn|StrOut|BytesOut)::probe\([^,]*,\s*[^,]*,\s*"(\w+)"/g)) used.add(m[1]);
  const cmds = new Set([...src.matchAll(/^const (CMD_\w+): i32/gm)].map((m) => m[1]));
  const missing = [...used].filter((n) => !(n in EXPORTS)).sort();
  const missingCmd = [...cmds].filter((n) => !(n in COMMANDS)).sort();
  if (missing.length || missingCmd.length) {
    throw new Error(
      `unclassified host→guest channel(s) — decide whether each is a compile-cache input:\n` +
        `  exports: ${missing.join(", ") || "none"}\n  commands: ${missingCmd.join(", ") || "none"}`,
    );
  }
  // The detector itself: it must have seen the channels this table names.
  if (used.size < 60 || cmds.size < 12) throw new Error(`the scan found too little: ${used.size} / ${cmds.size}`);
});
