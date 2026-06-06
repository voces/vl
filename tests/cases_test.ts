// Source-level, black-box test harness for VL.
//
// Each `tests/cases/**/*.vl` file is a test. Expectations are declared with
// `// @directive` comments at the top of the file, so the corpus is
// implementation-agnostic: the same files will validate a future self-hosted
// compiler unchanged.
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

const walk = async function* (dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walk(child);
    else if (entry.name.endsWith(".vl")) yield child;
  }
};

const errorMessages = (diags: VLDiagnostic[]) =>
  diags.filter((d) => d.severity === "error").map((d) => d.message);

const warningMessages = (diags: VLDiagnostic[]) =>
  diags.filter((d) => d.severity === "warning").map((d) => d.message);

const infoMessages = (diags: VLDiagnostic[]) =>
  diags.filter((d) => d.severity === "info").map((d) => d.message);

const hintMessages = (diags: VLDiagnostic[]) =>
  diags.filter((d) => d.severity === "hint").map((d) => d.message);

const files: URL[] = [];
for await (const f of walk(CASES_DIR)) files.push(f);
files.sort((a, b) => a.href.localeCompare(b.href));

for (const file of files) {
  const name = file.href.slice(CASES_DIR.href.length);
  const src = await Deno.readTextFile(file);
  const d = parseDirectives(src);

  Deno.test({
    name,
    ignore: d.skip != null,
    fn: async () => {
      if (d.unknown.length) {
        throw new Error(
          `unrecognized directive(s): ${
            d.unknown.map((k) => `@${k}`).join(", ")
          }`,
        );
      }

      const { diagnostics, wasm, sourceMap } = await quiet(() =>
        compile(src, name)
      );
      const errs = errorMessages(diagnostics);

      for (const want of d.errors) {
        if (!errs.some((m) => m.includes(want))) {
          throw new Error(
            `expected an error containing "${want}", got: ${
              JSON.stringify(errs)
            }`,
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
            `expected an info containing "${want}", got: ${
              JSON.stringify(infos)
            }`,
          );
        }
      }

      const hints = hintMessages(diagnostics);
      for (const want of d.hints) {
        if (!hints.some((m) => m.includes(want))) {
          throw new Error(
            `expected a hint containing "${want}", got: ${
              JSON.stringify(hints)
            }`,
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
                  ? `threw ${(thrown as Error).name}: ${
                    (thrown as Error).message
                  }`
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
    },
  });
}
