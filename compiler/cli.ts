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
//   deno task check . --severity warning  # also fail the exit code on warnings
//   deno task run help / --help / -h    # list commands (also shown when the
//                                       # binary is run with no args in a TTY)
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
  type VLSeverity,
  wasmToWat,
} from "./compile.ts";

const SUBCOMMANDS = new Set(["run", "build", "check"]);

// --- severity ranking -----------------------------------------------------

// Total order on severities, high → low: error > warning > info > hint. Used by
// `check`'s `--severity` threshold: a diagnostic gates the exit code when its
// rank is at or above the chosen level's rank. Listed low → high so the array
// index IS the rank (hint = 0 … error = 3). The default threshold is `error`,
// so warnings/info/hints never fail unless a lower level is requested; `hint`
// sits below `warning`, so hints only gate under an explicit `--severity hint`.
const SEVERITY_ORDER: readonly VLSeverity[] = [
  "hint",
  "info",
  "warning",
  "error",
];

export const severityRank = (sev: VLSeverity): number =>
  SEVERITY_ORDER.indexOf(sev);

// True when `sev` is at or above `threshold` in the severity order, i.e. when a
// diagnostic of that severity should count toward `check`'s non-zero exit.
export const meetsThreshold = (
  sev: VLSeverity,
  threshold: VLSeverity,
): boolean => severityRank(sev) >= severityRank(threshold);

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
// number of files checked. When a non-default `--severity` threshold makes the
// run fail (`tally.gating > 0`), the line notes the threshold so the reader
// understands why warnings/info/hints gated the exit code. Colour follows
// whether the run is failing (red when gating, else yellow for stray warnings).
const summarize = (
  tally: CheckTally,
  filesChecked: number,
  threshold: VLSeverity,
  c: Colors,
): string => {
  const { errors, warnings, gating } = tally;
  if (errors === 0 && warnings === 0) {
    const noun = filesChecked === 1 ? "file" : "files";
    return c.dim(`Checked ${filesChecked} ${noun}, no errors.`);
  }
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const parts = [plural(errors, "error")];
  if (warnings > 0) parts.push(plural(warnings, "warning"));
  // Only mention the threshold when it is the reason a non-error run fails — at
  // the default `error` threshold the line stays byte-for-byte as before.
  const note = gating > 0 && threshold !== "error"
    ? ` (failing at severity ${threshold})`
    : "";
  const text = `Found ${parts.join(", ")}.${note}`;
  return gating > 0 ? c.red(text) : c.yellow(text);
};

// --- run ------------------------------------------------------------------

// True only when stdin is an interactive terminal (not piped/redirected). Used
// to avoid blocking forever on `Deno.stdin` when there is nothing to read.
const stdinIsTerminal = (): boolean => {
  try {
    return Deno.stdin.isTerminal();
  } catch {
    return false;
  }
};

const readSource = async (args: string[]): Promise<string> => {
  const flagIndex = args.indexOf("-e");
  if (flagIndex !== -1) return args[flagIndex + 1] ?? "";

  const file = args.find((a) => !a.startsWith("-"));
  if (file) return await Deno.readTextFile(file);

  // No file/flag: read from stdin.
  return await new Response(Deno.stdin.readable).text();
};

const RUN_USAGE =
  "usage: vl <file.vl> | -e <source> | < stdin   (vl help for more)";

const run = async (args: string[]): Promise<void> => {
  // Only fall through to stdin when it is actually piped/redirected. With no
  // file and no `-e`, an interactive terminal has nothing to read, so blocking
  // on `Deno.stdin` would hang forever — show usage instead. This also catches a
  // mistyped subcommand like `vl --check` (the `--` makes it an unknown option
  // rather than the `check` command, so it lands here) and suggests the fix.
  const hasInline = args.includes("-e");
  const positional = args.find((a) => !a.startsWith("-"));
  if (!hasInline && !positional && stdinIsTerminal()) {
    const mistyped = args.find((a) =>
      a.startsWith("-") && SUBCOMMANDS.has(a.replace(/^-+/, ""))
    );
    console.error(
      mistyped
        ? `vl: unknown option \`${mistyped}\` — did you mean \`vl ${
          mistyped.replace(/^-+/, "")
        }\`?`
        : RUN_USAGE,
    );
    Deno.exit(2);
  }

  const source = await readSource(args);
  if (source.trim() === "") {
    console.error(RUN_USAGE);
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

// Compile one `--exclude`/`--ignore` pattern into a matcher. A tiny glob→RegExp
// translation (no dependency): `*` matches anything but a path separator, `**`
// crosses separators, and every other character is matched literally (regex
// metacharacters are escaped). A pattern with no glob char is treated as a plain
// substring/prefix and matches via the same anchored-or-prefix rule below.
const globToRegExp = (pattern: string): RegExp => {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*"; // `**` crosses path separators
        i++;
      } else {
        out += "[^/]*"; // `*` stops at a separator
      }
    } else if ("\\^$.|?+()[]{}".includes(ch)) {
      out += "\\" + ch; // escape regex metacharacters
    } else {
      out += ch;
    }
  }
  // Anchor at start; allow a trailing path segment so a directory pattern like
  // `tests` matches `tests` and everything beneath it (`tests/...`).
  return new RegExp(`^${out}(/.*)?$`);
};

// An exclude matcher tests a candidate path two ways and skips on either:
//   1. the path RELATIVE TO THE CHECK ROOT (so `--exclude tests` gates the whole
//      `tests/` subtree, and `--exclude a/b` matches a nested directory), and
//   2. the BASENAME (so `--exclude '*.gen.vl'` matches generated files anywhere).
// This is the least-surprising blend of Deno's `--ignore=<paths>` (path-based)
// and ESLint's `--ignore-pattern` (often basename/glob-based).
type ExcludeMatcher = (relPath: string, basename: string) => boolean;

export const makeExcludeMatcher = (patterns: string[]): ExcludeMatcher => {
  if (patterns.length === 0) return () => false;
  // Normalize: strip leading `./` and trailing `/` so `./tests/` == `tests`.
  const regexes = patterns.map((p) =>
    globToRegExp(p.replace(/^\.\//, "").replace(/\/+$/, ""))
  );
  return (relPath, basename) =>
    regexes.some((re) => re.test(relPath) || re.test(basename));
};

// Recursively collect every `*.vl` file under `dir` (sorted for stable output).
// Symlinks are not followed (Deno.readDir reports them as neither file nor dir
// unless resolved) — a sensible default that avoids cycles. `excludes` are
// applied on top of the hardcoded `SKIP_DIRS`: a directory or file is skipped
// when it matches any exclude (see `makeExcludeMatcher` for the semantics).
export const collectVlFiles = async (
  dir: string,
  excludes: string[] = [],
): Promise<string[]> => {
  const matchesExclude = makeExcludeMatcher(excludes);
  const found: string[] = [];
  const walk = async (current: string, rel: string): Promise<void> => {
    for await (const entry of Deno.readDir(current)) {
      const path = `${current}/${entry.name}`;
      const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (matchesExclude(relPath, entry.name)) continue;
        await walk(path, relPath);
      } else if (entry.isFile && entry.name.endsWith(".vl")) {
        if (matchesExclude(relPath, entry.name)) continue;
        found.push(path);
      }
    }
  };
  await walk(dir, "");
  found.sort();
  return found;
};

// Running counts across a `check` run. `errors`/`warnings` drive the summary
// line; `gating` counts diagnostics at or above the chosen `--severity`
// threshold and is what decides the exit code (so `--severity warning` makes
// warnings — and errors — gate, while a hint never gates unless `--severity
// hint` is chosen). At the default `error` threshold `gating === errors`.
type CheckTally = { errors: number; warnings: number; gating: number };

// Check one file: compile, print its diagnostics in the requested style, and
// accumulate error/warning counts into `tally`. Concise mode reproduces the
// historical `<file>: <severity> [L:C] <message>` line exactly (grep-safe,
// uncolored); pretty mode renders the rustc/Deno-style block per diagnostic.
// `threshold` decides which diagnostics count toward `tally.gating` (the exit
// gate); display is unaffected — every diagnostic still prints.
const checkFile = async (
  file: string,
  concise: boolean,
  c: Colors,
  tally: CheckTally,
  threshold: VLSeverity,
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
    if (meetsThreshold(d.severity, threshold)) tally.gating++;
  }
};

type CheckArgs = {
  target: string;
  concise: boolean;
  excludes: string[];
  severity: VLSeverity;
};

// Validate a `--severity` value against the known levels, exiting with a clean
// error on anything else (so `--severity warn` doesn't silently behave like the
// default). Returns the value narrowed to `VLSeverity`.
const parseSeverity = (value: string | undefined): VLSeverity => {
  if (value !== undefined && (SEVERITY_ORDER as readonly string[]).includes(value)) {
    return value as VLSeverity;
  }
  const levels = SEVERITY_ORDER.slice().reverse().join(", ");
  console.error(
    `check: invalid --severity \`${value ?? ""}\` (expected one of: ${levels})`,
  );
  Deno.exit(2);
};

// Parse `check`'s args into a path target, the `--concise` flag, the list of
// `--exclude`/`--ignore` patterns, and the `--severity` exit-code threshold.
// Both value forms are accepted for `--exclude`/`--ignore` and `--severity`: a
// separate value (`--severity warning`) and an inline `=` form
// (`--severity=warning`). The consumed VALUE is never mistaken for the path
// target. `--severity` defaults to `error` (today's behaviour: only errors
// fail).
const parseCheckArgs = (args: string[]): CheckArgs => {
  let target: string | undefined;
  let concise = false;
  let severity: VLSeverity = "error";
  const excludes: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--concise") {
      concise = true;
    } else if (a === "--exclude" || a === "--ignore") {
      const value = args[++i];
      if (value !== undefined) excludes.push(...value.split(","));
    } else if (a.startsWith("--exclude=") || a.startsWith("--ignore=")) {
      excludes.push(...a.slice(a.indexOf("=") + 1).split(","));
    } else if (a === "--severity") {
      severity = parseSeverity(args[++i]);
    } else if (a.startsWith("--severity=")) {
      severity = parseSeverity(a.slice(a.indexOf("=") + 1));
    } else if (!a.startsWith("-") && target === undefined) {
      target = a;
    }
  }
  // Drop empty patterns (e.g. a stray comma) so they don't match everything.
  return {
    target: target ?? ".",
    concise,
    excludes: excludes.filter((p) => p !== ""),
    severity,
  };
};

const check = async (args: string[]): Promise<void> => {
  // No path argument → default to the current working directory (`vl check .`).
  const { target, concise, excludes, severity } = parseCheckArgs(args);
  // No color when piped, when NO_COLOR is set, or in concise mode (kept plain
  // so scripts/grep see stable bytes).
  const c = makeColors(!concise && shouldColor());

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
    files = await collectVlFiles(target, excludes);
    if (files.length === 0) {
      console.error(`check: no .vl files found under ${target}`);
      Deno.exit(0);
    }
  } else {
    files = [target];
  }

  // CI gate: never run the program; fail on any diagnostic at or above the
  // `--severity` threshold (default `error`), aggregated across every file
  // checked. `tally.gating` counts exactly those diagnostics.
  const tally: CheckTally = { errors: 0, warnings: 0, gating: 0 };
  for (const file of files) {
    await checkFile(file, concise, c, tally, severity);
  }

  // Pretty mode ends with a Deno-style summary; concise stays output-stable.
  if (!concise) {
    console.error(summarize(tally, files.length, severity, c));
  }

  Deno.exit(tally.gating > 0 ? 1 : 0);
};

// --- dispatch -------------------------------------------------------------

// Program name in help/usage. The shipped binary is `vl` (see
// `scripts/build-binary.ts`); when run via `deno task run` the wrapper still
// forwards args unchanged, so `vl` reads correctly as the logical command.
const HELP = `vl — the Vital compiler & runner

Usage:
  vl <file.vl>                 compile and run a file
  vl -e "<source>"             compile and run an inline snippet
  cmd | vl   ·   vl < file.vl   compile and run stdin
  vl build <file.vl> [options]  compile to WebAssembly
  vl check [path] [options]     report diagnostics only (no run); CI exit code
  vl help  ·  --help  ·  -h     show this help

build options:
  -o, --out <file.wasm>        output path (default: <file>.wasm)
  --wat                        also write a .wat text dump alongside the .wasm

check:
  path                         a .vl file, or a directory checked recursively
                               (default: the current directory)
  --concise                    one terse line per diagnostic (grep-safe)
  --exclude, --ignore <glob>   skip paths matching <glob> when walking a
                               directory; repeatable, or comma-separated.
                               Matches the path relative to <path> and the
                               basename; \`*\` stops at \`/\`, \`**\` crosses it
  --severity <level>           exit non-zero on any diagnostic at or above
                               <level> (error > warning > info > hint;
                               default: error). All diagnostics still print;
                               this only gates the exit code

examples:
  vl hello.vl
  vl -e 'print(1 + 2)'
  vl build hello.vl --wat
  vl check .
  vl check . --exclude tests --exclude '*.gen.vl'
  vl check . --severity warning`;

const main = async (): Promise<void> => {
  const [maybeCmd, ...rest] = Deno.args;

  // Explicit help request.
  if (maybeCmd === "help" || maybeCmd === "--help" || maybeCmd === "-h") {
    console.log(HELP);
    return;
  }

  // Bare invocation in an interactive terminal: show help instead of silently
  // blocking on `Deno.stdin` (a TTY has nothing piped to read). Redirected or
  // piped stdin still falls through to `run`, so `echo … | vl` and
  // `vl < file.vl` keep working unchanged.
  if (Deno.args.length === 0 && stdinIsTerminal()) {
    console.log(HELP);
    return;
  }

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

// Run the CLI only when executed directly, not when imported (e.g. by tests
// that exercise `collectVlFiles`/`makeExcludeMatcher`).
if (import.meta.main) await main();
