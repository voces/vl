// Organize imports (LSP `source.organizeImports`, D9): per-STATEMENT rewrite
// aligned with `vl fmt`'s canon — unused specifiers (from the lint tier)
// dropped, survivors fmt-sorted, a specifier-less statement's line deleted
// whole; statements are never merged or reordered (fmt preserves statement
// order). Pure-helper tests for `organizeImportEdits`
// (`lsp/src/typeFeatures.ts`) plus seed-backed checks with the REAL lint and
// the REAL formatter spelling.
//
// The load-bearing invariant is IDEMPOTENCE: a clean (canonical, no-unused)
// file yields NO edits, so `editor.codeActionsOnSave` is byte-stable and the
// server offers no action rather than an empty one.
//
// Run: deno test -A --no-check tests/lsp_organize_imports_test.ts

import { organizeImportEdits } from "../lsp/src/typeFeatures.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition; end: LspPosition };
type Edit = { range: LspRange; newText: string };

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

/** 0-based LSP position → char offset (test-local mirror of the helper's). */
const posToOffset = (source: string, pos: LspPosition): number => {
  const lines = source.split("\n");
  let offset = 0;
  for (let i = 0; i < pos.line; i++) offset += lines[i].length + 1;
  return offset + pos.character;
};

/** Apply LSP edits to `source` (disjoint by contract; applied back-to-front). */
const applyEdits = (source: string, edits: Edit[]): string => {
  const resolved = edits
    .map((e) => ({
      start: posToOffset(source, e.range.start),
      end: posToOffset(source, e.range.end),
      newText: e.newText,
    }))
    .sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of resolved) {
    out = out.slice(0, e.start) + e.newText + out.slice(e.end);
  }
  return out;
};

/**
 * The range of the first occurrence of `needle` on line `line` of `src` — the
 * shape the `unused-import` lint reports (start inside the flagged specifier).
 */
const rangeAt = (src: string, line: number, needle: string): LspRange => {
  const text = src.split("\n")[line];
  const col = text.indexOf(needle);
  if (col < 0) throw new Error(`needle ${needle} not on line ${line}: ${text}`);
  return {
    start: { line, character: col },
    end: { line, character: col + needle.length },
  };
};

// ---- pure: dropping unused specifiers ----------------------------------------

Deno.test("organize: multiple unused in ONE statement fold into one edit, survivors sorted", () => {
  const src = 'import { zeta, alpha, mid } from "std:x"\n\nprint(mid)\n';
  const edits = organizeImportEdits(src, [
    rangeAt(src, 0, "zeta"),
    rangeAt(src, 0, "alpha"),
  ]);
  assert(edits.length === 1, `one edit per statement; got ${edits.length}`);
  assert(
    edits[0].newText === 'import { mid } from "std:x"',
    `survivors only; got ${JSON.stringify(edits[0].newText)}`,
  );
  assert(
    edits[0].range.start.line === 0 && edits[0].range.start.character === 0 &&
      edits[0].range.end.character === src.split("\n")[0].length,
    `edit spans the whole statement; got ${JSON.stringify(edits[0].range)}`,
  );
});

Deno.test("organize: all specifiers unused deletes the whole line, trailing newline included", () => {
  const src = 'import { gone } from "std:x"\nprint(1)\n';
  const edits = organizeImportEdits(src, [rangeAt(src, 0, "gone")]);
  assert(edits.length === 1, `one edit; got ${edits.length}`);
  assert(edits[0].newText === "", "a deletion");
  assert(
    edits[0].range.start.line === 0 && edits[0].range.start.character === 0 &&
      edits[0].range.end.line === 1 && edits[0].range.end.character === 0,
    `line 0 col 0 → line 1 col 0 (no blank residue); got ${
      JSON.stringify(edits[0].range)
    }`,
  );
  assert(
    applyEdits(src, edits) === "print(1)\n",
    `applied result; got ${JSON.stringify(applyEdits(src, edits))}`,
  );
});

Deno.test("organize: a fully-unused statement on the LAST line (no trailing newline) deletes to EOF", () => {
  const src = 'print(1)\nimport { gone } from "std:x"';
  const edits = organizeImportEdits(src, [rangeAt(src, 1, "gone")]);
  assert(edits.length === 1, `one edit; got ${edits.length}`);
  assert(
    applyEdits(src, edits) === "print(1)\n",
    `applied result; got ${JSON.stringify(applyEdits(src, edits))}`,
  );
});

Deno.test("organize: an unused `x as y` alias drops the WHOLE alias clause", () => {
  const src = 'import { pad as padded, trim } from "std:x"\n\nprint(trim)\n';
  // The real lint's range starts at the SOURCE name (`pad`) — see the
  // seed-backed test below — but either half sits inside the specifier span,
  // so both spellings of the diagnostic must drop `pad as padded` whole.
  for (const needle of ["pad", "padded"]) {
    const edits = organizeImportEdits(src, [rangeAt(src, 0, needle)]);
    assert(edits.length === 1, `${needle}: one edit; got ${edits.length}`);
    assert(
      edits[0].newText === 'import { trim } from "std:x"',
      `${needle}: whole alias clause dropped; got ${
        JSON.stringify(edits[0].newText)
      }`,
    );
  }
});

Deno.test("organize: a multi-line statement is replaced whole by the single-line canonical form", () => {
  const src = 'import {\n  unusedB,\n  keepA,\n} from "std:x"\nprint(keepA)\n';
  const edits = organizeImportEdits(src, [rangeAt(src, 1, "unusedB")]);
  assert(edits.length === 1, `one edit; got ${edits.length}`);
  assert(
    edits[0].newText === 'import { keepA } from "std:x"',
    `canonical single line; got ${JSON.stringify(edits[0].newText)}`,
  );
  assert(
    edits[0].range.start.line === 0 && edits[0].range.end.line === 3,
    `spans the whole multi-line statement; got ${JSON.stringify(edits[0].range)}`,
  );
  assert(
    applyEdits(src, edits) ===
      'import { keepA } from "std:x"\nprint(keepA)\n',
    `applied; got ${JSON.stringify(applyEdits(src, edits))}`,
  );
});

Deno.test("organize: statements are rewritten in place — never merged or reordered", () => {
  const src = 'import { unusedB, keep } from "std:b"\nimport { also } from "std:a"\n\nprint(keep + also)\n';
  const edits = organizeImportEdits(src, [rangeAt(src, 0, "unusedB")]);
  // Only the statement with an unused specifier changes; std:a's canonical
  // statement stays untouched even though "std:a" < "std:b".
  assert(edits.length === 1, `one edit; got ${edits.length}`);
  assert(
    applyEdits(src, edits) ===
      'import { keep } from "std:b"\nimport { also } from "std:a"\n\nprint(keep + also)\n',
    `in-place rewrite; got ${JSON.stringify(applyEdits(src, edits))}`,
  );
});

// ---- pure: canonicalizing a misspelled statement -----------------------------

Deno.test("organize: a misspelled statement (unsorted / odd whitespace) is canonicalized with NO unused", () => {
  const src = 'import {zeta,  alpha} from "std:x"\n\nprint(zeta + alpha)\n';
  const edits = organizeImportEdits(src, []);
  assert(edits.length === 1, `one edit; got ${edits.length}`);
  assert(
    edits[0].newText === 'import { alpha, zeta } from "std:x"',
    `sorted + respaced; got ${JSON.stringify(edits[0].newText)}`,
  );
});

Deno.test("organize: the formatter spells the rewritten statement when supplied", () => {
  const src = 'import { b, a } from "std:x"\n\nprint(a + b)\n';
  const seen: string[] = [];
  const edits = organizeImportEdits(src, [], (stmt) => {
    seen.push(stmt);
    return 'import { a, b } from "std:x"\n';
  });
  assert(edits.length === 1, `one edit; got ${edits.length}`);
  assert(
    edits[0].newText === 'import { a, b } from "std:x"',
    `formatter output (trimmed) wins; got ${JSON.stringify(edits[0].newText)}`,
  );
  // The reconstruction hands the formatter the DECLARED order — sorting is
  // the formatter's job (mirrors `importInsertionEdit`).
  assert(
    seen.length === 1 && seen[0] === 'import { b, a } from "std:x"\n',
    `formatter sees the reconstructed statement; got ${JSON.stringify(seen)}`,
  );
});

// ---- pure: idempotence / the no-op contract ----------------------------------

Deno.test("organize: a clean file yields NO edits (on-save no-op)", () => {
  const src = 'import { a, b } from "std:x"\nimport { c } from "std:y"\n\nprint(a + b + c)\n';
  const edits = organizeImportEdits(src, []);
  assert(
    edits.length === 0,
    `no edits on a canonical file; got ${JSON.stringify(edits)}`,
  );
});

Deno.test("organize: applying the edits then re-organizing yields NO edits (idempotent)", () => {
  const src = 'import { zeta, alpha, unusedQ } from "std:x"\nimport {\n  m,\n} from "std:y"\n\nprint(alpha + zeta + m)\n';
  const first = organizeImportEdits(src, [rangeAt(src, 0, "unusedQ")]);
  assert(first.length === 2, `both statements rewritten; got ${first.length}`);
  const organized = applyEdits(src, first);
  assert(
    organized ===
      'import { alpha, zeta } from "std:x"\nimport { m } from "std:y"\n\nprint(alpha + zeta + m)\n',
    `organized text; got ${JSON.stringify(organized)}`,
  );
  const second = organizeImportEdits(organized, []);
  assert(
    second.length === 0,
    `second pass must be a no-op; got ${JSON.stringify(second)}`,
  );
});

Deno.test("organize: side-effect and empty-brace imports are never touched", () => {
  const src = 'import "std:polyfill"\nimport {} from "std:x"\n\nprint(1)\n';
  const edits = organizeImportEdits(src, []);
  assert(
    edits.length === 0,
    `nothing to organize; got ${JSON.stringify(edits)}`,
  );
});

// ---- seed-backed: the real lint + the real formatter -------------------------

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

Deno.test({
  name: "organize (seed): real lint feeds the rewrite, real formatter spells it, and it is idempotent",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const formatImport = (stmt: string) => checker.formatSrc?.(stmt);
  const organize = (text: string) =>
    organizeImportEdits(
      text,
      checker.lint(text)
        .filter((d) => d.code === "unused-import")
        .map((d) => d.range),
      formatImport,
    );

  // `expect` (plain) and `padded` (the local of `pad as padded`) are unused;
  // the second statement's survivors also need re-sorting.
  const src = 'import { expect, it } from "std:test"\nimport { trim, pad as padded } from "std:str"\n\nit("x", () => {\n  print(trim(" a "))\n})\n';
  const edits = organize(src);
  assert(edits.length === 2, `one edit per statement; got ${edits.length}`);
  const organized = applyEdits(src, edits);
  const want = 'import { it } from "std:test"\nimport { trim } from "std:str"\n\nit("x", () => {\n  print(trim(" a "))\n})\n';
  if (organized !== want) {
    throw new Error(
      `organized text:\nwant ${JSON.stringify(want)}\ngot  ${
        JSON.stringify(organized)
      }`,
    );
  }
  // Idempotence against the REAL lint + formatter: a second pass is a no-op.
  const second = organize(organized);
  assert(
    second.length === 0,
    `second pass must be a no-op; got ${JSON.stringify(second)}`,
  );
  // And the organized file is fmt-stable — organize never fights `vl fmt`.
  const formatted = checker.formatSrc?.(organized);
  assert(
    formatted === organized,
    `fmt-stable; fmt says ${JSON.stringify(formatted)}`,
  );
});

Deno.test({
  name: "organize (seed): a fully-unused statement's line is deleted whole",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const src = 'import { expect } from "std:test"\nimport { trim } from "std:str"\n\nprint(trim(" a "))\n';
  const edits = organizeImportEdits(
    src,
    checker.lint(src)
      .filter((d) => d.code === "unused-import")
      .map((d) => d.range),
    (stmt) => checker.formatSrc?.(stmt),
  );
  assert(edits.length === 1, `one deletion; got ${JSON.stringify(edits)}`);
  const organized = applyEdits(src, edits);
  const want = 'import { trim } from "std:str"\n\nprint(trim(" a "))\n';
  if (organized !== want) {
    throw new Error(
      `deleted whole line:\nwant ${JSON.stringify(want)}\ngot  ${
        JSON.stringify(organized)
      }`,
    );
  }
});
