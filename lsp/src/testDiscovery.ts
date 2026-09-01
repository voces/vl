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
// actual lexical grammar, via `vlLex.ts` — the shared host-side tokenizer this
// file originally carried inline, lifted out when folding (D9 slot 9) became
// its second consumer. Comments are DROPPED here (the default): the scan reads
// token adjacency (`it` then `(`), and a comment token between them would break
// that reading rather than inform it.
//
// Scope nesting tracks PAREN depth, not brace depth: a `describe`'s extent is
// exactly its own call's parentheses, which is true of every brace style
// including the formatter's one-liner.

import type { LspRange } from "./typeFeatures.ts";
import { type LexToken, tokenize } from "./vlLex.ts";

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
    if (t.kind === "punct") {
      if (t.s === "(") depth++;
      else if (t.s === ")") {
        if (depth > 0) depth--;
        while (stack.length > 0 && depth <= stack[stack.length - 1].baseDepth) {
          stack.pop();
        }
      }
      continue;
    }
    if (t.kind !== "ident") continue;
    const kind = REGISTRARS[t.s];
    if (kind === undefined) continue;
    // A member call (`suite.it("x")`) is somebody else's `it`.
    const prev = toks[i - 1];
    if (prev !== undefined && prev.kind === "punct" && prev.s === ".") continue;
    // A registration is `name ( "literal"` and nothing else: a declaration
    // (`function it(name: string …)`) and a dynamic name both fail here.
    const open = toks[i + 1];
    const arg = toks[i + 2];
    if (open === undefined || open.kind !== "punct" || open.s !== "(") continue;
    if (arg === undefined || arg.kind !== "str") continue;
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
//              at <file>:<line>:<col>  9 — std:test's own second line (see below)
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

/**
 * Where the failing `expect(...)` was WRITTEN — `std:test`'s track-caller line,
 * parsed back off the report. `file` is the caller's module key, spelled exactly
 * as the `vl test` target was (absolute for an absolute target); `line`/`col` are
 * 1-based, anchored on the `expect` token itself.
 *
 * It is a location, not a chain: `std:test`'s `CallerLoc` is one hop, and a
 * helper that forwards its own `caller` reports its CALLER — so a location in a
 * DIFFERENT file than the test is normal and correct, not a parse error.
 */
export interface FailureLocation {
  file: string;
  line: number;
  col: number;
}

export interface TestReportResult {
  /** The file header this line appeared under, or null if none preceded it. */
  file: string | null;
  path: string;
  outcome: TestOutcome;
  /** The indented block under a FAIL (failure text + any captured output). */
  message?: string;
  /** The `at <file>:<line>:<col>` line `std:test` appends to an `expect` failure. */
  location?: FailureLocation;
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

// `std:test` renders a failed `expect` as two lines — the assertion sentence, then
// `  at <file>:<line>:<col>`.
//
// ANCHORING IS NOT WHAT MAKES THIS READABLE; BEING LAST IS. The sentence ends in
// a RENDERED OPERAND, which is arbitrary user text, and a MULTI-LINE one puts a
// perfectly anchored forgery inside the sentence — measured,
// `expect("x\n  at /forged/file.vl:99:99\n").toEqual("y")` produces two lines
// matching this regex. `std:test` appends its own line last and owns the
// prohibition on appending anything after it; this end takes the last match.
const AT = /^ {2}at (.+):(\d+):(\d+)$/;

// The report's own sentinel. Everything past it is the test's stdout, which can
// contain anything at all — including a line shaped like the one above — so the
// scan stops here rather than reading the whole block.
const CAPTURED = "--- captured output ---";

/**
 * The `expect` location in one failure block, or undefined (a `fail(msg)`, a raw
 * trap, or a `<compile>` error carries none).
 *
 * The LAST match before the captured-output sentinel wins: `std:test` appends its
 * line after the assertion sentence, so a location the author's own message
 * happened to contain is the earlier one.
 */
export const failureLocation = (
  message: string,
): FailureLocation | undefined => {
  let found: FailureLocation | undefined;
  for (const line of message.split("\n")) {
    if (line === CAPTURED) break;
    const m = AT.exec(line);
    if (m !== null) {
      found = { file: m[1], line: Number(m[2]), col: Number(m[3]) };
    }
  }
  return found;
};

// ---- the failure anchor ------------------------------------------------------
//
// D9 slot 12 asked for a HEURISTIC: when a test body holds exactly one
// `expect(...)`, anchor the failure at that call. This supersedes it and was
// never built, because the runner now REPORTS the position and the heuristic's
// two blind spots are structural rather than fixable — a body with two expects
// had to fall back to the `it` line, and a failure inside a HELPER is not in the
// test body at all, so no scan of that body could find it.

/** A reported failure position in editor coordinates, resolved to a real file. */
export interface FailureAnchor {
  /** Absolute path of the file the message anchors in. */
  file: string;
  /**
   * True when that is the very file `vl test` was pointed at. The caller needs
   * this because an unsaved buffer runs from a MIRROR beside the original, so
   * the target's path must map back to the document rather than to a dotfile the
   * user never opened.
   */
  isTarget: boolean;
  /** 0-based line — `std:test` counts from 1, editors from 0. */
  line: number;
  /** 0-based column. */
  col: number;
}

/**
 * Resolve one reported location against the run that produced it. `cwd` is where
 * `vl test` was spawned and `target` is the path it was handed.
 *
 * **Every module key in a report is spelled relative to the CWD**, not to the
 * entry file's directory — measured 2026-09-01 with the two deliberately
 * different: `vl test sub/hop.test.vl` from the parent reports the entry as
 * `sub/hop.test.vl` AND a helper beside it as `sub/helper.vl`. So resolving the
 * key and the target the same way, against `cwd`, is what makes `isTarget` mean
 * what it says. (The extension always hands `vl test` an ABSOLUTE path, so its
 * own keys are absolute and the resolution is a no-op there; the relative case
 * is a hand-run CLI, and is the one this has to get right on purpose.)
 *
 * `resolve` is INJECTED — `path.resolve` from the caller — because joining and
 * absoluteness are platform questions (a Windows drive letter, a backslash) and
 * this module deliberately imports nothing: it is loaded by Deno tests under the
 * root config, where a `node:` builtin does not type-check.
 */
export const failureAnchor = (
  loc: FailureLocation,
  cwd: string,
  target: string,
  resolve: (base: string, rel: string) => string,
): FailureAnchor => {
  const file = resolve(cwd, loc.file);
  return {
    file,
    isTarget: file === resolve(cwd, target),
    line: Math.max(0, loc.line - 1),
    col: Math.max(0, loc.col - 1),
  };
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
            // The message is kept WHOLE, location line included: it is what the
            // Test Explorer's peek shows, and a lossless parse is the property
            // this parser has always had. `location` is extracted beside it.
            commit: (message) => {
              record.message = message;
              record.location = failureLocation(message);
            },
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
