// ROADMAP row 10 — Organize Imports dropped an UNUSED specifier but not a DUPLICATE one.
//
// The rewrite (`organizeImportEdits`) never knew the difference: it takes the ranges of the
// specifiers to drop, and `server.ts` filtered the lint stream on the `unused-import` code
// ALONE. The `duplicate-import` lint already existed and is anchored at the second
// occurrence's imported-name token — its own comment says "so the LSP's remove-import
// quick-fix applies unchanged" — so the fix is the filter, and this file is what says the
// filter is the whole of it.
//
// `server.ts` cannot be imported under Deno (it opens an LSP connection at module load), so
// the two filters are exercised against the same lint stream the handler reads, through the
// same helper it calls. The playground adapter has NO organize-imports path at all
// (`organizeImports`: server 1 use, adapter 0) — that gap is a `subBehaviours` row in
// `playground_lsp_parity_test.ts`, not something this file can grade.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { organizeImportEdits } from "../lsp/src/typeFeatures.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;

// The filter `server.ts` applies, named once so the test and the handler cannot drift.
const REDUNDANT = ["unused-import", "duplicate-import"];

const organize = (src: string, codes: string[]) => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const ranges = checker.lint(src)
    .filter((d) => codes.includes(d.code ?? ""))
    .map((d) => d.range);
  return organizeImportEdits(src, ranges, (stmt) => checker.formatSrc?.(stmt));
};

const applied = (src: string, codes: string[]): string => {
  const edits = organizeImportEdits === undefined ? [] : organize(src, codes);
  // One statement per line here, and the rewrite is per-statement, so applying in reverse
  // line order is enough to compose them.
  const lines = src.split("\n");
  for (const e of [...edits].sort((a, b) => b.range.start.line - a.range.start.line)) {
    const l = e.range.start.line;
    if (e.newText === "") lines.splice(l, 1);
    else lines[l] = e.newText;
  }
  return lines.join("\n");
};

const DUP = [
  'import { trim, trim } from "std:str"',
  'import { join } from "std:str"',
  'print(trim("  x  ") + join(["a"], ","))',
  "",
].join("\n");

Deno.test({ name: "organize imports: the duplicate specifier is what the lint reports", ignore }, () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const codes = checker.lint(DUP).map((d) => d.code);
  if (!codes.includes("duplicate-import")) {
    throw new Error(`want a duplicate-import lint, got ${JSON.stringify(codes)}`);
  }
  // Nothing here is UNUSED — both names are called — so the old filter had nothing to act
  // on, which is exactly why the gap was invisible to a test that only tried unused ones.
  if (codes.includes("unused-import")) {
    throw new Error(`the fixture must not also be unused: ${JSON.stringify(codes)}`);
  }
});

Deno.test({ name: "organize imports: the OLD unused-only filter produced no edit at all", ignore }, () => {
  const edits = organize(DUP, ["unused-import"]);
  if (edits.length !== 0) {
    throw new Error(`want no edits from the old filter, got ${JSON.stringify(edits)}`);
  }
});

Deno.test({ name: "organize imports: a duplicate specifier is dropped, the survivor kept", ignore }, () => {
  const out = applied(DUP, REDUNDANT);
  const want = [
    'import { trim } from "std:str"',
    'import { join } from "std:str"',
    'print(trim("  x  ") + join(["a"], ","))',
    "",
  ].join("\n");
  if (out !== want) throw new Error(`got:\n${out}\nwant:\n${want}`);
});

// A statement that loses EVERY specifier loses its line whole, rather than becoming
// `import { }`. The widened filter must not change that.
Deno.test({ name: "organize imports: a statement that loses every specifier loses its line", ignore }, () => {
  const src = [
    'import { trim, join } from "std:str"',
    "print(1)",
    "",
  ].join("\n");
  const out = applied(src, REDUNDANT);
  if (out !== "print(1)\n") throw new Error(`got ${JSON.stringify(out)}`);
});

// Both codes can name the SAME token. In `{ trim, trim }` with `trim` never called, the two
// lints fire at one identical range — the second occurrence — so a single organize drops that
// specifier and leaves a survivor that is itself unused. Re-running converges (pass 2 removes
// the line, pass 3 is stable); the rewrite is not asked to reach the fixpoint in one edit.
Deno.test({ name: "organize imports: both codes on one token drop one specifier per pass", ignore }, () => {
  const src = ['import { trim, trim } from "std:str"', "print(1)", ""].join("\n");
  const checker = loadWasmChecker(SEED, () => {})!;
  const hits = checker.lint(src).filter((d) => REDUNDANT.includes(d.code ?? ""));
  const codes = hits.map((d) => d.code).sort();
  if (JSON.stringify(codes) !== JSON.stringify(["duplicate-import", "unused-import"])) {
    throw new Error(`want both redundant lints, got ${JSON.stringify(codes)}`);
  }
  const ranges = hits.map((d) => JSON.stringify(d.range));
  if (ranges[0] !== ranges[1]) {
    throw new Error(`want one shared range, got ${JSON.stringify(ranges)}`);
  }
  const once = applied(src, REDUNDANT);
  if (once !== 'import { trim } from "std:str"\nprint(1)\n') {
    throw new Error(`pass 1 got ${JSON.stringify(once)}`);
  }
  const twice = applied(once, REDUNDANT);
  if (twice !== "print(1)\n") throw new Error(`pass 2 got ${JSON.stringify(twice)}`);
  if (applied(twice, REDUNDANT) !== twice) throw new Error("pass 3 was not a fixpoint");
});

// ROADMAP row 10 asked for one thing to be checked BEFORE the filter widened: the rewrite
// over two identical ranges in different statements, "the unused case never produces two
// edits that delete the same text". Measured, that case does not arise — the lint anchors
// each duplicate at its OWN occurrence, so two statements yield two distinct ranges. The
// three shapes below are what the row was worried about, and all three are already correct.
Deno.test({ name: "organize imports: a duplicate across two statements deletes the second line", ignore }, () => {
  const src = [
    'import { trim } from "std:str"',
    'import { trim } from "std:str"',
    'print(trim(" x "))',
    "",
  ].join("\n");
  const want = ['import { trim } from "std:str"', 'print(trim(" x "))', ""].join("\n");
  const out = applied(src, REDUNDANT);
  if (out !== want) throw new Error(`got:\n${out}\nwant:\n${want}`);
});

// Two edits in one organize, and they must not overlap: the survivor statement is re-sorted
// in place while the duplicate's line is deleted whole.
Deno.test({ name: "organize imports: the survivor is fmt-sorted while the duplicate line goes", ignore }, () => {
  const src = [
    'import { trim, join } from "std:str"',
    'import { trim } from "std:str"',
    'print(trim(" x ") + join(["a"], ","))',
    "",
  ].join("\n");
  const edits = organize(src, REDUNDANT);
  if (edits.length !== 2) throw new Error(`want 2 edits, got ${JSON.stringify(edits)}`);
  const want = [
    'import { join, trim } from "std:str"',
    'print(trim(" x ") + join(["a"], ","))',
    "",
  ].join("\n");
  const out = applied(src, REDUNDANT);
  if (out !== want) throw new Error(`got:\n${out}\nwant:\n${want}`);
});

// Three occurrences are two duplicate lints and still ONE edit — the rewrite rebuilds the
// statement from its survivors rather than deleting per range, so it does not matter that
// two of the ranges fall inside the text a single edit replaces.
Deno.test({ name: "organize imports: three occurrences collapse to one specifier", ignore }, () => {
  const src = ['import { trim, trim, trim } from "std:str"', 'print(trim(" x "))', ""].join("\n");
  const checker = loadWasmChecker(SEED, () => {})!;
  const dups = checker.lint(src).filter((d) => d.code === "duplicate-import");
  if (dups.length !== 2) throw new Error(`want 2 duplicate lints, got ${dups.length}`);
  const edits = organize(src, REDUNDANT);
  if (edits.length !== 1) throw new Error(`want 1 edit, got ${JSON.stringify(edits)}`);
  const want = ['import { trim } from "std:str"', 'print(trim(" x "))', ""].join("\n");
  const out = applied(src, REDUNDANT);
  if (out !== want) throw new Error(`got:\n${out}\nwant:\n${want}`);
});

// The unused half must keep working — the filter widened, it did not move.
Deno.test({ name: "organize imports: an unused specifier is still dropped", ignore }, () => {
  const src = [
    'import { trim, join } from "std:str"',
    'print(trim("  x  "))',
    "",
  ].join("\n");
  const out = applied(src, REDUNDANT);
  const want = ['import { trim } from "std:str"', 'print(trim("  x  "))', ""].join("\n");
  if (out !== want) throw new Error(`got:\n${out}\nwant:\n${want}`);
});

// An already-organized file yields NO action: an empty organize on every save is noise, and
// the widened filter must not invent one.
Deno.test({ name: "organize imports: a clean file yields no edits", ignore }, () => {
  const src = ['import { trim } from "std:str"', 'print(trim("  x  "))', ""].join("\n");
  const edits = organize(src, REDUNDANT);
  if (edits.length !== 0) throw new Error(`want no edits, got ${JSON.stringify(edits)}`);
});

// The filter the handler applies is the one this file tests. `server.ts` cannot be imported
// here, so the coupling is checked by reading its source — the same technique
// `playground_lsp_parity_test.ts` uses.
Deno.test("organize imports: server.ts filters on both redundant codes", () => {
  const src = Deno.readTextFileSync(new URL("../lsp/src/server.ts", import.meta.url));
  for (const code of REDUNDANT) {
    if (!src.includes(`d.code === "${code}"`)) {
      throw new Error(
        `server.ts's organize-imports filter no longer names "${code}" — the handler and ` +
          `this file's REDUNDANT list have drifted.`,
      );
    }
  }
});
