// The corpus oracle (ROADMAP "Kill the TS host"): the `tests/cases/**` files,
// each carrying its `// @directive` expectations, adjudicated by the SELF-HOSTED
// wasm compiler seed (`build/vl-compiler.wasm`) running under Deno. This is the
// SOLE behavioral corpus oracle — the TS compiler is retired, so there is no
// second compiler to compare against; the directives are the spec. `runWasm`
// (the V8 instantiate + print capture) is harness plumbing — it lives in the
// compiler-free `tests/support/runWasm.ts` so this oracle carries no dependency
// on `compiler/compile.ts` (kill-TS is deleting the TS front end).
//
// Seed loading follows `lsp/src/wasmChecker.ts`: `WebAssembly.Module`/
// `Instance` over the seed with an EMPTY import object, then the driver
// exports from `scripts/vl-compiler-driver.vl` — `srcReset`/`srcPush` (one
// call per code point), `checkSrc` (parse + typecheck) / `compileSrc` (+ emit;
// rc 0|1|2|3 = ok|parse|type|emit), `rbyteLen`/`rbyteAt` for the emitted
// bytes, `diagCount`/`diagMsgLen`/`diagMsgAt`/`diagLine`/`diagCol` for
// structured diagnostics, and the module-table protocol (`modReset`/
// `modKeyPush`/`modSrcPush`/`modCommit`/`modPending*`) for multi-file cases.
// The module table persists across compiles by design, so EVERY case starts
// with `modReset()`.
//
// Directive semantics (the corpus's `// @directive` contract), with the wasm
// tier's documented deltas:
//   - The wasm compiler has NO lint tier and only the "error" severity, so a
//     case whose ONLY directives are @warning/@info/@hint is SKIPPED here
//     (lint stays TS-adjudicated until the .vl lint pass — LSP-on-wasm
//     Stage 3). Lint directives on a case that ALSO has error/run directives
//     are ignored; the error-tier + runtime contract is still enforced.
//   - @error-at matches the LINE only. Column anchors diverge between the two
//     checkers on ~80 corpus files (the checker-parity sweep) — column
//     matching is residue for the span rungs (ROADMAP H-M "Spans").
//   - @trap asserts a runtime trap (a `VLRuntimeError` from `runWasm`) and
//     matches MESSAGE substrings only. `line:col` trap substrings are skipped:
//     they assert the source-map-located message, and the wasm pipeline does
//     not produce a source map.
//   - Strictness is per-severity over what the wasm tier CAN see: every wasm
//     diagnostic must be matched by an @error/@error-at directive, and every
//     @error/@error-at must match a diagnostic.
//   - Message matching folds case and quote style (`x` vs 'x') — wording
//     parity is not pinned across the two compilers, only verdicts (the
//     REJECT-parity policy). A directive whose text still matches only the TS
//     compiler's message lands in EXPECTED_DIVERGENCES below.
//
// The seed is built by `bash scripts/refresh-compiler.sh`. Absent (fresh
// clone, or the `ci` job, which has no seed) every test here self-ignores —
// the `ci-native` job runs this file explicitly after refreshing the seed.
//
// Run with:  deno test -A tests/cases_wasm_test.ts

import { runWasm, VLRuntimeError } from "./support/runWasm.ts";

const CASES_DIR = new URL("./cases/", import.meta.url);
const STD_DIR = new URL("../std/", import.meta.url);
const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;

const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();

// Cases where the wasm oracle's result legitimately differs from what the
// TS-worded directives pin. REJECT-verdict parity holds for every entry except
// where the reason says otherwise (the parked soundness xfails). Each entry
// skips its case; the trailing tripwire test fails on a stale entry. Burning
// this list down is the message/span-parity work that also gates the deno
// CHECK-tier deletion (ROADMAP F-tiers).
const EXPECTED_DIVERGENCES: Record<string, string> = {
  // The `unreachable: exhaustive is-chain` @info is TYPE-AWARE (A-exhaust): TS
  // derives it from the checker. The native lint pass is parse-only and the wasm
  // driver's diagnostic stream is error-only, so this info is TS-only until the
  // checker exposes warning/info diagnostics to the oracle (a later slice).
  "lint/exhaustive-is-chain-dead-else.vl":
    "type-aware `unreachable: exhaustive is-chain` @info — not produced by the parse-only native lint / error-only diag stream",
  "soundness/literal-is-union-param-dispatch.vl":
    "type-aware `unreachable: exhaustive is-chain` @info — TS-only (see lint/exhaustive-is-chain-dead-else)",
  "types/struct-union-same-shape.vl":
    "type-aware `unreachable: exhaustive is-chain` @info — TS-only (see lint/exhaustive-is-chain-dead-else)",
  "loops/empty-range.vl":
    "the empty-range @warning is a const-eval rule the native lint pass does not implement yet — TS-only",
  "lint/generic-intersection-no-warn.vl":
    "wasm CHECKER gap: a generic intersection `T & S` reports `unknown type 'T&S'` where the TS checker accepts it (not a lint divergence)",
  "soundness/README.vl":
    "a prose line parses as @run; the wasm emitter rejects a statement-less program (TS emits an empty module)",
  "soundness/xfail-arith-hole-operand.vl":
    "parked soundness xfail (arith-hole-operand, ROADMAP A13): the wasm pipeline emits an invalid module",
  "soundness/xfail-array-element-recursion.vl":
    "parked soundness xfail: wasm rejects the i32-keyed-map element recursion the TS checker accepts",
  "soundness/xfail-seq-guard-residual-codegen.vl":
    "@error pins the TS host's own Codegen error; the wasm checker rejects earlier, at the type tier",
};

type Exports = Record<string, (...args: number[]) => number>;

/** One wasm call per code point — fine at corpus scale. */
const pushString = (push: (cp: number) => number, text: string) => {
  for (const ch of text) push(ch.codePointAt(0)!);
};

const readString = (len: number, at: (j: number) => number): string => {
  const cps = new Array<number>(len);
  for (let j = 0; j < len; j++) cps[j] = at(j);
  return String.fromCodePoint(...cps);
};

const exports: Exports | undefined = seedExists
  ? (() => {
    const bytes = Deno.readFileSync(SEED);
    const module = new WebAssembly.Module(bytes);
    return new WebAssembly.Instance(module, {})
      .exports as unknown as Exports;
  })()
  : undefined;

type Directives = {
  mode: "check" | "run";
  errors: string[];
  errorsAt: { line: number; col: number; text: string }[];
  warnings: string[];
  infos: string[];
  hints: string[];
  logs: string[];
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


type Case =
  | { kind: "single"; url: URL }
  | { kind: "module"; dir: URL; entry: URL };

const hasEntry = (dir: URL): boolean => {
  try {
    return Deno.statSync(new URL("entry.vl", dir)).isFile;
  } catch {
    return false;
  }
};

// A directory holding an `entry.vl` is ONE multi-file case (never descended
// into); other directories are walked file-per-test.
const walk = function* (dir: URL): Generator<Case> {
  if (hasEntry(dir)) {
    yield { kind: "module", dir, entry: new URL("entry.vl", dir) };
    return;
  }
  for (const entry of Deno.readDirSync(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walk(child);
    else if (entry.name.endsWith(".vl")) yield { kind: "single", url: child };
  }
};

/** Mirrors the Rust host's module gate: a LINE-LEADING `import {`. */
const hasImports = (source: string): boolean =>
  source.split("\n").some((l) => {
    const t = l.trimStart();
    return t.startsWith("import") &&
      t.slice("import".length).trimStart().startsWith("{");
  });

/**
 * Read a module source for the fetch loop. Keys are absolute filesystem paths,
 * except `std:NAME` which maps to `<repo>/std/NAME.vl` (slash segments are
 * subdirectories) — the same mapping the Rust host and the LSP reader apply.
 * `undefined` = unreadable (the COMPILER emits the cannot-resolve diagnostic).
 */
const readModuleSrc = (key: string): string | undefined => {
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

type WasmDiag = {
  message: string;
  /** 1-based; 0 = positionless. */
  line: number;
  col: number;
};

const readDiags = (exp: Exports): WasmDiag[] => {
  const out: WasmDiag[] = [];
  const count = exp.diagCount();
  for (let i = 0; i < count; i++) {
    out.push({
      message: readString(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j)),
      line: exp.diagLine(i),
      col: exp.diagCol(i),
    });
  }
  return out;
};

/**
 * Drive one case through the seed: reset the module table, feed the module
 * fetch loop when imports are in play, push the entry source, and run
 * `checkSrc` (@check tier) or `compileSrc` (@run/@trap tier — emit included).
 * Returns the rc, the structured diagnostics, and (rc 0 under compile) the
 * emitted bytes.
 */
const driveCase = (
  exp: Exports,
  entryKey: string,
  src: string,
  emit: boolean,
  isModule: boolean,
): { rc: number; diags: WasmDiag[]; bytes?: Uint8Array } => {
  exp.modReset();
  if (isModule || hasImports(src)) {
    const commit = (key: string, source: string | undefined) => {
      pushString(exp.modKeyPush, key);
      if (source !== undefined) pushString(exp.modSrcPush, source);
      exp.modCommit(source !== undefined ? 1 : 0);
    };
    commit(entryKey, src);
    for (;;) {
      const n = exp.modPendingCount();
      if (n === 0) break;
      // Snapshot the pending keys FIRST — committing mutates the set.
      const keys: string[] = [];
      for (let i = 0; i < n; i++) {
        keys.push(
          readString(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)),
        );
      }
      for (const key of keys) commit(key, readModuleSrc(key));
    }
  }
  exp.srcReset();
  pushString(exp.srcPush, src);
  const rc = emit ? exp.compileSrc() : exp.checkSrc();
  // rc 0 means no diagnostics (the Rust host reads them only on failure) —
  // and the instance is shared across cases, so don't trust `diagCount` on a
  // success: a stale emit failure could still be sitting in its store.
  const diags = rc === 0 ? [] : readDiags(exp);
  let bytes: Uint8Array | undefined;
  if (emit && rc === 0) {
    const n = exp.rbyteLen();
    bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = exp.rbyteAt(i);
  }
  if (emit && rc === 3) {
    // The emit-failure store resets only at `emitProgram`'s start, so a failed
    // emit would leak its message into every later case's diagnostics on this
    // shared instance; a minimal clean compile flushes it.
    exp.modReset();
    exp.srcReset();
    pushString(exp.srcPush, "print(1)\n");
    exp.compileSrc();
  }
  return { rc, diags, bytes };
};

const fmtDiags = (diags: WasmDiag[]): string =>
  JSON.stringify(diags.map((d) => `${d.line}:${d.col} ${d.message}`));

/** Substring matching with case and quote style (backtick vs apostrophe)
 * folded — wording parity is not pinned across the two compilers. */
const fold = (s: string): string => s.toLowerCase().replace(/`/g, "'");
const matches = (message: string, want: string): boolean =>
  fold(message).includes(fold(want));

/** A `line:col` trap substring asserts the source-map-located message; the
 * wasm pipeline has no source map, so only message-text substrings apply. */
const isTrapPosition = (want: string): boolean => /^:?\d+:\d+/.test(want);

const assertCase = async (
  d: Directives,
  r: { rc: number; diags: WasmDiag[]; bytes?: Uint8Array },
): Promise<void> => {
  if (d.unknown.length) {
    throw new Error(
      `unrecognized directive(s): ${d.unknown.map((k) => `@${k}`).join(", ")}`,
    );
  }

  for (const want of d.errors) {
    if (!r.diags.some((di) => matches(di.message, want))) {
      throw new Error(
        `expected an error containing "${want}", got: ${fmtDiags(r.diags)}`,
      );
    }
  }
  for (const want of d.errorsAt) {
    // Directive lines are 0-based (the TS diagnostic range convention);
    // `diagLine` is 1-based. LINE-only matching — see the header.
    const hit = r.diags.some((di) =>
      di.line - 1 === want.line && matches(di.message, want.text)
    );
    if (!hit) {
      throw new Error(
        `expected an error on line ${want.line} containing "${want.text}", ` +
          `got: ${fmtDiags(r.diags)}`,
      );
    }
  }

  // Strict by default: every wasm diagnostic must be declared by an
  // error-tier directive (the wasm compiler emits only errors).
  const extra = r.diags.filter((di) =>
    !d.errors.some((w) => matches(di.message, w)) &&
    !d.errorsAt.some((w) => matches(di.message, w.text))
  );
  if (extra.length) {
    throw new Error(
      `unexpected error(s) (declare with @error if intended): ${
        fmtDiags(extra)
      }`,
    );
  }

  if (d.mode === "run") {
    if (r.bytes === undefined) {
      throw new Error(
        `@run but compileSrc rc=${r.rc}; diagnostics: ${fmtDiags(r.diags)}`,
      );
    }
    if (d.trap.length) {
      let thrown: unknown;
      try {
        await runWasm(r.bytes);
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
        if (isTrapPosition(want)) continue;
        if (!matches(thrown.message, want)) {
          throw new Error(
            `@trap message mismatch\n  expected to contain: ${
              JSON.stringify(want)
            }\n  actual:              ${JSON.stringify(thrown.message)}`,
          );
        }
      }
    } else {
      const { logs } = await runWasm(r.bytes);
      if (JSON.stringify(logs) !== JSON.stringify(d.logs)) {
        throw new Error(
          `log mismatch\n  expected: ${JSON.stringify(d.logs)}\n` +
            `  actual:   ${JSON.stringify(logs)}`,
        );
      }
    }
  }
};

// ── Lint tier (the .vl lint pass, via the driver's `lintSrc`) ──────────────────
type LintDiag = { sev: string; line: number; col: number; msg: string };

/** Run the self-hosted lint pass over `src` and read its diagnostics. */
const driveLint = (exp: Exports, src: string): LintDiag[] => {
  exp.modReset();
  exp.srcReset();
  pushString(exp.srcPush, src);
  const n = exp.lintSrc();
  const out: LintDiag[] = [];
  if (n < 0) return out; // a lex/parse error — lint needs a valid AST
  for (let i = 0; i < n; i++) {
    out.push({
      sev: readString(exp.lintSevLen(i), (j) => exp.lintSevByte(i, j)),
      line: exp.lintLineAt(i),
      col: exp.lintColAt(i),
      msg: readString(exp.lintMsgLen(i), (j) => exp.lintMsgByte(i, j)),
    });
  }
  return out;
};

/**
 * Adjudicate the lint directives (@warning/@info/@hint) against the lint diags,
 * per severity, strict-by-default (every declared directive matches a diag, and
 * every diag is declared). Message matching folds case/quote style like the
 * error tier.
 */
const assertLint = (d: Directives, lints: LintDiag[]): void => {
  const bySev = (s: string): string[] =>
    lints.filter((l) => l.sev === s).map((l) => l.msg);
  const wants: [string[], string, string][] = [
    [d.warnings, "warning", "@warning"],
    [d.infos, "info", "@info"],
    [d.hints, "hint", "@hint"],
  ];
  for (const [decls, sev, directive] of wants) {
    const actual = bySev(sev);
    for (const want of decls) {
      if (!actual.some((m) => matches(m, want))) {
        throw new Error(
          `expected a ${sev} (${directive}) containing "${want}", got: ${
            JSON.stringify(actual)
          }`,
        );
      }
    }
    const extra = actual.filter((m) => !decls.some((w) => matches(m, w)));
    if (extra.length) {
      throw new Error(
        `unexpected ${sev}(s) (declare with ${directive} if intended): ${
          JSON.stringify(extra)
        }`,
      );
    }
  }
};

const cases: Case[] = [...walk(CASES_DIR)];
const caseName = (c: Case): string =>
  (c.kind === "single" ? c.url.href : c.dir.href).slice(CASES_DIR.href.length);
cases.sort((a, b) => caseName(a).localeCompare(caseName(b)));

const seen = new Set<string>();
for (const c of cases) {
  const name = caseName(c);
  seen.add(name);
  const srcUrl = c.kind === "single" ? c.url : c.entry;
  const src = Deno.readTextFileSync(srcUrl);
  const d = parseDirectives(src);

  const skip = !seedExists
    ? "no seed — bash scripts/refresh-compiler.sh"
    : d.skip !== null
    ? d.skip
    : EXPECTED_DIVERGENCES[name];

  Deno.test({
    name,
    ignore: skip !== undefined && skip !== null,
    fn: async () => {
      const entryKey = (c.kind === "single" ? c.url : c.entry).pathname;
      const r = driveCase(
        exports!,
        entryKey,
        src,
        d.mode === "run",
        c.kind === "module",
      );
      await assertCase(d, r);
      // The lint tier (.vl lint pass) — adjudicated on SINGLE-FILE cases that
      // type-check cleanly (no `@error`/`@error-at`). Lint is a quality pass over
      // WELL-FORMED code; on an erroring program the native lint over-reports
      // (e.g. "unused variable" on a redeclared/ill-typed binding) relative to the
      // TS host, which doesn't lint a failed compile — so error cases skip the
      // lint tier here (module-graph lint is a later slice too).
      if (
        c.kind === "single" && d.errors.length === 0 && d.errorsAt.length === 0
      ) {
        assertLint(d, driveLint(exports!, src));
      }
    },
  });
}

// Stale-entry tripwire: every expected-divergence key must still name a
// discovered case, so a renamed/deleted corpus file surfaces here instead of
// silently skipping nothing.
Deno.test("EXPECTED_DIVERGENCES entries name existing cases", () => {
  const stale = Object.keys(EXPECTED_DIVERGENCES).filter((k) => !seen.has(k));
  if (stale.length) {
    throw new Error(`stale EXPECTED_DIVERGENCES entries: ${stale.join(", ")}`);
  }
});
