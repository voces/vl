// Source-level, black-box test harness for VL.
//
// Each `tests/cases/**/*.vl` file is a test. Expectations are declared with
// `// @directive` comments at the top of the file, so the corpus is
// implementation-agnostic: the same files will validate a future self-hosted
// compiler unchanged.
//
// MULTI-FILE ("module") CASES: a directory that contains an `entry.vl` is ONE
// case — a multi-file program whose entry point is `entry.vl`. It is compiled
// with `compileProgram` and an on-disk reader so `import "./util"` resolves to
// the sibling file. Directives live on `entry.vl` and are asserted with the
// SAME logic as a single-file case (diagnostics vs. directives; @run diffs the
// log). The harness does NOT descend into such a directory, so the sibling
// `.vl` files are never run as standalone single-file cases. Directories
// WITHOUT an `entry.vl` keep the plain file-per-test behavior.
//
// Directives:
//   // @check            type-check only, no run (default)
//   // @run              compile, then instantiate + run, capturing `log` output
//   // @error TEXT       expect an error diagnostic containing TEXT
//   // @error-at L:C TEXT expect an error at line L, col C containing TEXT
//   // @warning TEXT     expect a warning diagnostic containing TEXT
//   // @info TEXT        expect an info diagnostic containing TEXT
//   // @hint TEXT        expect a hint diagnostic containing TEXT
//   // @log TEXT         assert the Nth `log` line equals TEXT (ordered; @run)
//   // @trap TEXT        @run, but expect a runtime trap whose VL-located error
//                        message contains TEXT (e.g. "out of bounds"). The wasm
//                        is run WITH its source map so the message is mapped to
//                        `file:line:column` (roadmap B-debug).
//   // @skip REASON      register the test but skip it (REASON documents why)
//
// STRICT BY DEFAULT: a test fails on ANY diagnostic it did not declare — every
// error, warning, info, AND hint must be matched by a directive of that
// severity.
// "Compiles cleanly" is therefore the default contract — a file with no
// diagnostic directives is asserting it produces zero diagnostics, so there is
// no @ok / @no-error directive (omitting them IS the must-not-error assertion).
// Runtime `log` output is likewise fully specified: @run compares the entire,
// ordered log list, so an extra or missing line fails. An unrecognized directive
// also fails the test, so a typo can't silently disable a check.
//
// Run with:  deno task test

import {
  compile,
  compileProgram,
  type CompileResult,
  runWasm,
  type VLDiagnostic,
  VLRuntimeError,
} from "../compiler/compile.ts";

const CASES_DIR = new URL("./cases/", import.meta.url);

type Directives = {
  mode: "check" | "run";
  errors: string[];
  errorsAt: { line: number; col: number; text: string }[];
  warnings: string[];
  infos: string[];
  hints: string[];
  logs: string[];
  /**
   * Expected substrings of a runtime trap's mapped error message (@trap). When
   * non-empty the test runs in @run mode and asserts a trap whose message
   * contains EVERY listed substring (reason and/or `line:col`).
   */
  trap: string[];
  unknown: string[];
  skip: string | null;
};

const parseDirectives = (src: string): Directives => {
  const d: Directives = {
    mode: "check",
    errors: [],
    errorsAt: [],
    warnings: [],
    infos: [],
    hints: [],
    logs: [],
    trap: [],
    unknown: [],
    skip: null,
  };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("//")) continue;
    const m = line.slice(2).trim().match(/^@(\S+)\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    switch (key) {
      case "run":
        d.mode = "run";
        break;
      case "check":
        d.mode = "check";
        break;
      case "error":
        d.errors.push(rest);
        break;
      case "warning":
        d.warnings.push(rest);
        break;
      case "info":
        d.infos.push(rest);
        break;
      case "hint":
        d.hints.push(rest);
        break;
      case "error-at": {
        const at = rest.match(/^(\d+):(\d+)\s+(.*)$/);
        if (at) {
          d.errorsAt.push({
            line: Number(at[1]),
            col: Number(at[2]),
            text: at[3],
          });
        }
        break;
      }
      case "log":
        d.logs.push(rest);
        break;
      case "trap":
        d.mode = "run";
        d.trap.push(rest);
        break;
      case "skip":
        d.skip = rest || "no reason given";
        break;
      default:
        d.unknown.push(key);
        break;
    }
  }
  return d;
};

/** Silence the compiler's internal console noise during a step. */
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const { log, error, warn } = console;
  console.log = console.error = console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, error, warn });
  }
};

/**
 * A discovered test case. A single-file case is one `.vl` file compiled
 * standalone. A module case is a DIRECTORY that contains an `entry.vl`; it is
 * compiled as a multi-file program rooted at that `entry.vl`, with siblings
 * resolved on disk. The directives always come from `srcUrl`.
 */
type Case =
  | { kind: "single"; url: URL }
  | { kind: "module"; dir: URL; entry: URL };

/** True if `dir` directly contains an `entry.vl` (→ it is a single module case). */
const hasEntry = async (dir: URL): Promise<boolean> => {
  try {
    const st = await Deno.stat(new URL("entry.vl", dir));
    return st.isFile;
  } catch {
    return false;
  }
};

const walk = async function* (dir: URL): AsyncGenerator<Case> {
  // A directory holding an `entry.vl` is ONE multi-file case; do not descend
  // into it, so its sibling `.vl` files are never run as single-file cases.
  if (await hasEntry(dir)) {
    yield { kind: "module", dir, entry: new URL("entry.vl", dir) };
    return;
  }
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walk(child);
    else if (entry.name.endsWith(".vl")) yield { kind: "single", url: child };
  }
};

// The repo `std/` dir, for `std:` module keys — mirrors the CLI's fsRead
// mapping (`std:NAME` ↔ `std/NAME.vl`) so std-importing corpus cases compile
// through the same source of truth the CLI reads.
const STD_DIR = new URL("../std/", import.meta.url);

/**
 * Reads a `.vl` module given its resolved key for `compileProgram`. Keys are
 * absolute, `/`-separated filesystem paths (NOT `file://` URLs — the resolver's
 * pure string-math normalization would mangle a scheme) or verbatim `std:`
 * module keys (read from the repo `std/`). Returns `undefined` for a missing
 * path (an unresolvable import).
 */
const diskReader = (key: string): Promise<string | undefined> =>
  Deno.readTextFile(
    key.startsWith("std:")
      ? new URL(`${key.slice("std:".length)}.vl`, STD_DIR)
      : key,
  ).catch(() => undefined);

const errorMessages = (diags: VLDiagnostic[]) =>
  diags.filter((d) => d.severity === "error").map((d) => d.message);

const warningMessages = (diags: VLDiagnostic[]) =>
  diags.filter((d) => d.severity === "warning").map((d) => d.message);

const infoMessages = (diags: VLDiagnostic[]) =>
  diags.filter((d) => d.severity === "info").map((d) => d.message);

const hintMessages = (diags: VLDiagnostic[]) =>
  diags.filter((d) => d.severity === "hint").map((d) => d.message);

/**
 * Run the directive assertions against a compile result. This is shared by both
 * the single-file path (`compile`) and the module path (`compileProgram`) so
 * they enforce IDENTICAL semantics: declared diagnostics must appear, strict-by-
 * default rejects any undeclared diagnostic, and @run diffs the captured log.
 */
const assertCase = async (
  d: Directives,
  { diagnostics, wasm, sourceMap }: CompileResult,
): Promise<void> => {
  if (d.unknown.length) {
    throw new Error(
      `unrecognized directive(s): ${d.unknown.map((k) => `@${k}`).join(", ")}`,
    );
  }

  const errs = errorMessages(diagnostics);

  for (const want of d.errors) {
    if (!errs.some((m) => m.includes(want))) {
      throw new Error(
        `expected an error containing "${want}", got: ${JSON.stringify(errs)}`,
      );
    }
  }

  const warns = warningMessages(diagnostics);
  for (const want of d.warnings) {
    if (!warns.some((m) => m.includes(want))) {
      throw new Error(
        `expected a warning containing "${want}", got: ${
          JSON.stringify(warns)
        }`,
      );
    }
  }

  const infos = infoMessages(diagnostics);
  for (const want of d.infos) {
    if (!infos.some((m) => m.includes(want))) {
      throw new Error(
        `expected an info containing "${want}", got: ${JSON.stringify(infos)}`,
      );
    }
  }

  const hints = hintMessages(diagnostics);
  for (const want of d.hints) {
    if (!hints.some((m) => m.includes(want))) {
      throw new Error(
        `expected a hint containing "${want}", got: ${JSON.stringify(hints)}`,
      );
    }
  }

  for (const want of d.errorsAt) {
    const hit = diagnostics.some((di) =>
      di.severity === "error" &&
      di.range.start.line === want.line &&
      di.range.start.character === want.col &&
      di.message.includes(want.text)
    );
    if (!hit) {
      const got = diagnostics
        .filter((di) => di.severity === "error")
        .map((di) =>
          `${di.range.start.line}:${di.range.start.character} ${di.message}`
        );
      throw new Error(
        `expected an error at ${want.line}:${want.col} containing ` +
          `"${want.text}", got: ${JSON.stringify(got)}`,
      );
    }
  }

  // Strict by default: EVERY diagnostic must have been declared, at every
  // severity. A diagnostic is "expected" if a directive of its severity
  // matches its message (errors also via @error-at). Anything left over is
  // an unexpected regression and fails — so omitting the directives is
  // itself the must-not-error assertion (no @ok needed).
  const unexpected = (
    actual: string[],
    expected: (m: string) => boolean,
    severity: string,
    directive: string,
  ) => {
    const extra = actual.filter((m) => !expected(m));
    if (extra.length) {
      throw new Error(
        `unexpected ${severity}(s) (declare with ${directive} if ` +
          `intended): ${JSON.stringify(extra)}`,
      );
    }
  };
  unexpected(
    errs,
    (m) =>
      d.errors.some((w) => m.includes(w)) ||
      d.errorsAt.some((w) => m.includes(w.text)),
    "error",
    "@error",
  );
  unexpected(
    warns,
    (m) => d.warnings.some((w) => m.includes(w)),
    "warning",
    "@warning",
  );
  unexpected(
    infos,
    (m) => d.infos.some((w) => m.includes(w)),
    "info",
    "@info",
  );
  unexpected(
    hints,
    (m) => d.hints.some((w) => m.includes(w)),
    "hint",
    "@hint",
  );

  if (d.mode === "run") {
    if (!wasm) {
      throw new Error(
        `@run but no wasm was produced; errors: ${JSON.stringify(errs)}`,
      );
    }
    if (d.trap.length) {
      // Expect a runtime trap whose VL-located message contains every
      // declared substring. Run with the source map so the message is
      // mapped to `file:line:column` (roadmap B-debug).
      let thrown: unknown;
      try {
        await quiet(() => runWasm(wasm, sourceMap));
      } catch (err) {
        thrown = err;
      }
      if (!(thrown instanceof VLRuntimeError)) {
        throw new Error(
          `@trap expected a runtime trap, but the program ` +
            (thrown
              ? `threw ${(thrown as Error).name}: ${(thrown as Error).message}`
              : `ran without trapping`),
        );
      }
      for (const want of d.trap) {
        if (!thrown.message.includes(want)) {
          throw new Error(
            `@trap message mismatch\n  expected to contain: ${
              JSON.stringify(want)
            }\n` +
              `  actual:              ${JSON.stringify(thrown.message)}`,
          );
        }
      }
    } else {
      const { logs } = await quiet(() => runWasm(wasm, sourceMap));
      if (JSON.stringify(logs) !== JSON.stringify(d.logs)) {
        throw new Error(
          `log mismatch\n  expected: ${JSON.stringify(d.logs)}\n` +
            `  actual:   ${JSON.stringify(logs)}`,
        );
      }
    }
  }
};

const cases: Case[] = [];
for await (const c of walk(CASES_DIR)) cases.push(c);
const caseName = (c: Case): string =>
  (c.kind === "single" ? c.url.href : c.dir.href).slice(CASES_DIR.href.length);
cases.sort((a, b) => caseName(a).localeCompare(caseName(b)));

// Cases that use a NATIVE-ONLY capability the frozen TS host emitter cannot
// lower — adjudicated solely by the wasm oracle (`cases_wasm_test.ts`). The TS
// compiler is feature-frozen (ROADMAP "Kill the TS host"); never grow a twin of
// a native feature to satisfy it. Keyed by case name (the path under cases/).
const TS_HOST_INCOMPATIBLE: Record<string, string> = {
  "modules/std-fmt/":
    "the TS host emitter cannot pass a union-narrowed i64 as an i64 argument (`std:fmt`'s `toStr`); native lowers it — cases_wasm_test owns this case",
  "modules/std-testing-pass/":
    "the TS host emitter cannot lower `std:test`'s union-based `expect` over the full value-union (a value-union struct field read back, with i64/f64 members); native lowers it — cases_wasm_test owns this case",
};

// Cases whose `@error` directive pins VL's CANONICAL (clearer) diagnostic, which
// the frozen TS compiler words differently — so the TS oracle SKIPS them and the
// wasm oracle (`cases_wasm_test.ts`) adjudicates against VL's message. This is the
// directive-quality inverse of `EXPECTED_DIVERGENCES`: rather than shrinking the
// corpus directive to a substring both compilers happen to share (which buried
// VL's better message), the directive states VL's real message and the dying TS
// compiler opts out here. Both this list and `EXPECTED_DIVERGENCES` empty out as
// the TS compiler retires (ROADMAP "Kill the TS host"). Keyed by case name.
const WASM_CANONICAL_WORDING: Record<string, boolean> = {
  "arrays/render-i32-array.vl": true,
  "generics/type-alias-bare-error.vl": true,
  "index/wrong-key-type.vl": true,
  "index/wrong-value-type.vl": true,
  "lint/empty-intersection.vl": true,
  "maps/error-infer-conflict.vl": true,
  "sets/error-infer-conflict.vl": true,
  "soundness/exhaustive-is-chain-no-else-reject.vl": true,
  "soundness/exhaustive-missing-is-case.vl": true,
  "soundness/exhaustive-missing-literal-case.vl": true,
  "soundness/function-arg-type-reject.vl": true,
  "soundness/intersection-param-reject.vl": true,
  "soundness/is-non-variant-reject.vl": true,
  "soundness/is-not-variant-of-union-reject.vl": true,
  "soundness/literal-union-reject-arg.vl": true,
  "soundness/literal-union-reject-assign.vl": true,
  "soundness/literal-union-reject-non-member.vl": true,
  "soundness/narrowing-and-else-not-narrowed.vl": true,
  "soundness/narrowing-then-only-no-leak.vl": true,
  "soundness/nullable-access-nested.vl": true,
  "soundness/nullable-access-unguarded.vl": true,
  "soundness/nullable-chain-unguarded-reject.vl": true,
  "soundness/object-field-value-mismatch-generic.vl": true,
  "soundness/object-field-value-mismatch-inline.vl": true,
  "soundness/object-field-value-mismatch.vl": true,
  "soundness/return-union-unnarrowed-reject.vl": true,
  "soundness/struct-field-type-mismatch-reject.vl": true,
  "soundness/struct-missing-field-reject.vl": true,
  "soundness/union-four-variant-missing-reject.vl": true,
  "soundness/union-narrow-reject.vl": true,
  "types/empty-intersection-unused.vl": true,
  "types/fn-arg-type.vl": true,
  "types/negation-annotation-reject.vl": true,
  "types/return-mismatch.vl": true,
};

for (const c of cases) {
  const name = caseName(c);
  // Directives always come from the case's primary file: the lone `.vl` for a
  // single-file case, or `entry.vl` for a module case.
  const srcUrl = c.kind === "single" ? c.url : c.entry;
  const src = await Deno.readTextFile(srcUrl);
  const d = parseDirectives(src);

  Deno.test({
    name,
    ignore: d.skip != null || name in TS_HOST_INCOMPATIBLE ||
      name in WASM_CANONICAL_WORDING,
    fn: async () => {
      const result = await quiet(() => {
        if (c.kind === "single") return compile(src, name);
        // Module case: compile the multi-file program rooted at `entry.vl`,
        // reading siblings on disk so `import "./util"` resolves. The entry key
        // is the absolute filesystem path (not a `file://` URL — the resolver's
        // pure string normalization would mangle a scheme).
        const entryKey = c.entry.pathname;
        return compileProgram(entryKey, diskReader, name);
      });
      await assertCase(d, result);
    },
  });
}
