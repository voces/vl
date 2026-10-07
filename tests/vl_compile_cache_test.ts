// THE WHOLE-COMPILE FILE CACHE (opt-in, `VL_COMPILE_CACHE=1`) — stage S1 of
// docs/internals/incremental-compilation-design.md, gates 2 and 3 of its §4.2.
//
//   1. A hit is byte-identical to a cold compile: `vl build` output `cmp`-equal, and
//      `VL_COMPILE_CACHE_VERIFY=1` re-compiling every hit cold and agreeing, for `vl build`
//      and for each pooled `vl test` file.
//   2. A MUTATION MATRIX: changing any one input class makes the next lookup MISS — the
//      entry, a dependency, a file at a recorded-absent path, a flag, a keyed variable, the
//      seed, the cwd, the entry's spelling, the colour.
//   3. Controls: an INERT variable must still HIT (a matrix that always missed would pass
//      without it), and a BYPASS variable neither hits nor stores.
//   4. A forged result that differs from a cold compile exits 71 under verify mode.
//   5. The guard against an unrecorded input: every guest export the host calls and every
//      `CMD_*` code is classified below, and an unclassified one fails this file.
//
// Evidence is `VL_COMPILE_CACHE_TRACE=1`'s stderr lines and the files on disk, never timing.
// Every case gets a private `VL_CACHE_DIR`. The population is one two-module program and two
// test files, named here; it is a check over those programs, not a claim about all of them.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-compile-cache] skipped — missing vl binary or seed wasm.");
}

type Ran = { code: number; out: string; err: string; trace: string[] };

const PREFIX = "vl: compile cache ";

const vl = async (
  args: string[],
  cwd: string,
  extra: Record<string, string> = {},
): Promise<Ran> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({
      VL_CACHE_DIR: `${cwd}/../cache`,
      VL_COMPILE_CACHE: "1",
      VL_COMPILE_CACHE_TRACE: "1",
      NO_COLOR: "1",
      ...extra,
    }),
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

const test = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name: `native compile cache: ${name}`, ignore: !ENABLED, fn });

const BUILD = ["build", "main.vl", "-o", "out.wasm"];

test("a hit is byte-identical to a cold build, and verify mode agrees", async () => {
  const { tmp, p } = await setup();
  try {
    const cold = await vl(BUILD, p);
    expect([cold.code, cold.trace], [0, ["miss", "stored"]], "cold build");
    const coldBytes = await Deno.readFile(`${p}/out.wasm`);
    const hit = await vl(BUILD, p);
    expect([hit.code, hit.trace], [0, ["hit"]], "second build");
    expect(await Deno.readFile(`${p}/out.wasm`), coldBytes, "hit bytes equal cold bytes");
    const ver = await vl(BUILD, p, { VL_COMPILE_CACHE_VERIFY: "1" });
    expect([ver.code, ver.trace], [0, ["hit", "verified"]], "verify mode");
    expect(await Deno.readFile(`${p}/out.wasm`), coldBytes, "verified bytes equal cold bytes");
    // `-O` re-runs the host's steps on the served bytes: the optimized module is identical too.
    const o1 = await vl([...BUILD.slice(0, 2), "-O", "-o", "o1.wasm"], p);
    const o2 = await vl([...BUILD.slice(0, 2), "-O", "-o", "o2.wasm"], p);
    expect([o1.trace, o2.trace], [["miss", "stored"], ["hit"]], "-O cold then hit");
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
    const ver = await vl(["test", "."], p, { VL_COMPILE_CACHE_VERIFY: "1" });
    expect(ver.trace.filter((t) => t === "verified").length, 2, "both files verified");
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
      ["the entry edited", async () => {
        await Deno.writeTextFile(`${p}/main.vl`, MAIN + "print(1)\n");
        return {};
      }],
      ["a dependency edited", async () => {
        await Deno.writeTextFile(`${p}/lib.vl`, LIB + "export function thrice(x: i32): i32 { return x * 3 }\n");
        return {};
      }],
      ["a flag added", () => Promise.resolve({ args: [...BUILD, "--names"] })],
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
  for (const flag of ["--names", "--initial-memory=2MiB"]) {
    const { tmp, p } = await setup();
    try {
      await vl(BUILD, p);
      const t = await vl(["build", "main.vl", "-o", flag], p, { VL_COMPILE_CACHE_VERIFY: "1" });
      expect([t.code, t.trace[0]], [0, "miss"], `-o ${flag}`);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
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
    expect(lines.slice(0, 2), ["VLCM1", "T 1"], "the manifest holds one one-read transcript");
    const transcript = `T 2\n${lines[2]}\n- ${hex(enc("ghost.vl"))}\n`;
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

// ── the guard: every host→guest channel is classified ──────────────────────
//
// `input` is a staging call or a command reply the cache keys (by the staged values or the
// transcript); `output` is read back and never keyed; `uncached` is used only on a path no
// cached action runs (the pump's own instance, diagnostics, test collect/run, the
// rep-shadow report, which is a bypass). A new export or command joins this table only by
// someone deciding which it is.
const EXPORTS: Record<string, "input" | "output" | "uncached"> = {
  checkEntryPathCommit: "input", checkEntryPathPush: "input", cliArgCommit: "input",
  cliArgPush: "input", cliArgReset: "input", cliCmdData: "output", cliCmdPath: "output",
  cliDirCommit: "input", cliDirEntryPush: "uncached", cliDirNamePush: "uncached",
  cliExitCode: "output", cliFileCommit: "input", cliNext: "output", cliResult: "input",
  cliTestCompiledCommit: "uncached", cliTestFileCommit: "uncached",
  cliTestJobsWanted: "uncached", cliTestNameCommit: "uncached", cliTestNamePush: "uncached",
  cliTestOutPush: "uncached", cliTestPlanCount: "uncached", cliTestPlanFile: "uncached",
  cliTestPlanTest: "uncached", cliTestPoolStage: "input", cliTestResultCommit: "uncached",
  cliValidateCommit: "uncached", cwdCommit: "input", cwdPush: "input", diagAt: "output",
  diagCol: "output", diagCount: "output", diagLen: "output", diagLine: "output",
  diagModule: "output", diagMsgAt: "output", diagMsgLen: "output", emitFnSpanAt: "output",
  emitFnSpanCol: "output", emitFnSpanKindOf: "output", emitFnSpanLine: "output",
  emitFnSpanModule: "output", emitFnSpanNameAt: "output", emitFnSpanNameLen: "output",
  heapWindowRead: "output", hostAbi: "output", modCommit: "input", modKey: "input",
  modKeyAtCharAt: "output", modKeyAtLen: "output", modKeyCount: "output",
  modPendingAt: "output", modPendingCount: "output", modPendingLen: "output",
  modReset: "input", modSrc: "input", rbyte: "output", repShadowCount: "uncached",
  repShadowMsgAt: "uncached", repShadowMsgLen: "uncached", repShadowReasonAt: "uncached",
  repShadowReasonCount: "uncached", repShadowReasonLen: "uncached",
  repShadowReasonN: "uncached", repShadowStat: "uncached", setEmitNames: "input",
  setEmitSrcMap: "input", setHeapWindow: "input", setImportMemory: "input",
  setLowMemoryUnused: "input", setMemoryPages: "input", setOneShot: "input",
  setRepShadow: "uncached", setSharedMemory: "input", src: "input", srcReset: "input",
  vlRootCommit: "input", vlRootPush: "input", vltCount: "uncached", vltFailAt: "uncached",
  vltFailLen: "uncached", vltNameAt: "uncached", vltNameLen: "uncached", vltRun: "uncached",
  vltSkipped: "uncached",
};

// A pooled worker answers DONE, LIST_DIR (a constant 0), READ_FILE (recorded), the two
// prints and STASH (outputs), and refuses every other code; `vl build` issues none.
const COMMANDS: Record<string, "input" | "output" | "uncached"> = {
  CMD_DONE: "output", CMD_LIST_DIR: "input", CMD_READ_FILE: "input",
  CMD_WRITE_FILE: "uncached", CMD_PRINT_OUT: "output", CMD_PRINT_ERR: "output",
  CMD_READ_STDIN: "uncached", CMD_TEST_STASH: "output", CMD_TEST_COLLECT: "uncached",
  CMD_TEST_RUN: "uncached", CMD_VALIDATE: "uncached", CMD_TEST_ENQUEUE: "uncached",
  CMD_TEST_COMPILE: "uncached",
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
