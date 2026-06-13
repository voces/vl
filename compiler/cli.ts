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
//   deno task check --fix <path>       # write provably-safe lint fixes to disk
//   deno task check . --severity warning  # fail on warnings AND hide info/hints
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
  checkProgram,
  compile,
  compileProgram,
  type CompileResult,
  runWasm,
  type VLDiagnostic,
  VLRuntimeError,
  type VLSeverity,
  wasmToWat,
} from "./compile.ts";
import { format } from "./format.ts";
import {
  letToConstFix,
  type LspTextEdit,
  prefixWithUnderscoreFix,
} from "../lsp/src/codeActions.ts";

const SUBCOMMANDS = new Set(["run", "build", "check", "fmt"]);

// --- module system (phase 1): multi-file dispatch -------------------------
//
// A `.vl` file may now `import` from other files. When it does, compilation must
// resolve the whole import graph (see `compileProgram`) rather than the single
// source string. We detect imports with a cheap textual check and, on a hit,
// drive the graph from the file's path with a filesystem reader; otherwise the
// existing single-string `compile` path is used unchanged (preserving exact
// behaviour — and the source map / trivia — for the overwhelmingly common
// import-free case). Kept self-contained here so a later rebase stays clean.

/** A leading `import {` (after optional whitespace/comments) on any line. */
const IMPORT_RE = /^\s*import\s*\{/m;
const hasImports = (source: string): boolean => IMPORT_RE.test(source);

// The std source directory `std:` module keys read from: the repo `std/`,
// sibling to `compiler/`, resolved off this module's URL (so the CLI works from
// any cwd). `std:NAME` ↔ `std/NAME.vl`, slash segments as subdirectories.
const STD_DIR = new URL("../std/", import.meta.url);

/**
 * Read a module's source by its resolved key for the graph resolver;
 * `undefined` if absent. A `std:` key reads from the repo `std/` dir; every
 * other key is a filesystem path read as-is.
 */
const fsRead = (key: string): string | undefined => {
  try {
    return Deno.readTextFileSync(
      key.startsWith("std:")
        ? new URL(`${key.slice("std:".length)}.vl`, STD_DIR)
        : key,
    );
  } catch {
    return undefined;
  }
};

/**
 * Compile a file by path, choosing the multi-file graph driver when it imports
 * and the single-string path otherwise. `source` is the already-read text (so
 * callers don't read twice). The single-string path keeps the source map; the
 * graph path returns one wasm module for the whole program.
 */
const compileFile = (
  file: string,
  source: string,
): Promise<CompileResult> =>
  hasImports(source)
    ? compileProgram(file, fsRead, file)
    : compile(source, file);

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

// The lowest severity in the order (`hint`). Used as the default *display
// floor*: with no explicit `--severity`, every diagnostic is at or above this,
// so `check` prints all of them (errors + warnings + info + hints) — preserving
// today's behaviour where the exit gate defaults to `error` but display is
// unfiltered.
const LOWEST_SEVERITY: VLSeverity = SEVERITY_ORDER[0];

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
  out.push(
    `${sevStyle(c.bold(`[${d.severity.toUpperCase()}]`))}: ${d.message}`,
  );

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

// `run`/`build` surface errors and warnings (correctness signals — a wasm trap
// waiting to happen, dead code, an empty intersection) but stay QUIET about
// info/hint-level advisories (style lints like const-over-let): those are the
// job of `check` and the editor, not noise on every execution. Errors still
// block separately (the compile produces no `wasm`); `vl check` shows the full
// set, including the hidden advisories.
const printRunDiagnostics = (diagnostics: readonly VLDiagnostic[]): void => {
  for (const d of diagnostics) {
    if (meetsThreshold(d.severity, "warning")) {
      console.error(formatDiagnostic(d));
    }
  }
};

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

  // Use the source file's name in the source map / trap messages when running a
  // file; inline / stdin snippets fall back to the default. A file that `import`s
  // drives the multi-file graph resolver; inline/stdin and import-free files use
  // the single-string path unchanged.
  const file = args.find((a) => !a.startsWith("-"));
  const { diagnostics, wasm, sourceMap } = file
    ? await compileFile(file, source)
    : await compile(source, "source.vl");
  printRunDiagnostics(diagnostics);

  if (!wasm) Deno.exit(1);

  try {
    const { logs } = await runWasm(wasm, sourceMap);
    for (const log of logs) console.log(log);
  } catch (err) {
    // A wasm trap is rethrown by `runWasm` as a VLRuntimeError carrying a
    // VL-source location (array OOB, divide-by-zero, …). Print it as a clean
    // diagnostic line instead of a raw wasm stack, then exit non-zero.
    if (err instanceof VLRuntimeError) {
      console.error(err.message);
      Deno.exit(1);
    }
    throw err;
  }
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
  const { diagnostics, wasm } = await compileFile(file, source);
  printRunDiagnostics(diagnostics);

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
// gate). `displayFloor` decides which diagnostics are *printed*: only those at
// or above it appear (in both concise and pretty paths). The floor defaults to
// the lowest severity (`hint`), so with no `--severity` flag everything shows;
// passing `--severity L` raises the floor to L so lower-severity diagnostics are
// hidden as well as un-gated. Counting still walks every diagnostic, so the
// tally (and the gating exit) is unaffected by what is shown.
// When `codegen` is true, use the full `compile()` pipeline (including binaryen
// codegen) so that codegen-only errors are also reported; otherwise the faster
// codegen-free `checkOnly()` path is used.
const checkFile = async (
  file: string,
  concise: boolean,
  c: Colors,
  tally: CheckTally,
  threshold: VLSeverity,
  displayFloor: VLSeverity,
  codegen: boolean,
): Promise<void> => {
  const source = await Deno.readTextFile(file);
  // Pick the diagnostics source on two axes:
  //  - `--codegen` runs the FULL pipeline (incl. binaryen codegen) so codegen-only
  //    errors (e.g. "Codegen error: recursion limit exceeded") surface here;
  //    without it, the codegen-free front end is used (faster; never loads the
  //    binaryen toolchain — `build`/`run` still surface codegen errors).
  //  - a file that `import`s is resolved through the whole-program graph resolver
  //    (cross-module references + bad imports) rather than the single-file path.
  // Both program paths discard any wasm — we only want the diagnostics.
  const { diagnostics } = codegen
    ? (hasImports(source)
      ? await compileProgram(file, fsRead, file)
      : await compile(source))
    : (hasImports(source)
      ? await checkProgram(file, fsRead)
      : checkOnly(source));
  if (diagnostics.length === 0) return;

  // Diagnostics to display: only those at or above the display floor. The tally
  // loop below still walks the full, unfiltered list so hidden diagnostics keep
  // their effect on the gating exit code.
  const shown = diagnostics.filter((d) =>
    meetsThreshold(d.severity, displayFloor)
  );

  if (concise) {
    for (const d of shown) {
      console.error(`${file}: ${formatDiagnostic(d)}`);
    }
  } else {
    const sourceLines = source.split("\n");
    for (const d of shown) {
      console.error(formatPretty(d, file, sourceLines, c));
      console.error("");
    }
  }

  // `gating` walks the full list (a hidden diagnostic still gates the exit if it
  // meets the gate threshold). `errors`/`warnings` feed the summary line, so we
  // count only *shown* diagnostics — otherwise the summary would advertise
  // counts the user can no longer see in the output above it.
  for (const d of diagnostics) {
    if (meetsThreshold(d.severity, threshold)) tally.gating++;
  }
  for (const d of shown) {
    if (d.severity === "error") tally.errors++;
    else if (d.severity === "warning") tally.warnings++;
  }
};

// --- check --fix ----------------------------------------------------------
//
// `vl check --fix` writes the *provably-safe* lint auto-fixes back to disk
// (eslint-`--fix` / `cargo fix` style), reusing the pure quick-fix edit logic in
// `lsp/src/codeActions.ts` (no duplication — the same `{range,newText}` edits the
// LSP offers). Only fixes that cannot change program behaviour are applied:
//
//   - `prefer-const`  → `let` becomes `const` (the lint already proved the
//                       binding is never reassigned, so the rename is inert).
//   - `unused-variable` → prefix the name with `_` (purely additive — it only
//                       silences the warning; the binding/initializer is kept).
//
// Deliberately NOT auto-applied (left as LSP-only suggestions): the
// `unused-variable` *remove-binding* fix (could delete a side-effecting
// initializer) and every dead-branch / constant-condition / `for`-step-0 fix
// (those need human judgement about which arm to keep).

// The lint rule `code`s whose fixes are safe to apply automatically. A diagnostic
// whose `code` isn't here is never touched by `--fix`.
const SAFE_FIX_CODES = new Set(["prefer-const", "unused-variable"]);

// Compute the single safe auto-fix edit for one diagnostic, or `null` when the
// diagnostic has no safe fix. Each branch picks ONLY the behaviour-preserving
// quick-fix from `codeActions.ts` (e.g. unused-variable yields the `_`-prefix
// edit, never the remove-binding edit). Returns the rule `code` alongside the
// edit so the caller can tally fixes per rule.
const safeFixForDiagnostic = (
  source: string,
  d: VLDiagnostic,
): { code: string; edit: LspTextEdit } | null => {
  switch (d.code) {
    case "prefer-const": {
      const fix = letToConstFix(source, d.range);
      return fix ? { code: "prefer-const", edit: fix.edits[0] } : null;
    }
    case "unused-variable": {
      // ONLY the additive `_`-prefix — never the remove-binding fix (it could
      // drop a side-effecting initializer). A `_`-prefixed binding already emits
      // a `hint` (not a warning) and would re-prefix to `__`, so skip those: the
      // `prefixWithUnderscoreFix` is offered for the warning-severity case only.
      if (d.severity !== "warning") return null;
      const fix = prefixWithUnderscoreFix(d.range);
      return { code: "unused-variable", edit: fix.edits[0] };
    }
    default:
      return null;
  }
};

// Convert an LSP line/character position into an absolute offset into `source`.
// `lineStarts[i]` is the offset where line `i` begins (0-based line index); an
// out-of-range line falls back to the last known line start so a stray position
// never yields NaN (defensive — the lint always points at a real line).
const offsetOf = (
  lineStarts: number[],
  pos: { line: number; character: number },
): number =>
  (lineStarts[pos.line] ?? lineStarts[lineStarts.length - 1] ?? 0) +
  pos.character;

// Precompute the absolute start offset of every line in `source`.
const computeLineStarts = (source: string): number[] => {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
};

// Apply a set of text edits to `source`, returning the rewritten text. Edits are
// applied from the LAST source position to the FIRST so that earlier offsets stay
// valid as later text is spliced (no offset recomputation needed). The safe lint
// fixes never overlap (each touches a distinct declaration), so a simple
// position sort is sufficient.
const applyEdits = (source: string, edits: LspTextEdit[]): string => {
  const lineStarts = computeLineStarts(source);
  const resolved = edits
    .map((e) => ({
      start: offsetOf(lineStarts, e.range.start),
      end: offsetOf(lineStarts, e.range.end),
      newText: e.newText,
    }))
    .sort((a, b) => b.start - a.start); // last edit first
  let out = source;
  for (const e of resolved) {
    out = out.slice(0, e.start) + e.newText + out.slice(e.end);
  }
  return out;
};

// Per-rule fix counts for one `--fix` run (drives the report line).
type FixCounts = Map<string, number>;

// Apply every safe lint fix to one file's `source`. Returns the rewritten text
// (unchanged when nothing matched) and the per-rule counts. Pure — does no I/O.
const computeFixes = (
  source: string,
  diagnostics: VLDiagnostic[],
): { fixed: string; counts: FixCounts } => {
  const counts: FixCounts = new Map();
  const edits: LspTextEdit[] = [];
  for (const d of diagnostics) {
    if (d.code === undefined || !SAFE_FIX_CODES.has(String(d.code))) continue;
    const fix = safeFixForDiagnostic(source, d);
    if (!fix) continue;
    edits.push(fix.edit);
    counts.set(fix.code, (counts.get(fix.code) ?? 0) + 1);
  }
  if (edits.length === 0) return { fixed: source, counts };
  return { fixed: applyEdits(source, edits), counts };
};

// Fix one file in place: read it, collect front-end diagnostics, apply the safe
// fixes, and write the file back only when something changed. A clean file (or a
// file with only un-fixable diagnostics) is left untouched. Re-running is
// idempotent: a fixed `const`/`_x` no longer produces the diagnostic, so the
// second pass finds nothing to do. Returns the per-rule counts for this file.
//
// We always use the single-file `checkOnly` so every diagnostic `range` indexes
// exactly THIS file's text (the offsets we splice into). The multi-file graph
// (`checkProgram`) merges modules and loses per-file range provenance, so editing
// the entry text from merged ranges would be unsafe; for a file that `import`s,
// the unresolved cross-module names surface as errors which suppress the lint
// pass anyway (so `--fix` is a safe no-op there rather than a wrong edit).
const fixFile = async (file: string): Promise<FixCounts> => {
  const source = await Deno.readTextFile(file);
  const { diagnostics } = checkOnly(source);
  const { fixed, counts } = computeFixes(source, diagnostics);
  if (fixed !== source) {
    await Deno.writeFile(file, new TextEncoder().encode(fixed));
  }
  return counts;
};

type CheckArgs = {
  target: string;
  concise: boolean;
  excludes: string[];
  // Exit-code gate threshold. Defaults to `error` (only errors fail).
  severity: VLSeverity;
  // Display floor: only diagnostics at or above this are printed. Defaults to
  // the lowest severity (show everything) unless `--severity` is given, in which
  // case it equals `severity` so the run hides as well as un-gates lower levels.
  displayFloor: VLSeverity;
  // When true, run the full compile() pipeline (including binaryen codegen) so
  // that codegen-only errors (e.g. recursion limit exceeded) are also reported.
  // By default `check` uses the faster codegen-free `checkOnly()` path.
  codegen: boolean;
  // When true, write the provably-safe lint auto-fixes back to disk before
  // reporting (eslint-`--fix` style). Only `prefer-const` (`let`→`const`) and
  // `unused-variable` (`_`-prefix) are applied; see `safeFixForDiagnostic`.
  fix: boolean;
};

// Validate a `--severity` value against the known levels, exiting with a clean
// error on anything else (so `--severity warn` doesn't silently behave like the
// default). Returns the value narrowed to `VLSeverity`.
const parseSeverity = (value: string | undefined): VLSeverity => {
  if (
    value !== undefined && (SEVERITY_ORDER as readonly string[]).includes(value)
  ) {
    return value as VLSeverity;
  }
  const levels = SEVERITY_ORDER.slice().reverse().join(", ");
  console.error(
    `check: invalid --severity \`${value ?? ""}\` (expected one of: ${levels})`,
  );
  Deno.exit(2);
};

// Parse `check`'s args into a path target, the `--concise` flag, the list of
// `--exclude`/`--ignore` patterns, and the `--severity` level. Both value forms
// are accepted for `--exclude`/`--ignore` and `--severity`: a separate value
// (`--severity warning`) and an inline `=` form (`--severity=warning`). The
// consumed VALUE is never mistaken for the path target.
//
// `--severity` does double duty: it sets the exit-code gate AND the display
// floor. The gate defaults to `error` (today's behaviour: only errors fail).
// The display floor, however, defaults to "show everything" — so we track
// whether `--severity` was *explicitly* given. If it was, the display floor is
// raised to that level (hiding lower-severity diagnostics too); if not, the
// floor stays at the lowest severity and every diagnostic still prints.
const parseCheckArgs = (args: string[]): CheckArgs => {
  let target: string | undefined;
  let concise = false;
  let codegen = false;
  let fix = false;
  let severity: VLSeverity = "error";
  // Whether `--severity` was passed. Drives the display floor (see below).
  let severityGiven = false;
  const excludes: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--concise") {
      concise = true;
    } else if (a === "--codegen") {
      codegen = true;
    } else if (a === "--fix") {
      fix = true;
    } else if (a === "--exclude" || a === "--ignore") {
      const value = args[++i];
      if (value !== undefined) excludes.push(...value.split(","));
    } else if (a.startsWith("--exclude=") || a.startsWith("--ignore=")) {
      excludes.push(...a.slice(a.indexOf("=") + 1).split(","));
    } else if (a === "--severity") {
      severity = parseSeverity(args[++i]);
      severityGiven = true;
    } else if (a.startsWith("--severity=")) {
      severity = parseSeverity(a.slice(a.indexOf("=") + 1));
      severityGiven = true;
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
    // Floor = chosen level when `--severity` is explicit, else show-all.
    displayFloor: severityGiven ? severity : LOWEST_SEVERITY,
    codegen,
    fix,
  };
};

// Render the `--fix` summary line(s): one line per file that changed, listing the
// per-rule counts, plus a trailing total. Returns the lines (empty when nothing
// was fixed). Kept separate so the wording stays in one place.
const summarizeFixes = (
  perFile: { file: string; counts: FixCounts }[],
  c: Colors,
): string[] => {
  const RULE_LABEL: Record<string, string> = {
    "prefer-const": "let→const",
    "unused-variable": "_-prefix",
  };
  const lines: string[] = [];
  let total = 0;
  for (const { file, counts } of perFile) {
    const parts = [...counts.entries()].map(([code, n]) => {
      total += n;
      return `${n} ${RULE_LABEL[code] ?? code}`;
    });
    if (parts.length > 0) lines.push(c.dim(`fixed ${file}: ${parts.join(", ")}`));
  }
  if (total > 0) {
    const noun = total === 1 ? "fix" : "fixes";
    lines.push(c.dim(`Applied ${total} ${noun}.`));
  }
  return lines;
};

const check = async (args: string[]): Promise<void> => {
  // No path argument → default to the current working directory (`vl check .`).
  const { target, concise, excludes, severity, displayFloor, codegen, fix } =
    parseCheckArgs(args);
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

  // `--fix`: write the provably-safe lint auto-fixes back to disk BEFORE the
  // report runs, so the diagnostics printed below reflect the post-fix state (a
  // fixed `let`→`const` / `_`-prefix no longer warns). Each file is fixed in
  // place; a clean file is untouched, and re-running is idempotent. We then fall
  // through to the normal check loop, which re-reads the (now-fixed) files.
  if (fix) {
    const perFile: { file: string; counts: FixCounts }[] = [];
    for (const file of files) {
      perFile.push({ file, counts: await fixFile(file) });
    }
    for (const line of summarizeFixes(perFile, c)) console.error(line);
  }

  // CI gate: never run the program; fail on any diagnostic at or above the
  // `--severity` threshold (default `error`), aggregated across every file
  // checked. `tally.gating` counts exactly those diagnostics. `displayFloor`
  // controls which diagnostics are printed (everything by default; only ≥ the
  // chosen level when `--severity` is passed) — independent of the tally.
  const tally: CheckTally = { errors: 0, warnings: 0, gating: 0 };
  for (const file of files) {
    await checkFile(file, concise, c, tally, severity, displayFloor, codegen);
  }

  // Pretty mode ends with a Deno-style summary; concise stays output-stable.
  if (!concise) {
    console.error(summarize(tally, files.length, severity, c));
  }

  Deno.exit(tally.gating > 0 ? 1 : 0);
};

// --- fmt ------------------------------------------------------------------

// The AST-driven formatter (compiler/format.ts) rewrites source into canonical
// form: it parses to the typed AST and regenerates source from it (spans +
// comment list + the reprint-fidelity fields), reflowing over-long calls /
// literals / boolean chains and collapsing them back when they fit. `fmt` is a
// thin I/O shell around the pure `format()`:
//
//   vl fmt <file.vl>        print the formatted source to stdout
//   vl fmt -w <path>        rewrite the file(s) in place
//   vl fmt --check <path>   exit non-zero if any file is not already formatted
//   vl fmt <dir>            recurse over every *.vl under a directory
//   cmd | vl fmt            format stdin to stdout
//
// Self-contained (mirrors `check`'s walk/flags) so it composes with the other
// in-flight CLI work without touching the run/build/check regions.

type FmtArgs = {
  write: boolean;
  check: boolean;
  paths: string[];
};

const parseFmtArgs = (args: string[]): FmtArgs => {
  const parsed: FmtArgs = { write: false, check: false, paths: [] };
  for (const a of args) {
    if (a === "-w" || a === "--write") parsed.write = true;
    else if (a === "--check") parsed.check = true;
    else if (!a.startsWith("-")) parsed.paths.push(a);
  }
  return parsed;
};

// Format one file. In --check mode, report (don't rewrite) and flag drift; in
// -w mode, rewrite only when the content actually changes; otherwise print to
// stdout. Returns whether the file was already formatted (for the --check gate).
const fmtFile = async (
  file: string,
  opts: FmtArgs,
): Promise<{ changed: boolean }> => {
  const source = await Deno.readTextFile(file);
  const formatted = format(source);
  const changed = formatted !== source;

  if (opts.check) {
    if (changed) console.error(`${file}: not formatted`);
    return { changed };
  }
  if (opts.write) {
    if (changed) {
      await Deno.writeFile(file, new TextEncoder().encode(formatted));
    }
    return { changed };
  }
  await Deno.stdout.write(new TextEncoder().encode(formatted));
  return { changed };
};

const fmt = async (args: string[]): Promise<void> => {
  const opts = parseFmtArgs(args);

  // No path: format stdin to stdout (`cmd | vl fmt`). `-w` is meaningless on a
  // stream, so it is ignored; `--check` reports drift via the exit code.
  if (opts.paths.length === 0) {
    const source = await new Response(Deno.stdin.readable).text();
    const formatted = format(source);
    if (opts.check) {
      Deno.exit(formatted === source ? 0 : 1);
    }
    await Deno.stdout.write(new TextEncoder().encode(formatted));
    return;
  }

  // Expand each path: a file is taken as-is; a directory is walked recursively
  // (reusing `collectVlFiles`, the same skip-list as `check`).
  const files: string[] = [];
  for (const path of opts.paths) {
    let info: Deno.FileInfo;
    try {
      info = await Deno.stat(path);
    } catch {
      console.error(`fmt: no such file or directory: ${path}`);
      Deno.exit(2);
    }
    if (info.isDirectory) files.push(...await collectVlFiles(path));
    else files.push(path);
  }

  let drift = 0;
  for (const file of files) {
    const { changed } = await fmtFile(file, opts);
    if (changed && (opts.check || opts.write)) drift++;
  }

  // --check is a CI gate: non-zero exit when any file would change.
  if (opts.check) Deno.exit(drift > 0 ? 1 : 0);
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
  vl fmt [path] [-w|--check]    format source (AST-driven); stdout / write / gate
  vl help  ·  --help  ·  -h     show this help

build options:
  -o, --out <file.wasm>        output path (default: <file>.wasm)
  --wat                        also write a .wat text dump alongside the .wasm

check:
  path                         a .vl file, or a directory checked recursively
                               (default: the current directory)
  --concise                    one terse line per diagnostic (grep-safe)
  --fix                        write the provably-safe lint auto-fixes back to
                               disk (eslint --fix style), then report what
                               remains. Applies only behaviour-preserving fixes:
                               prefer-const (\`let\`→\`const\`) and unused-variable
                               (prefix the name with \`_\`). Removing a binding and
                               dead-branch fixes are left as editor suggestions.
                               Idempotent; a clean file is untouched
  --codegen                    also run binaryen codegen and report codegen
                               errors (e.g. recursion limit exceeded); slower
                               but catches issues that only surface at codegen
  --exclude, --ignore <glob>   skip paths matching <glob> when walking a
                               directory; repeatable, or comma-separated.
                               Matches the path relative to <path> and the
                               basename; \`*\` stops at \`/\`, \`**\` crosses it
  --severity <level>           exit non-zero on any diagnostic at or above
                               <level>, AND show only diagnostics at or above
                               <level> (error > warning > info > hint; default:
                               error gate, but show everything). E.g.
                               \`--severity warning\` fails on warnings/errors and
                               hides info/hints

fmt:
  path                         a .vl file or a directory (recursive); omit to
                               read stdin and write the result to stdout
  -w, --write                  rewrite the file(s) in place
  --check                      don't write; exit non-zero if any file differs

examples:
  vl hello.vl
  vl -e 'print(1 + 2)'
  vl build hello.vl --wat
  vl check .
  vl check . --exclude tests --exclude '*.gen.vl'
  vl check . --severity warning
  vl check --fix src/
  vl fmt -w src/
  cat hello.vl | vl fmt`;

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
  if (cmd === "fmt") return await fmt(args);
  return await run(args);
};

// Run the CLI only when executed directly, not when imported (e.g. by tests
// that exercise `collectVlFiles`/`makeExcludeMatcher`).
if (import.meta.main) await main();
