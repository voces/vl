// The VL command-line tool. Dispatches on a leading subcommand:
//
//   deno task run <file.vl>            # compile + run a file
//   deno task run -e "let x = 1 ..."   # compile + run an inline snippet
//   echo "..." | deno task run         # compile + run stdin
//   deno task build <file.vl> [-o out.wasm] [--wat]   # emit a .wasm (+ .wat)
//   deno task check <file.vl>          # diagnostics only; CI exit code
//   deno task check <dir>              # recursively check every *.vl under dir
//   deno task check                    # no path → check the cwd (like `check .`)
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

// Directories skipped when walking broadly, so `vl check .` doesn't descend
// into build output, deps, vendored copies, or the retired ts-interpreter.
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "reference",
]);

// Recursively collect every `*.vl` file under `dir` (sorted for stable output).
// Symlinks are not followed (Deno.readDir reports them as neither file nor dir
// unless resolved) — a sensible default that avoids cycles.
const collectVlFiles = async (dir: string): Promise<string[]> => {
  const found: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for await (const entry of Deno.readDir(current)) {
      const path = `${current}/${entry.name}`;
      if (entry.isDirectory) {
        if (!SKIP_DIRS.has(entry.name)) await walk(path);
      } else if (entry.isFile && entry.name.endsWith(".vl")) {
        found.push(path);
      }
    }
  };
  await walk(dir);
  found.sort();
  return found;
};

// Check one file: compile, print its diagnostics, report whether it errored.
const checkFile = async (file: string): Promise<boolean> => {
  const source = await Deno.readTextFile(file);
  const { diagnostics } = await compile(source);
  for (const d of diagnostics) console.error(`${file}: ${formatDiagnostic(d)}`);
  return diagnostics.some((d) => d.severity === "error");
};

const check = async (args: string[]): Promise<void> => {
  // No path argument → default to the current working directory (`vl check .`).
  const target = args.find((a) => !a.startsWith("-")) ?? ".";

  let info: Deno.FileInfo;
  try {
    info = await Deno.stat(target);
  } catch {
    console.error(`check: no such file or directory: ${target}`);
    Deno.exit(2);
  }

  // Build the list of files to check: a single file, or every `*.vl` under a dir.
  let files: string[];
  if (info.isDirectory) {
    files = await collectVlFiles(target);
    if (files.length === 0) {
      console.error(`check: no .vl files found under ${target}`);
      Deno.exit(0);
    }
  } else {
    files = [target];
  }

  // CI gate: never run the program; fail only on ERROR-severity diagnostics,
  // aggregated across every file checked.
  let hasError = false;
  for (const file of files) {
    if (await checkFile(file)) hasError = true;
  }
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
