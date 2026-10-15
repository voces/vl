// NATIVE `vl build` — the OUTPUT CHANNEL. Which stream carries the module, which
// carries the chatter, and what a bare redirect gets.
//
// ROADMAP row 9: `vl build p.vl > out.bin` left `out.bin` holding the sentence
// `wrote p.wasm (150 bytes)` while the module sat in `p.wasm` beside the source. Two
// separate faults wearing one symptom, and only the first is about the default:
//
//   1. the STATUS LINE went to stdout, so a redirect captured chatter as though it
//      were data. `check --json` already states the rule the other way round — the
//      human summary is suppressed "so stdout stays pure" — and `build` had not
//      adopted it. Now stderr, on every path.
//   2. there was NO spelling that put the module on stdout at all, so a pipeline had
//      to go through a file. Now `-o -`, the POSIX one.
//
// The DEFAULT is unchanged and that is a ruling, not an omission: `vl build p.vl`
// writes `p.wasm` beside the source, the `cc` default. All 76 `vl build` call sites in
// this tree pass `-o` explicitly, so nothing needed the other default, and a compiler
// that writes a binary to stdout unasked ruins the terminal it was typed into.
// docs/internals/cli-design.md §"The output channel is RULED" carries the decision and
// the alternative it declined.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.
//
// @test-timing native

import { binaryen, COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-cli-build-stdout] skipped — missing vl binary or seed wasm.");
}

const SRC = `print(6 * 7)\n`;
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

type Res = { code: number; out: Uint8Array; err: string };

/** `vl` with stdout kept as BYTES — a text decode would corrupt the module. */
const vl = async (args: string[], cwd?: string): Promise<Res> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, out: stdout, err: new TextDecoder().decode(stderr) };
};

/** A temp dir with `probe.vl` in it, removed afterwards. */
const withDir = async (fn: (dir: string, src: string) => Promise<void>): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_cli_build_stdout_" });
  try {
    const src = `${dir}/probe.vl`;
    await Deno.writeTextFile(src, SRC);
    await fn(dir, src);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const isModule = (b: Uint8Array): boolean =>
  b.length > 8 && WASM_MAGIC.every((m, i) => b[i] === m);

Deno.test({
  name: "vl-cli-build: the row's witness — a bare redirect captures NOTHING, the status is stderr",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir, src) => {
      const r = await vl(["build", src], dir);
      if (r.code !== 0) throw new Error(`build failed (rc ${r.code}):\n${r.err}`);
      // The whole point: stdout is empty, so `> out.bin` gets an empty file rather
      // than a sentence pretending to be a module.
      if (r.out.length !== 0) {
        throw new Error(
          `want an EMPTY stdout from a plain build, got ${r.out.length} bytes: ` +
            JSON.stringify(new TextDecoder().decode(r.out).slice(0, 80)),
        );
      }
      if (!/^wrote .*probe\.wasm \(\d+ bytes\)$/m.test(r.err)) {
        throw new Error(`want the "wrote … (N bytes)" line on stderr, got: ${JSON.stringify(r.err)}`);
      }
      // ...and the default still puts the module beside the source.
      const beside = await Deno.readFile(`${dir}/probe.wasm`);
      if (!isModule(beside)) throw new Error("probe.wasm is not a wasm module");
    });
  },
});

Deno.test({
  name: "vl-cli-build: `-o -` streams the module to stdout and creates no file",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir, src) => {
      const r = await vl(["build", src, "-o", "-"], dir);
      if (r.code !== 0) throw new Error(`build -o - failed (rc ${r.code}):\n${r.err}`);
      if (!isModule(r.out)) {
        throw new Error(
          `want a wasm module on stdout, got ${r.out.length} bytes starting ` +
            JSON.stringify(Array.from(r.out.slice(0, 4))),
        );
      }
      if (exists(`${dir}/probe.wasm`)) {
        throw new Error("`-o -` wrote probe.wasm to disk; it must write no file at all");
      }
      if (!/^wrote <stdout> \(\d+ bytes\)$/m.test(r.err)) {
        throw new Error(`want "wrote <stdout> (N bytes)" on stderr, got: ${JSON.stringify(r.err)}`);
      }
    });
  },
});

Deno.test({
  name: "vl-cli-build: the streamed module is byte-identical to the file spelling, and RUNS",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir, src) => {
      const streamed = await vl(["build", src, "-o", "-"], dir);
      const filed = await vl(["build", src, "-o", `${dir}/f.wasm`], dir);
      if (filed.code !== 0) throw new Error(`control build failed:\n${filed.err}`);
      const onDisk = await Deno.readFile(`${dir}/f.wasm`);
      if (streamed.out.length !== onDisk.length) {
        throw new Error(
          `stream and file disagree in length: ${streamed.out.length} vs ${onDisk.length}`,
        );
      }
      for (let i = 0; i < onDisk.length; i++) {
        if (streamed.out[i] !== onDisk[i]) {
          throw new Error(`stream and file differ at byte ${i}: ${streamed.out[i]} vs ${onDisk[i]}`);
        }
      }
      // A stream nothing can run is not a pipeline. `vl run <file.wasm>` is the
      // passthrough that consumes it.
      await Deno.writeFile(`${dir}/piped.wasm`, streamed.out);
      const ran = await vl(["run", `${dir}/piped.wasm`], dir);
      const out = new TextDecoder().decode(ran.out).trim();
      if (ran.code !== 0 || out !== "42") {
        throw new Error(`the streamed module did not run: rc ${ran.code}, out ${JSON.stringify(out)}`);
      }
    });
  },
});

Deno.test({
  name: "vl-cli-build: `-O3 -o -` streams the OPTIMIZED bytes, not the pre-optimize ones",
  ignore: !ENABLED,
  fn: async () => {
    const wasmOpt = Deno.env.get("VL_WASM_OPT") ??
      binaryen("wasm-opt");
    if (!exists(wasmOpt)) return; // binaryen absent — the opt rungs have their own gate
    await withDir(async (dir, src) => {
      const env = { VL_WASM_OPT: wasmOpt };
      const run = async (args: string[]) => {
        const { code, stdout, stderr } = await new Deno.Command(VL, {
          args: [...args, "--compiler", COMPILER],
          cwd: dir,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1", ...env }),
        }).output();
        return { code, out: stdout, err: new TextDecoder().decode(stderr) };
      };
      const streamed = await run(["build", src, "-O3", "-o", "-"]);
      if (streamed.code !== 0) throw new Error(`-O3 -o - failed (rc ${streamed.code}):\n${streamed.err}`);
      const filed = await run(["build", src, "-O3", "-o", `${dir}/o3.wasm`]);
      if (filed.code !== 0) throw new Error(`-O3 -o file failed:\n${filed.err}`);
      const onDisk = await Deno.readFile(`${dir}/o3.wasm`);
      if (streamed.out.length !== onDisk.length) {
        throw new Error(
          `-O3 stream and -O3 file disagree: ${streamed.out.length} vs ${onDisk.length} bytes`,
        );
      }
      // The tell that the stream is POST-optimize: the unoptimized module is bigger.
      const plain = await run(["build", src, "-o", `${dir}/plain.wasm`]);
      if (plain.code !== 0) throw new Error(`plain build failed:\n${plain.err}`);
      const plainBytes = await Deno.readFile(`${dir}/plain.wasm`);
      if (!(streamed.out.length < plainBytes.length)) {
        throw new Error(
          `-O3 stream (${streamed.out.length}) is not smaller than the plain build ` +
            `(${plainBytes.length}) — the optimizer did not reach the stream`,
        );
      }
      // ...and it still runs.
      await Deno.writeFile(`${dir}/o3piped.wasm`, streamed.out);
      const ran = await run(["run", `${dir}/o3piped.wasm`]);
      const out = new TextDecoder().decode(ran.out).trim();
      if (ran.code !== 0 || out !== "42") {
        throw new Error(`the -O3 stream did not run: rc ${ran.code}, out ${JSON.stringify(out)}`);
      }
    });
  },
});

Deno.test({
  name: "vl-cli-build: `--wat` with `-o -` is refused loudly, not silently skipped",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir, src) => {
      const r = await vl(["build", src, "-o", "-", "--wat"], dir);
      if (r.code !== 2) throw new Error(`want rc 2 for --wat with -o -, got ${r.code}\n${r.err}`);
      if (!/--wat/.test(r.err) || !/-o -/.test(r.err)) {
        throw new Error(`the refusal must name both flags, got: ${JSON.stringify(r.err)}`);
      }
      if (r.out.length !== 0) {
        throw new Error(`a refused build must write nothing to stdout, got ${r.out.length} bytes`);
      }
    });
  },
});

// A REAL pty, because the guard reads `is_terminal()` and a pipe cannot exercise it.
// Deno has no pty API, so `script` drives one: it runs the command with stdout on a pty
// slave, exits with the command's code and prints what the terminal got. util-linux needs
// `-e` for that code and takes the command as one string; BSD `script` takes argv as given.
const shQuote = (s: string): string => `'${s.replaceAll("'", `'\\''`)}'`;

Deno.test({
  name: "vl-cli-build: `-o -` onto a TERMINAL is refused rather than spewed",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir, src) => {
      const argv = [VL, "build", src, "-o", "-", "--compiler", COMPILER];
      let run: Deno.CommandOutput;
      try {
        run = await new Deno.Command("script", {
          args: Deno.build.os === "linux"
          ? ["-qefc", argv.map(shQuote).join(" "), "/dev/null"]
          : ["-q", "/dev/null", ...argv],
          cwd: dir,
          env: nativeEnv({ NO_COLOR: "1" }),
          stdin: "null",
          stdout: "piped",
          stderr: "piped",
        }).output();
      } catch {
        return; // no `script` on this box — the pipe arms above still gate the feature
      }
      const r = { code: run.code, text: new TextDecoder().decode(run.stdout) };
      if (r.code !== 2) {
        throw new Error(`want rc 2 for \`-o -\` onto a tty, got ${r.code}: ${JSON.stringify(r.text)}`);
      }
      if (!/stdout is a terminal/.test(r.text)) {
        throw new Error(`the refusal must say why, got: ${JSON.stringify(r.text)}`);
      }
      // A refusal that still wrote the module would be the bug wearing a message.
      if (r.text.includes(" asm")) {
        throw new Error("the module reached the terminal despite the refusal");
      }
      // The guard must be about the TTY and nothing else: the same command down a pipe
      // still delivers. Without this a guard that always fired would pass the check above.
      const piped = await vl(["build", src, "-o", "-"], dir);
      if (piped.code !== 0 || !isModule(piped.out)) {
        throw new Error(
          `the terminal guard also fired on a PIPE (rc ${piped.code}) — it must only refuse a tty`,
        );
      }
    });
  },
});
