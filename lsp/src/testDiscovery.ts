// D9 slot 8 — the pure half of the VS Code Testing API integration (per-test
// click-to-run for `*.test.vl`). Three parts, none of which imports `vscode`,
// so all three are Deno-testable (tests/lsp_test_discovery_test.ts) the same way
// `rename.ts` / `typeFeatures.ts` split planning from wiring:
//
//   1. DISCOVERY — `discoverTests(source)` scans a test file into the
//      `describe`/`it`/`itSkip` tree, each node carrying the scope-qualified
//      path the runner registers and a range for the gutter icon.
//   2. PLANNING — `planFileRun(...)` turns a set of clicked items into the
//      `vl test <file> [-t <filter>]` invocations that cover them, and says
//      which extra tests each substring filter will drag in.
//   3. PARSING — `parseTestReport(text)` maps `vl test`'s report back onto
//      those paths.
//
// ── WHY DISCOVERY IS A SCAN AND NOT A CHECKER QUERY ───────────────────────────
// A test's name is the STRING LITERAL argument of `describe(...)`/`it(...)`, and
// the checker's token surface (`lexicalTokensAt`) deliberately omits string
// literals — it can find the CALLS but not their names. The runner itself
// discovers by INSTANTIATING the module (registration is top-level code), which
// an editor must not do per keystroke. So the tree here is static, and these are
// its honest limits, all of them shared with any static scan:
//
//   • a dynamically-built name (`it("case " + n, …)`) is invisible to the scan.
//     It still RUNS under a whole-file run, and its result line comes back
//     unmatched — reported to the run's output rather than dropped.
//   • a registration inside a helper function is attributed to where it is
//     WRITTEN, not to where the helper is called.
//   • conditional registration (`if x { it(…) }`) is listed unconditionally.
//
// The runner's own report is the authority on what actually ran; the scan only
// has to be good enough to click on.
//
// ── LEXING, NOT REGEXING ──────────────────────────────────────────────────────
// A line regex gets `it("}")`, `// it("dead")` and `describe("a\"b")` wrong, and
// gets the one-line form `vl fmt` produces (`it("x", () => { … })` on a single
// line) wrong in the other direction. So this tokenizes properly over VL's
// actual lexical grammar (compiler/lexer.vl): `//` line comments only — there is
// no block comment — `"…"` strings and `'…'` char literals sharing one escape
// set (`\n \t \r \\ \" \' \0 \b \f \v \xXX \uXXXX \u{…}`, plus backslash-newline
// line continuation, unknown escapes kept verbatim), and no interpolation.
//
// Scope nesting tracks PAREN depth, not brace depth: a `describe`'s extent is
// exactly its own call's parentheses, which is true of every brace style
// including the formatter's one-liner.

import type { LspRange } from "./typeFeatures.ts";

// ---- the discovered tree -----------------------------------------------------

export type TestKind = "describe" | "it" | "itSkip";

export interface DiscoveredTest {
  kind: TestKind;
  /** The literal as written (escapes decoded), i.e. the runner's own `name`. */
  name: string;
  /**
   * The scope-qualified name, `" > "`-joined — byte-for-byte what
   * `vltRegister` (std/test.vl) pushes and therefore what the report prints and
   * `-t` matches against. A `describe`'s own path is the prefix its tests carry;
   * it is never a registered name itself.
   */
  path: string;
  /** The `it`/`describe` identifier through the closing quote of its name. */
  range: LspRange;
  children: DiscoveredTest[];
}

const REGISTRARS: Record<string, TestKind> = {
  describe: "describe",
  it: "it",
  itSkip: "itSkip",
};

// ---- tokenizer ---------------------------------------------------------------

interface Pos {
  line: number;
  character: number;
}

interface Tok {
  k: "ident" | "str" | "punct";
  /** The identifier text, the DECODED string value, or the punctuation run. */
  s: string;
  start: Pos;
  end: Pos;
}

const CH_0 = 48, CH_9 = 57;
const CH_A = 65, CH_Z = 90, CH_a = 97, CH_z = 122;
const CH_UNDERSCORE = 95, CH_DOLLAR = 36;

const isDigit = (c: number): boolean => c >= CH_0 && c <= CH_9;
const isIdentStart = (c: number): boolean =>
  (c >= CH_A && c <= CH_Z) || (c >= CH_a && c <= CH_z) ||
  c === CH_UNDERSCORE || c === CH_DOLLAR;
const isIdentPart = (c: number): boolean => isIdentStart(c) || isDigit(c);

// The single-character escapes, exactly compiler/lexer.vl's set. An escape NOT
// in here keeps the escaped character verbatim (the lexer warns and does the
// same), so `\q` decodes to `q`.
const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "\\": "\\",
  '"': '"',
  "'": "'",
  "0": "\0",
  b: "\b",
  f: "\f",
  v: "\v",
};

const hexValue = (source: string, from: number, count: number): number => {
  let v = 0;
  for (let i = 0; i < count; i++) {
    const d = parseInt(source[from + i] ?? "", 16);
    if (Number.isNaN(d)) return -1;
    v = v * 16 + d;
  }
  return v;
};

const fromCode = (code: number): string => {
  if (code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
};

interface StringScan {
  /** Decoded value; meaningless when `terminated` is false. */
  value: string;
  /** Index one past the closing quote (or past where the scan gave up). */
  next: number;
  terminated: boolean;
  /** Newlines consumed by line continuations, for position tracking. */
  lineBreaks: number;
  /** Index of the last newline consumed, or -1. */
  lastBreak: number;
}

/** Scans the literal opening at `source[from]` (a `"` or `'`). */
const scanStringLiteral = (source: string, from: number): StringScan => {
  const quote = source[from];
  let value = "";
  let i = from + 1;
  let lineBreaks = 0;
  let lastBreak = -1;
  while (i < source.length) {
    const c = source[i];
    if (c === quote) {
      return { value, next: i + 1, terminated: true, lineBreaks, lastBreak };
    }
    if (c === "\n") {
      // An unescaped newline ends the literal in the lexer too (unterminated).
      return { value, next: i, terminated: false, lineBreaks, lastBreak };
    }
    if (c !== "\\") {
      value += c;
      i++;
      continue;
    }
    const e = source[i + 1];
    if (e === undefined) break;
    if (e === "\n") {
      // Line continuation: the backslash and the newline both disappear.
      lineBreaks++;
      lastBreak = i + 1;
      i += 2;
      continue;
    }
    if (e === "x") {
      const v = hexValue(source, i + 2, 2);
      if (v >= 0) {
        value += fromCode(v);
        i += 4;
        continue;
      }
    } else if (e === "u") {
      if (source[i + 2] === "{") {
        const close = source.indexOf("}", i + 3);
        if (close > i + 2 && close - (i + 3) <= 6) {
          const v = hexValue(source, i + 3, close - (i + 3));
          if (v >= 0) {
            value += fromCode(v);
            i = close + 1;
            continue;
          }
        }
      } else {
        const v = hexValue(source, i + 2, 4);
        if (v >= 0) {
          value += fromCode(v);
          i += 6;
          continue;
        }
      }
    }
    // A simple escape, or an unknown one kept verbatim.
    value += SIMPLE_ESCAPES[e] ?? e;
    i += 2;
  }
  return { value, next: source.length, terminated: false, lineBreaks, lastBreak };
};

/**
 * Every token that matters, in order. Whitespace and `//` comments are dropped;
 * a char literal is dropped too (it can never be a test name and it can hold a
 * `"` that would otherwise derail the string scan). EVERY other character
 * becomes a punct token — a cheap way to guarantee that "identifier immediately
 * followed by `(`" really means a call, so `xs[it]("x")` cannot be mistaken for
 * one.
 */
const tokenize = (source: string): Tok[] => {
  const toks: Tok[] = [];
  let i = 0;
  let line = 0;
  let lineStart = 0;
  const posAt = (idx: number): Pos => ({
    line,
    character: idx - lineStart,
  });
  while (i < source.length) {
    const c = source[i];
    if (c === "\n") {
      line++;
      i++;
      lineStart = i;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v") {
      i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      i = nl < 0 ? source.length : nl;
      continue;
    }
    if (c === '"' || c === "'") {
      const start = posAt(i);
      const scan = scanStringLiteral(source, i);
      if (scan.lineBreaks > 0) {
        line += scan.lineBreaks;
        lineStart = scan.lastBreak + 1;
      }
      const end = posAt(scan.next);
      if (c === '"' && scan.terminated) {
        toks.push({ k: "str", s: scan.value, start, end });
      } else if (!scan.terminated) {
        // Unterminated: emit nothing, but do not rescan the same characters.
        toks.push({ k: "punct", s: c, start, end });
      }
      i = scan.next;
      continue;
    }
    const code = source.charCodeAt(i);
    if (isIdentStart(code)) {
      const from = i;
      while (i < source.length && isIdentPart(source.charCodeAt(i))) i++;
      toks.push({
        k: "ident",
        s: source.slice(from, i),
        start: posAt(from),
        end: posAt(i),
      });
      continue;
    }
    if (isDigit(code)) {
      // A numeric run is one opaque token — never a call target, and keeping it
      // whole stops `1.0` from emitting a `.` that would gate a later ident.
      const from = i;
      while (i < source.length) {
        const cc = source.charCodeAt(i);
        if (isIdentPart(cc)) i++;
        else if (source[i] === "." && isDigit(source.charCodeAt(i + 1))) i++;
        else break;
      }
      toks.push({
        k: "punct",
        s: source.slice(from, i),
        start: posAt(from),
        end: posAt(i),
      });
      continue;
    }
    toks.push({ k: "punct", s: c, start: posAt(i), end: posAt(i + 1) });
    i++;
  }
  return toks;
};

// ---- discovery ---------------------------------------------------------------

interface Frame {
  node: DiscoveredTest;
  /** Paren depth OUTSIDE the `describe(` — the frame closes on returning to it. */
  baseDepth: number;
}

/** The `describe`/`it`/`itSkip` tree of one source, in registration order. */
export const discoverTests = (source: string): DiscoveredTest[] => {
  const toks = tokenize(source);
  const roots: DiscoveredTest[] = [];
  const stack: Frame[] = [];
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.k === "punct") {
      if (t.s === "(") depth++;
      else if (t.s === ")") {
        if (depth > 0) depth--;
        while (stack.length > 0 && depth <= stack[stack.length - 1].baseDepth) {
          stack.pop();
        }
      }
      continue;
    }
    if (t.k !== "ident") continue;
    const kind = REGISTRARS[t.s];
    if (kind === undefined) continue;
    // A member call (`suite.it("x")`) is somebody else's `it`.
    const prev = toks[i - 1];
    if (prev !== undefined && prev.k === "punct" && prev.s === ".") continue;
    // A registration is `name ( "literal"` and nothing else: a declaration
    // (`function it(name: string …)`) and a dynamic name both fail here.
    const open = toks[i + 1];
    const arg = toks[i + 2];
    if (open === undefined || open.k !== "punct" || open.s !== "(") continue;
    if (arg === undefined || arg.k !== "str") continue;
    const scope = stack.length > 0 ? stack[stack.length - 1].node.path : "";
    const node: DiscoveredTest = {
      kind,
      name: arg.s,
      path: scope.length > 0 ? scope + " > " + arg.s : arg.s,
      range: { start: t.start, end: arg.end },
      children: [],
    };
    (stack.length > 0 ? stack[stack.length - 1].node.children : roots).push(node);
    if (kind === "describe") stack.push({ node, baseDepth: depth });
  }
  return roots;
};

/** Every registered path, depth-first in registration order (`describe`s are scopes, not tests). */
export const leafPaths = (nodes: readonly DiscoveredTest[]): string[] => {
  const out: string[] = [];
  const walk = (list: readonly DiscoveredTest[]): void => {
    for (const n of list) {
      if (n.kind === "describe") walk(n.children);
      else out.push(n.path);
    }
  };
  walk(nodes);
  return out;
};

/** Every node, depth-first — the flattening the TestItem tree is built from. */
export const flattenTests = (
  nodes: readonly DiscoveredTest[],
): DiscoveredTest[] => {
  const out: DiscoveredTest[] = [];
  const walk = (list: readonly DiscoveredTest[]): void => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
};

// ---- the `-t` plan -----------------------------------------------------------
//
// `-t` is a SUBSTRING filter over the scope-qualified name (`cliContains` in
// compiler/cli_util.vl), not an exact match and not anchored. So a filter can
// only ever be too generous, never too narrow, and the plan's job is to pick the
// least generous string that still covers what was clicked and to SAY what else
// it will drag in. Two consequences, both deliberate:
//
//   • a `describe` runs under `"<path> > "` — the trailing separator, which is
//     longer than the bare path and therefore excludes a sibling `it` with the
//     same name as the describe. The bare path is kept as a fallback candidate
//     and wins only if it drags in strictly fewer tests (it cannot, but the
//     comparison is what makes "longest unique" a measurement rather than a
//     claim).
//   • an `it` has no longer handle than its own full path, so when one test's
//     path is a substring of another's the run is genuinely ambiguous. It is
//     still correct to run it: the extra results map onto their own items and
//     are REPORTED, not dropped.

export interface RunTarget {
  path: string;
  kind: TestKind;
}

export interface TestRunSpec {
  /** The `-t` argument, or undefined for an unfiltered whole-file run. */
  filter?: string;
  /** The registered paths this spec was asked to run. */
  targetPaths: string[];
  /** Paths the substring filter additionally selects — reported, not dropped. */
  extraPaths: string[];
}

/** The registered paths a click on `target` MEANS (before substring slop). */
export const selectedPaths = (
  all: readonly string[],
  target: RunTarget,
): string[] =>
  target.kind === "describe"
    ? all.filter((p) => p.startsWith(target.path + " > "))
    : all.filter((p) => p === target.path);

/** The registered paths `-t filter` actually selects (`cliContains`). */
export const substringPaths = (
  all: readonly string[],
  filter: string,
): string[] => all.filter((p) => p.includes(filter));

/** The narrowest `-t` for `target`, plus what it over-runs. */
export const filterFor = (
  all: readonly string[],
  target: RunTarget,
): { filter: string; extraPaths: string[] } => {
  const want = new Set(selectedPaths(all, target));
  const candidates = target.kind === "describe"
    ? [target.path + " > ", target.path]
    : [target.path];
  let best: { filter: string; extraPaths: string[] } | undefined;
  for (const filter of candidates) {
    const extraPaths = substringPaths(all, filter).filter((p) => !want.has(p));
    if (
      best === undefined ||
      extraPaths.length < best.extraPaths.length ||
      (extraPaths.length === best.extraPaths.length &&
        filter.length > best.filter.length)
    ) {
      best = { filter, extraPaths };
    }
  }
  return best!;
};

/**
 * The `vl test` invocations covering `targets` within one file. An empty
 * `targets` (or one covering every registered path) is a whole-file run with no
 * `-t` at all; otherwise one spawn per requested root.
 */
export const planFileRun = (
  all: readonly string[],
  targets: readonly RunTarget[],
): TestRunSpec[] => {
  const wholeFile = (): TestRunSpec[] => [
    { targetPaths: [...all], extraPaths: [] },
  ];
  if (targets.length === 0) return wholeFile();

  // Drop a target that some OTHER requested `describe` already contains, and
  // collapse exact duplicates — one spawn per root, never one per descendant.
  const seen = new Set<string>();
  const roots: RunTarget[] = [];
  for (const t of targets) {
    const key = t.kind + " " + t.path;
    if (seen.has(key)) continue;
    seen.add(key);
    const covered = targets.some((o) =>
      o !== t && o.kind === "describe" && t.path.startsWith(o.path + " > ")
    );
    if (!covered) roots.push(t);
  }

  const union = new Set<string>();
  for (const r of roots) for (const p of selectedPaths(all, r)) union.add(p);
  if (all.length > 0 && union.size === new Set(all).size) return wholeFile();

  return roots.map((r) => {
    const { filter, extraPaths } = filterFor(all, r);
    return { filter, targetPaths: selectedPaths(all, r), extraPaths };
  });
};

// ---- the report parser -------------------------------------------------------
//
// `vl test`'s report (compiler/cli.vl, `cliTestReport`) is column-stable:
//
//   <file path>                        column 0
//     ok   <scope-qualified name>      2 spaces + a 4-cell status + 1 space
//     FAIL <scope-qualified name>
//     skip <scope-qualified name>
//            <failure text>            7 spaces, one line each, under a FAIL
//            --- captured output ---
//            <the test's stdout>
//     no tests                         2 spaces, when the filter matched none
//   N files · P passed · F failed[ · S skipped]     column 0, last
//
// Two file-level outcomes wear a sentinel NAME rather than a separate shape:
// `<compile>` (the module did not typecheck) and `<file top level>` (its
// registration pass trapped). Both are reported as file errors, since no
// individual test can own them.
//
// Continuation lines are indented SEVEN spaces and status lines exactly TWO, so
// captured output that itself looks like a status line (`  ok   x` printed by
// the program under test) lands at nine columns and cannot be confused for one.
// ANSI is stripped first: the runner colors only when stdout is a terminal — a
// spawned child's is a pipe — but stripping costs nothing and survives a future
// `--color=always`.

export type TestOutcome = "passed" | "failed" | "skipped";

export interface TestReportResult {
  /** The file header this line appeared under, or null if none preceded it. */
  file: string | null;
  path: string;
  outcome: TestOutcome;
  /** The indented block under a FAIL (failure text + any captured output). */
  message?: string;
}

export interface TestReportFileError {
  file: string | null;
  /** `<compile>` or `<file top level>` — the runner's own sentinel. */
  label: string;
  message: string;
}

export interface TestReportSummary {
  files: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface ParsedTestReport {
  results: TestReportResult[];
  fileErrors: TestReportFileError[];
  /** Files whose report was `no tests` (the filter matched nothing there). */
  emptyFiles: string[];
  summary: TestReportSummary | null;
  /** Every line the parser could not classify, verbatim and in order. */
  unmatched: string[];
}

const ESC = "\u001b";
const ANSI = new RegExp(ESC + "\\[[0-9;]*m", "g");

export const stripAnsi = (s: string): string => s.replace(ANSI, "");

const SUMMARY =
  /^(\d+) files? · (\d+) passed · (\d+) failed(?: · (\d+) skipped)?$/;

const STATUS: Record<string, TestOutcome> = {
  "ok  ": "passed",
  FAIL: "failed",
  skip: "skipped",
};

export const parseTestReport = (text: string): ParsedTestReport => {
  const results: TestReportResult[] = [];
  const fileErrors: TestReportFileError[] = [];
  const emptyFiles: string[] = [];
  const unmatched: string[] = [];
  let summary: TestReportSummary | null = null;
  let file: string | null = null;
  // The indented block a 7-space continuation line belongs to: a failing test's
  // message, or a file error's. Null between blocks. `commit` writes the joined
  // lines back onto the record that opened it, when the block ends.
  let block: { lines: string[]; commit: (message: string) => void } | null =
    null;
  const closeBlock = (): void => {
    if (block === null) return;
    block.commit(block.lines.join("\n"));
    block = null;
  };

  for (const raw of stripAnsi(text).split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

    if (block !== null && line.startsWith("       ")) {
      block.lines.push(line.slice(7));
      continue;
    }
    closeBlock();
    if (line.length === 0) continue;

    // A status line: exactly two spaces, a four-cell status, one space, a name.
    if (line.startsWith("  ") && line[2] !== " ") {
      const body = line.slice(2);
      const outcome = STATUS[body.slice(0, 4)];
      if (outcome !== undefined && body[4] === " ") {
        const name = body.slice(5);
        if (
          outcome === "failed" &&
          (name === "<compile>" || name === "<file top level>")
        ) {
          const record: TestReportFileError = { file, label: name, message: "" };
          fileErrors.push(record);
          block = {
            lines: [],
            commit: (message) => record.message = message,
          };
          continue;
        }
        const record: TestReportResult = { file, path: name, outcome };
        results.push(record);
        if (outcome === "failed") {
          block = {
            lines: [],
            commit: (message) => record.message = message,
          };
        }
        continue;
      }
      if (body === "no tests") {
        emptyFiles.push(file ?? "");
        continue;
      }
    }

    const m = SUMMARY.exec(line);
    if (m !== null) {
      summary = {
        files: Number(m[1]),
        passed: Number(m[2]),
        failed: Number(m[3]),
        skipped: m[4] === undefined ? 0 : Number(m[4]),
      };
      continue;
    }
    // Column 0 and not the summary: a file header. Anything else is output the
    // report does not own — handed back verbatim rather than guessed at.
    if (!line.startsWith(" ")) file = line;
    else unmatched.push(line);
  }
  closeBlock();

  return { results, fileErrors, emptyFiles, summary, unmatched };
};
