// The VL command-line tool. Dispatches on a leading subcommand:
//
//   deno task run <file.vl>            # compile + run a file
//   deno task run -e "let x = 1 ..."   # compile + run an inline snippet
//   echo "..." | deno task run         # compile + run stdin
//   deno task build <file.vl> [-o out.wasm] [--wat]   # emit a .wasm (+ .wat)
//   deno task check <file.vl>          # diagnostics only; CI exit code
//
// A missing or unknown leading word falls back to `run`, so the historical
// bare `deno task run <file>` (and the VS Code "Run Current File" command that
// shells out to it) keeps working unchanged.
//
// Diagnostics print to stderr; `run` prints program `print`/`log` output to
// stdout. `Deno`/`process` usage is confined to this CLI entry point — the
// shared compiler core (compile.ts) stays side-effect-free and runtime-agnostic.

import { compile, runWasm, type VLDiagnostic, wasmToWat } from "./compile.ts";

const SUBCOMMANDS = new Set(["run", "build", "check"]);

const formatDiagnostic = (d: VLDiagnostic): string => {
  const { line, character } = d.range.start;
  return `${d.severity} [${line + 1}:${character + 1}] ${d.message}`;
};

// --- run ------------------------------------------------------------------

const readSource = async (args: string[]): Promise<string> => {
  const flagIndex = args.indexOf("-e");
  if (flagIndex !== -1) return args[flagIndex + 1] ?? "";

  const file = args.find((a) => !a.startsWith("-"));
  if (file) return await Deno.readTextFile(file);

  // No file/flag: read from stdin.
  return await new Response(Deno.stdin.readable).text();
};

const run = async (args: string[]): Promise<void> => {
  const source = await readSource(args);
  if (source.trim() === "") {
    console.error("usage: deno task run <file.vl> | -e <source> | < stdin");
    Deno.exit(2);
  }

  const { diagnostics, wasm } = await compile(source);
  for (const d of diagnostics) console.error(formatDiagnostic(d));

  if (!wasm) Deno.exit(1);

  const { logs } = await runWasm(wasm);
  for (const log of logs) console.log(log);
};

// --- build ----------------------------------------------------------------

type BuildArgs = { file?: string; out?: string; wat: boolean };

const parseBuildArgs = (args: string[]): BuildArgs => {
  const parsed: BuildArgs = { wat: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-o" || a === "--out") parsed.out = args[++i];
    else if (a === "--wat") parsed.wat = true;
    else if (!a.startsWith("-") && parsed.file === undefined) parsed.file = a;
  }
  return parsed;
};

const build = async (args: string[]): Promise<void> => {
  const { file, out, wat } = parseBuildArgs(args);
  if (!file) {
    console.error("usage: deno task build <file.vl> [-o <out.wasm>] [--wat]");
    Deno.exit(2);
  }

  const source = await Deno.readTextFile(file);
  const { diagnostics, wasm } = await compile(source);
  for (const d of diagnostics) console.error(formatDiagnostic(d));

  if (!wasm) {
    console.error("build failed: compilation produced errors");
    Deno.exit(1);
  }

  // Default output drops the `.vl` extension for `.wasm` (`foo.vl` -> `foo.wasm`).
  const wasmPath = out ?? `${file.replace(/\.vl$/, "")}.wasm`;
  await Deno.writeFile(wasmPath, wasm);
  console.error(`wrote ${wasmPath} (${wasm.length} bytes)`);

  if (wat) {
    const watPath = `${wasmPath.replace(/\.wasm$/, "")}.wat`;
    await Deno.writeTextFile(watPath, await wasmToWat(wasm));
    console.error(`wrote ${watPath}`);
  }
};

// --- check ----------------------------------------------------------------

const check = async (args: string[]): Promise<void> => {
  const file = args.find((a) => !a.startsWith("-"));
  if (!file) {
    console.error("usage: deno task check <file.vl>");
    Deno.exit(2);
  }

  const source = await Deno.readTextFile(file);
  const { diagnostics } = await compile(source);
  for (const d of diagnostics) console.error(formatDiagnostic(d));

  // CI gate: never run the program; fail only on ERROR-severity diagnostics.
  const hasError = diagnostics.some((d) => d.severity === "error");
  Deno.exit(hasError ? 1 : 0);
};

// --- dispatch -------------------------------------------------------------

const main = async (): Promise<void> => {
  const [maybeCmd, ...rest] = Deno.args;
  // An unknown/absent leading word is treated as `run` (back-compat), with all
  // args forwarded; a real subcommand consumes the leading word.
  const cmd = maybeCmd !== undefined && SUBCOMMANDS.has(maybeCmd)
    ? maybeCmd
    : "run";
  const args = cmd === "run" && maybeCmd !== "run" ? Deno.args : rest;

  if (cmd === "build") return await build(args);
  if (cmd === "check") return await check(args);
  return await run(args);
};

await main();
