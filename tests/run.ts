// Source-level, black-box test harness for VL.
//
// Each `tests/cases/**/*.vl` file is a test. Expectations are declared with
// `// @directive` comments at the top of the file, so the corpus is
// implementation-agnostic: the same files will validate a future self-hosted
// compiler unchanged.
//
// Directives:
//   // @check            type-check only (default)
//   // @run              compile, then instantiate + run, capturing `log` output
//   // @no-error         assert there are no error diagnostics
//   // @error TEXT       assert some error diagnostic message contains TEXT
//   // @log TEXT         assert the Nth `log` line equals TEXT (ordered; @run)
//   // @skip REASON      register the test but skip it (REASON documents why)
//
// Run with:  deno task test

import {
  compile,
  runWasm,
  type VLDiagnostic,
} from "../compiler/compile.ts";

const CASES_DIR = new URL("./cases/", import.meta.url);

type Directives = {
  mode: "check" | "run";
  errors: string[];
  errorsAt: { line: number; col: number; text: string }[];
  warnings: string[];
  logs: string[];
  noError: boolean;
  skip: string | null;
};

const parseDirectives = (src: string): Directives => {
  const d: Directives = {
    mode: "check",
    errors: [],
    errorsAt: [],
    warnings: [],
    logs: [],
    noError: false,
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
      case "no-error":
        d.noError = true;
        break;
      case "error":
        d.errors.push(rest);
        break;
      case "warning":
        d.warnings.push(rest);
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
      case "skip":
        d.skip = rest || "no reason given";
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
      const { diagnostics, wasm } = await quiet(() => compile(src));
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

      if (d.noError && errs.length) {
        throw new Error(`expected no errors, got: ${JSON.stringify(errs)}`);
      }

      if (d.mode === "run") {
        if (!wasm) {
          throw new Error(
            `@run but no wasm was produced; errors: ${JSON.stringify(errs)}`,
          );
        }
        const { logs } = await quiet(() => runWasm(wasm));
        if (JSON.stringify(logs) !== JSON.stringify(d.logs)) {
          throw new Error(
            `log mismatch\n  expected: ${JSON.stringify(d.logs)}\n` +
              `  actual:   ${JSON.stringify(logs)}`,
          );
        }
      }
    },
  });
}
