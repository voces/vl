// The VL command-line tool. Dispatches on a leading subcommand:
//
//   deno task run <file.vl>            # compile + run a file
//   deno task run -e "let x = 1 ..."   # compile + run an inline snippet
//   echo "..." | deno task run         # compile + run stdin
//   deno task build <file.vl> [-o out.wasm] [--wat]   # emit a .wasm (+ .wat)
//   deno task check <file.vl>          # diagnostics only; CI exit code
//   deno task check <dir>              # recursively check every *.vl under dir
//   deno task check                    # no path → check the cwd (like `check .`)
//   deno task check --concise <path>   # one terse line per diagnostic (grep-safe)
//   deno task run fmt <file.vl>        # print canonically-formatted source
//   deno task run fmt -w <file.vl>     # rewrite the file(s) in place
//   deno task run fmt --check <path>   # CI gate: nonzero exit if not formatted
//
// `check` prints rich, rustc/Deno-style diagnostics by default (header line,
// the offending source line, a caret/tilde underline, and an `at file:L:C`
// locator), ending with a `Found N errors.` summary. Pass `--concise` for the
// legacy one-line-per-diagnostic format. Colors are emitted only when stdout is
// a TTY and NO_COLOR is unset, and never in concise mode.
//
// A missing or unknown leading word falls back to `run`, so the historical
// bare `deno task run <file>` (and the VS Code "Run Current File" command that
// shells out to it) keeps working unchanged.
//
// Diagnostics print to stderr; `run` prints program `print`/`log` output to
// stdout. `Deno`/`process` usage is confined to this CLI entry point — the
// shared compiler core (compile.ts) stays side-effect-free and runtime-agnostic.

import {
  checkOnly,
  compile,
  runWasm,
  type VLDiagnostic,
  wasmToWat,
} from "./compile.ts";
import { format } from "./format.ts";

const SUBCOMMANDS = new Set(["run", "build", "check", "fmt"]);

// --- diagnostic rendering -------------------------------------------------

// Concise, one-line-per-diagnostic format — the historical output. Scripts and
// grep depend on its exact shape, so it stays byte-for-byte stable and never
// gets colorized. `range.start` is 0-based line/character (see compile.ts);
// printed as 1-based `L:C` to agree with editors.
const formatDiagnostic = (d: VLDiagnostic): string => {
  const { line, character } = d.range.start;
  return `${d.severity} [${line + 1}:${character + 1}] ${d.message}`;
};

// ANSI styling, gated on a single decision made once at startup: only when
// stdout is a TTY and NO_COLOR is unset (https://no-color.org). When disabled
// every helper is the identity function, so call sites stay branch-free.
type Style = (s: string) => string;
const wrap = (code: string): Style => (s) => `\x1b[${code}m${s}\x1b[0m`;
const shouldColor = (): boolean => {
  if (Deno.env.get("NO_COLOR")) return false;
  try {
    return Deno.stdout.isTerminal();
  } catch {
    return false;
  }
};
const makeColors = (on: boolean) => {
  const id: Style = (s) => s;
  if (!on) return { red: id, yellow: id, blue: id, dim: id, bold: id };
  return {
    red: wrap("31"),
    yellow: wrap("33"),
    blue: wrap("34"),
    dim: wrap("2"),
    bold: wrap("1"),
  };
};
type Colors = ReturnType<typeof makeColors>;

const severityColor = (sev: VLDiagnostic["severity"], c: Colors): Style =>
  sev === "error" ? c.red : sev === "warning" ? c.yellow : c.blue;

// Tabs are expanded to this many columns so carets line up under source that
// indents with tabs (the source line is detabbed to match).
const TAB_WIDTH = 4;
const detab = (s: string): string => {
  let out = "";
  for (const ch of s) {
    if (ch === "\t") out += " ".repeat(TAB_WIDTH - (out.length % TAB_WIDTH));
    else out += ch;
  }
  return out;
};
// Width a prefix [0, n) of `raw` occupies once tabs are expanded — used to
// place the caret/underline under the correct visual column.
const visualWidth = (raw: string, n: number): number =>
  detab(raw.slice(0, Math.min(n, raw.length))).length;

// A location-less diagnostic carries the exact sentinel span 0:0–0:0 (start ==
// end == 0:0) — used by codegen errors, which have no real source span (see
// compile.ts). The match is on the EXACT sentinel: a genuine diagnostic at the
// very start of a file still has `end` past the start, so it won't be confused
// for one of these.
const isLocationless = (d: VLDiagnostic): boolean => {
  const { start, end } = d.range;
  return start.line === 0 && start.character === 0 &&
    end.line === 0 && end.character === 0;
};

// Pretty, rustc/Deno-style multi-line rendering for one diagnostic:
//
//   [ERROR]: <message>
//     <offending source line>
//     ^~~~
//     at <file>:<line>:<col>
//
// `sourceLines` is the file split on newlines; `range.start.line` indexes it
// (0-based). Guards against an out-of-range line (empty file / synthetic span)
// by skipping the source/caret block and still emitting header + locator.
//
// A location-less diagnostic (the codegen sentinel) is rendered as just the
// header plus an `at <file>` locator — no source line, no caret, and no
// misleading `:1:1`, which would otherwise point at the file's first line.
const formatPretty = (
  d: VLDiagnostic,
  file: string,
  sourceLines: string[],
  c: Colors,
): string => {
  const sevStyle = severityColor(d.severity, c);

  if (isLocationless(d)) {
    return [
      `${sevStyle(c.bold(`[${d.severity.toUpperCase()}]`))}: ${d.message}`,
      c.dim(`  at ${file}`),
    ].join("\n");
  }

  const { line, character } = d.range.start;
  const out: string[] = [];
  out.push(`${sevStyle(c.bold(`[${d.severity.toUpperCase()}]`))}: ${d.message}`);

  const raw = sourceLines[line];
  if (raw !== undefined) {
    const shown = detab(raw);
    out.push(`  ${shown}`);

    // Caret offset: visual width of the text before the start column. Span: the
    // visual width covered by [start, end) on this line, clamped to >= 1 and to
    // what remains of the line.
    const startCol = visualWidth(raw, character);
    const sameLine = d.range.end.line === line;
    const endChar = sameLine ? d.range.end.character : raw.length;
    const endCol = visualWidth(raw, Math.max(endChar, character + 1));
    const remaining = Math.max(1, shown.length - startCol);
    const span = Math.max(1, Math.min(endCol - startCol, remaining));
    const underline = "^" + "~".repeat(Math.max(0, span - 1));
    out.push(`  ${" ".repeat(startCol)}${sevStyle(underline)}`);
  }

  out.push(c.dim(`  at ${file}:${line + 1}:${character + 1}`));
  return out.join("\n");
};

// One-line summary for a pretty `check` run, mirroring Deno's `Found N errors.`
// Counts errors (always) and warnings (when present); a clean run reports the
// number of files checked.
const summarize = (
  errors: number,
  warnings: number,
  filesChecked: number,
  c: Colors,
): string => {
  if (errors === 0 && warnings === 0) {
    const noun = filesChecked === 1 ? "file" : "files";
    return c.dim(`Checked ${filesChecked} ${noun}, no errors.`);
  }
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const parts = [plural(errors, "error")];
  if (warnings > 0) parts.push(plural(warnings, "warning"));
  const text = `Found ${parts.join(", ")}.`;
  return errors > 0 ? c.red(text) : c.yellow(text);
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

type CheckTally = { errors: number; warnings: number };

// Check one file: compile, print its diagnostics in the requested style, and
// accumulate error/warning counts into `tally`. Concise mode reproduces the
// historical `<file>: <severity> [L:C] <message>` line exactly (grep-safe,
// uncolored); pretty mode renders the rustc/Deno-style block per diagnostic.
const checkFile = async (
  file: string,
  concise: boolean,
  c: Colors,
  tally: CheckTally,
): Promise<void> => {
  const source = await Deno.readTextFile(file);
  // `check` only needs diagnostics, so use the codegen-free front end: it skips
  // binaryen codegen entirely (faster, and never even loads the binaryen
  // toolchain). Trade-off: codegen-only diagnostics — the `Codegen error:` line,
  // e.g. the array-element-recursion stack overflow — are not produced by
  // `check`. That is acceptable here: `check` is a parse/type gate, and
  // `build`/`run` (which do run codegen) still surface those errors.
  const { diagnostics } = checkOnly(source);
  if (diagnostics.length === 0) return;

  if (concise) {
    for (const d of diagnostics) {
      console.error(`${file}: ${formatDiagnostic(d)}`);
    }
  } else {
    const sourceLines = source.split("\n");
    for (const d of diagnostics) {
      console.error(formatPretty(d, file, sourceLines, c));
      console.error("");
    }
  }

  for (const d of diagnostics) {
    if (d.severity === "error") tally.errors++;
    else if (d.severity === "warning") tally.warnings++;
  }
};

const check = async (args: string[]): Promise<void> => {
  const concise = args.includes("--concise");
  // No color when piped, when NO_COLOR is set, or in concise mode (kept plain
  // so scripts/grep see stable bytes).
  const c = makeColors(!concise && shouldColor());

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
  const tally: CheckTally = { errors: 0, warnings: 0 };
  for (const file of files) {
    await checkFile(file, concise, c, tally);
  }

  // Pretty mode ends with a Deno-style summary; concise stays output-stable.
  if (!concise) {
    console.error(summarize(tally.errors, tally.warnings, files.length, c));
  }

  Deno.exit(tally.errors > 0 ? 1 : 0);
};

// --- fmt ------------------------------------------------------------------

// `fmt` has three modes, mirroring `gofmt`/`deno fmt`:
//   default        print the formatted source of a single file to stdout
//   -w / --write   rewrite each target file in place (no stdout)
//   --check        write nothing; exit nonzero if any target is unformatted
//                  (a CI gate), listing the files that would change
//
// A target may be a file or a directory; a directory is walked for `*.vl`
// (reusing `collectVlFiles`, same SKIP_DIRS). With no target, stdin is read and
// the formatted result printed (so `cat f.vl | vl fmt` works); stdin is
// incompatible with -w (nothing to write back to) and is reported as such.
type FmtArgs = { paths: string[]; write: boolean; check: boolean };

const parseFmtArgs = (args: string[]): FmtArgs => {
  const parsed: FmtArgs = { paths: [], write: false, check: false };
  for (const a of args) {
    if (a === "-w" || a === "--write") parsed.write = true;
    else if (a === "--check") parsed.check = true;
    else if (!a.startsWith("-")) parsed.paths.push(a);
  }
  return parsed;
};

const fmt = async (args: string[]): Promise<void> => {
  const { paths, write, check } = parseFmtArgs(args);

  if (write && check) {
    console.error("fmt: --write and --check are mutually exclusive");
    Deno.exit(2);
  }

  // No path: format stdin → stdout. Only valid for the default (print) mode.
  if (paths.length === 0) {
    if (write) {
      console.error("fmt: -w needs a file argument (cannot rewrite stdin)");
      Deno.exit(2);
    }
    const source = await new Response(Deno.stdin.readable).text();
    const out = format(source);
    if (check) {
      if (out !== source) {
        console.error("<stdin>");
        Deno.exit(1);
      }
      Deno.exit(0);
    }
    await Deno.stdout.write(new TextEncoder().encode(out));
    return;
  }

  // Expand each path to a concrete file list (a dir → every `*.vl` under it).
  const files: string[] = [];
  for (const target of paths) {
    let info: Deno.FileInfo;
    try {
      info = await Deno.stat(target);
    } catch {
      console.error(`fmt: no such file or directory: ${target}`);
      Deno.exit(2);
    }
    if (info.isDirectory) files.push(...await collectVlFiles(target));
    else files.push(target);
  }

  if (files.length === 0) {
    console.error("fmt: no .vl files found");
    Deno.exit(0);
  }

  // Default (print) mode formats exactly one file to stdout; refusing multiple
  // avoids silently concatenating unrelated files. Use -w or --check for many.
  if (!write && !check && files.length > 1) {
    console.error(
      "fmt: refusing to print multiple files to stdout; use -w or --check",
    );
    Deno.exit(2);
  }

  let unformatted = 0;
  for (const file of files) {
    const source = await Deno.readTextFile(file);
    const out = format(source);

    if (check) {
      if (out !== source) {
        console.error(file);
        unformatted++;
      }
    } else if (write) {
      // Only touch the file when the bytes actually change.
      if (out !== source) {
        await Deno.writeTextFile(file, out);
        console.error(`formatted ${file}`);
      }
    } else {
      await Deno.stdout.write(new TextEncoder().encode(out));
    }
  }

  if (check) Deno.exit(unformatted > 0 ? 1 : 0);
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
  if (cmd === "fmt") return await fmt(args);
  return await run(args);
};

await main();
