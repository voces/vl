// Many `vl check --json` runs in one process.
//
// A suite that grades one program per case pays a `vl` start-up and a fresh compiler
// instance per spawn, and the std modules every case imports are checked again each time.
// `vl check --batch --json <file>...` grades each named file exactly as a lone
// `vl check <file> --json` grades it (tests/vl_check_json_test.ts holds that equality), and
// prints one `{file, exit, diagnostics}` record per line, in argv order. A suite that folds
// its cases through here keeps every per-case assertion: each case reads its own record.

import { COMPILER, nativeEnv, VL } from "./tree.ts";

/** One diagnostic as `vl check --json` prints it. */
export type Diag = {
  file?: string;
  severity: string;
  stage?: string;
  code?: string;
  line: number;
  col: number;
  endCol: number;
  endLine?: number;
  message: string;
};

/** One file's verdict: the exit code a lone `vl check` of it would carry, and its
 * diagnostics. */
export type CheckRecord = { exit: number; diagnostics: Diag[] };

/** `vl check --batch --json` over `files` (absolute paths), one record per file in the
 * order given. `args` are extra check flags (`--severity`, `--codegen`, ...); `env` is
 * merged over `nativeEnv()`. Throws when the batch itself fails or its output does not
 * hold exactly one well-formed record per file, naming the file it lost. */
export const checkBatch = async (
  files: string[],
  opts: { args?: string[]; env?: Record<string, string>; cwd?: string } = {},
): Promise<CheckRecord[]> => {
  if (files.length === 0) return [];
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [
      "check",
      "--batch",
      "--json",
      ...(opts.args ?? []),
      ...files,
      "--compiler",
      COMPILER,
    ],
    cwd: opts.cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1", ...(opts.env ?? {}) }),
  }).output();
  const dec = new TextDecoder();
  const out = dec.decode(stdout);
  const lines = out.split("\n").filter((l) => l.trim() !== "");
  const recs: CheckRecord[] = [];
  for (const l of lines) {
    let rec;
    try {
      rec = JSON.parse(l);
    } catch {
      throw new Error(
        `check --batch: a line is not JSON (exit ${code}): ${l}\nstderr:\n${
          dec.decode(stderr)
        }`,
      );
    }
    if (
      typeof rec.file !== "string" || typeof rec.exit !== "number" ||
      !Array.isArray(rec.diagnostics)
    ) {
      throw new Error(
        `check --batch: not a {file, exit, diagnostics} record: ${l}`,
      );
    }
    recs.push({ exit: rec.exit, diagnostics: rec.diagnostics as Diag[] });
    if (rec.file !== files[recs.length - 1]) {
      throw new Error(
        `check --batch: record ${recs.length} is ${rec.file}, want ${
          files[recs.length - 1]
        }`,
      );
    }
  }
  if (recs.length !== files.length) {
    throw new Error(
      `check --batch: want ${files.length} records, got ${recs.length} (exit ${code}); ` +
        `first unanswered: ${files[recs.length]}\nstderr:\n${
          dec.decode(stderr)
        }`,
    );
  }
  return recs;
};
