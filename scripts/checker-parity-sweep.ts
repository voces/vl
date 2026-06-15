// Checker-parity sweep — the BATCH form of the LSP's `vital.checker: "both"`
// instrument: run the TS checker and the wasm (self-hosted) checker over every
// single-file corpus case and diff them STRUCTURALLY (error counts +
// positions; message wording is not compared — REJECT parity pins verdicts,
// not text). The editor instrument catches organic mid-edit states; this
// sweep covers the whole corpus systematically, plus a `--torn` mode that
// synthesizes mid-keystroke states by truncating each file at several
// offsets (the recovery-quality probe).
//
// Buckets land in /tmp/checker-parity.txt; exit 0 always (an instrument, not
// a gate — divergences are burn-down items, not regressions, until span
// parity is chartered).
//
// Usage: deno run -A scripts/checker-parity-sweep.ts [--torn]
// Prereqs: a fresh seed (`bash scripts/refresh-compiler.sh`).

import { checkOnly } from "../compiler/compile.ts";
import { diffDiagnostics, loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const root = new URL("..", import.meta.url).pathname;
const seed = `${root}build/vl-compiler.wasm`;
const torn = Deno.args.includes("--torn");

const checker = loadWasmChecker(seed, () => {});
if (!checker) {
  console.error(`no seed at ${seed} — run: bash scripts/refresh-compiler.sh`);
  Deno.exit(1);
}

// Single-file cases only: a module-case sibling (a dir containing entry.vl)
// checks as a fragment on both sides, but the TS path here is the
// single-file checkOnly — module graphs are out of scope for this sweep.
const files: string[] = [];
const walk = (dir: string) => {
  const entries = [...Deno.readDirSync(dir)];
  if (entries.some((e) => e.name === "entry.vl")) return;
  for (const e of entries) {
    if (e.isDirectory) walk(`${dir}/${e.name}`);
    else if (e.name.endsWith(".vl")) files.push(`${dir}/${e.name}`);
  }
};
walk(`${root}tests/cases`);
files.sort();

const noSiblings = () => undefined;
let agreeClean = 0;
let agreeErrors = 0;
const divergences: string[] = [];
const crashes: string[] = [];

for (const f of files) {
  const src = Deno.readTextFileSync(f);
  const rel = f.slice(root.length);

  const variants: Array<[string, string]> = [["", src]];
  if (torn) {
    // Five mid-file truncations approximate in-flight keystrokes; cutting at
    // arbitrary byte offsets (not line boundaries) lands mid-token on purpose.
    for (let i = 1; i <= 5; i++) {
      const cut = Math.floor((src.length * i) / 6);
      variants.push([`@cut${cut}`, src.slice(0, cut)]);
    }
  }

  for (const [tag, text] of variants) {
    let tsErrs;
    try {
      tsErrs = checkOnly(text).diagnostics.filter((d) => d.severity === "error");
    } catch (err) {
      crashes.push(`${rel}${tag}: TS checker threw: ${err}`);
      continue;
    }
    let wasmErrs;
    try {
      wasmErrs = await checker.check(text, f, noSiblings);
    } catch (err) {
      crashes.push(`${rel}${tag}: wasm checker threw: ${err}`);
      continue;
    }
    const diff = diffDiagnostics(tsErrs, wasmErrs);
    if (diff === undefined) {
      if (tsErrs.length === 0) agreeClean++;
      else agreeErrors++;
    } else {
      divergences.push(`${rel}${tag}\n${diff}`);
    }
  }
}

const report = [
  `files: ${files.length}${torn ? " (x6 variants: whole + 5 truncations)" : ""}`,
  `agree-clean: ${agreeClean}`,
  `agree-with-errors: ${agreeErrors}`,
  `divergences: ${divergences.length}`,
  `crashes: ${crashes.length}`,
  "",
  ...crashes,
  "",
  ...divergences,
].join("\n");
Deno.writeTextFileSync("/tmp/checker-parity.txt", report);
console.log(report.split("\n").slice(0, 5).join("\n"));
console.log(`full report: /tmp/checker-parity.txt`);
