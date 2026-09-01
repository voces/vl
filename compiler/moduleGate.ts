// THE MODULE-ARMING GATE, in TypeScript — the ONE copy the TS side has.
//
// The question: "does this source need the MODULE FETCH LOOP?" Every host that
// drives the compiler seed answers it from a cheap textual scan of the entry
// source, BEFORE any lexing happens, because the loop has to be armed before the
// program is staged. A host that answers `false` where the compiler would answer
// `true` leaves the guest asking for a module nobody will fetch — and the symptom
// is SILENCE, not an error: the diagnostic the CLI prints simply never appears.
//
// THE PREDICATE THEREFORE EXISTS FOUR TIMES, IN THREE LANGUAGES, and the four have
// to agree:
//
//   1. `compiler/cli_util.vl`      `cliLineIsImport` → `cliHasImports` → `cliNeedsModules`
//   2. `scripts/vl-host/src/main.rs`  the inline gate in `stage_program` (~:1510)
//   3. THIS FILE                   imported by `lsp/src/wasmChecker.ts` (the VS Code
//                                  LSP *and* the browser playground, which bundles
//                                  the same checker) …
//   4. …and by `tests/cases_wasm_test.ts` (the corpus oracle's harness)
//
// 3 and 4 used to be two hand-maintained copies. They are one module now: the two
// consumers live in different BUNDLES but the same Deno module graph, so sharing
// costs an import and nothing else. 1 and 2 cannot import this file, so they stay
// MIRRORED — and `tests/module_gate_agreement_test.ts` is the guard that makes the
// mirroring checkable: it extracts each copy's arm set from its own source and
// requires all three to agree with {@link MODULE_LINE_KEYWORDS}, plus grades this
// implementation against a behavioural table the native and LSP suites re-run.
//
// WHY THE GUARD EXISTS: #2182 gave the CLI and the Rust host the `export { … }
// from "…"` arm and the two TS copies did not follow, under a comment that still
// claimed the gate was a line-leading `import {` and nothing else. (The agreement
// test refuses that exact sentence anywhere in the tree, so it is paraphrased
// here rather than quoted.) Measured on `export { helper } from "./nope"` +
// `print(1)`:
//
//     LSP  (checker.check):  0 diagnostic(s)
//     CLI  (vl check):       [ERROR]: Cannot resolve import "./nope" (…)
//
// A stale comment is not a guard. This file plus that test is what replaces it.
//
// LEAF MODULE, deliberately: it imports nothing and carries no runtime, so the
// corpus oracle keeps its "no dependency on the TS front end" property and the
// browser bundle pays a few hundred bytes.

/**
 * The line-leading keywords that make a line a MODULE DEPENDENCY.
 *
 * `import { … } from "…"` and the RE-EXPORT `export { … } from "…"` both pull
 * another module, so both must arm the fetch loop. A bare `export function f()`
 * is NOT one — the `{` test is what separates them, and it is why this is a
 * two-token scan rather than a `startsWith` on the keyword alone.
 *
 * Exported so the agreement test can compare this set against the arm sets it
 * extracts from `compiler/cli_util.vl` and `scripts/vl-host/src/main.rs`.
 */
export const MODULE_LINE_KEYWORDS: readonly string[] = ["import", "export"];

/**
 * True when `line` begins (after leading whitespace) with `kw` followed — after
 * more optional whitespace — by `{`. The VL twin is `cliLineStartsKwBrace`.
 */
const lineStartsKwBrace = (line: string, kw: string): boolean => {
  const t = line.trimStart();
  if (!t.startsWith(kw)) return false;
  return t.slice(kw.length).trimStart().startsWith("{");
};

/** True when `line` is a module-dependency line (`import {` or a re-export `export {`). */
export const lineIsImport = (line: string): boolean =>
  MODULE_LINE_KEYWORDS.some((kw) => lineStartsKwBrace(line, kw));

/** True when any line of `source` is a module-dependency line. */
export const hasImports = (source: string): boolean =>
  source.split("\n").some(lineIsImport);

/**
 * True when `source` holds an INTERPOLATION HOLE `\{…}` — in EITHER quoted form,
 * a `"…"` string or a `` `…` `` template. The second construct that arms the
 * module fetch loop, because a hole desugars to a call into `std:fmt`, and
 * `std:fmt` reaches the compiler only through the loop.
 *
 * The name undersells it (it predates plain-string interpolation) and is kept
 * because it is mirrored character for character in three languages under a guard
 * that anchors on the declaration. This doc comment is the contract.
 *
 * A REAL SCAN, not a bare backtick test: a backtick in a `//` comment is ordinary
 * (2,409 corpus files carry one) and must not move a program off the single-source
 * path. Comments are skipped; a hole-less plain literal of either form needs no
 * renderer and does not arm the loop. The `\{` test lives INSIDE the literal
 * scans — `\{` in code is not lexable at all, and `\\{` inside a literal is an
 * escaped backslash then an ordinary brace, so the backslash arm must look at the
 * next character before deciding. A char literal never arms: `'\{'` could not hold
 * a hole. Kept identical to `cliHasTplHole` (`compiler/cli_util.vl`) and
 * `has_template_hole` (`scripts/vl-host/src/main.rs`).
 */
export const hasTemplateHole = (source: string): boolean => {
  const n = source.length;
  let i = 0;
  while (i < n) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
    } else if (c === '"' || c === "'") {
      const holes = c === '"';
      i++;
      while (i < n && source[i] !== c) {
        if (source[i] === "\\") {
          if (holes && source[i + 1] === "{") return true;
          i++;
        }
        i++;
      }
      i++;
    } else if (c === "`") {
      i++;
      while (i < n && source[i] !== "`") {
        if (source[i] === "\\") {
          if (source[i + 1] === "{") return true;
          i++;
        }
        i++;
      }
      i++;
    } else {
      i++;
    }
  }
  return false;
};

/**
 * The module pipeline's arming test: a module-dependency line, or a template
 * hole. The TS twin of `cliNeedsModules` (`compiler/cli_util.vl`) and of the
 * `has_imports || has_template_hole` expression in `stage_program`.
 */
export const needsModules = (source: string): boolean =>
  hasImports(source) || hasTemplateHole(source);
