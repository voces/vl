// Unit test for the unused-import lint diagnostic RANGE (B17 fix).
//
// The unused-variable lint for an imported name (`import { a } from "./m"`)
// must highlight the imported NAME (`a` or the `as`-target `y` in `{ x as y
// }`), NOT the `import` keyword. The parser now records each specifier's LOCAL
// identifier token span and passes it to `declareBinding` instead of the
// keyword span.
//
// Driven through `checkDocument` (the graph-aware front end from
// `lsp/src/moduleGraph.ts`) so the resolver pre-seeds the parse scope with the
// imported names' types — without that seed the import binding is never
// declared and the lint has nothing to squiggle. An in-memory `ModuleReader`
// avoids any filesystem access.
//
// Run with: deno test -A --no-check tests/lint_import_range_test.ts

import type { ModuleReader } from "../compiler/modules.ts";
import { checkDocument } from "../lsp/src/moduleGraph.ts";
import type { VLDiagnostic } from "../compiler/compile.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

/** In-memory reader: key → source text. Keys are plain filesystem paths. */
const memReader = (files: Record<string, string>): ModuleReader =>
  (key: string) => files[key];

const unusedDiag = (diags: VLDiagnostic[]): VLDiagnostic | undefined =>
  diags.find((d) => d.code === "unused-variable");

// ---- (1) plain `import { a }` — squiggle on `a`, not `import` ---------------

Deno.test(
  "unused-import range lands on the imported name, not the `import` keyword",
  async () => {
    // `import { add } from "./util"`  ← `add` is at col 9 on line 0 (0-based).
    // col 0: `i`, col 6: `{`, col 8: ` `, col 9: `a`…`d`, col 13: ` `…
    //  0         1
    //  0123456789012345678
    // `import { add } from "./util"`
    const files = {
      "/proj/util.vl": "export function add(a: i32, b: i32) {\n  return a + b\n}\n",
      "/proj/main.vl": 'import { add } from "./util"\n\nlet x = 1\nprint(x)\n',
    };
    const { diagnostics } = await checkDocument(
      files["/proj/main.vl"],
      "/proj/main.vl",
      memReader(files),
    );
    const d = unusedDiag(diagnostics);
    assert(d !== undefined, `expected an unused-variable diagnostic; got ${JSON.stringify(diagnostics)}`);
    const { start, end } = d!.range;
    // Must be on line 0 (the import line).
    assert(start.line === 0, `expected line 0, got ${start.line}`);
    // `add` starts at column 9 (after `import { `).
    assert(
      start.character === 9,
      `expected start col 9 (the \`add\` name), got ${start.character}`,
    );
    // `add` is 3 chars, so end column is 12.
    assert(
      end.line === 0 && end.character === 12,
      `expected end 0:12, got ${end.line}:${end.character}`,
    );
  },
);

// ---- (2) `import { x as y }` — squiggle on the alias `y`, not `import` ------

Deno.test(
  "unused-import range for `{ x as y }` lands on the alias `y`",
  async () => {
    // `import { add as fn } from "./util"`
    //  0         1         2         3
    //  012345678901234567890123456789012345
    // `add` is at col 9..12, `as` at 13..15, `fn` at 16..18.
    const files = {
      "/proj/util.vl": "export function add(a: i32, b: i32) {\n  return a + b\n}\n",
      "/proj/main.vl": 'import { add as fn } from "./util"\n\nlet x = 1\nprint(x)\n',
    };
    const { diagnostics } = await checkDocument(
      files["/proj/main.vl"],
      "/proj/main.vl",
      memReader(files),
    );
    const d = unusedDiag(diagnostics);
    assert(d !== undefined, `expected an unused-variable diagnostic; got ${JSON.stringify(diagnostics)}`);
    const { start, end } = d!.range;
    assert(start.line === 0, `expected line 0, got ${start.line}`);
    // `fn` starts at column 16.
    assert(
      start.character === 16,
      `expected start col 16 (the alias \`fn\`), got ${start.character}`,
    );
    assert(
      end.line === 0 && end.character === 18,
      `expected end 0:18, got ${end.line}:${end.character}`,
    );
  },
);

// ---- (3) USED import must NOT warn ------------------------------------------

Deno.test("a used import emits no unused-variable diagnostic", async () => {
  const files = {
    "/proj/util.vl": "export function add(a: i32, b: i32) {\n  return a + b\n}\n",
    "/proj/main.vl": 'import { add } from "./util"\n\nprint(add(1, 2))\n',
  };
  const { diagnostics } = await checkDocument(
    files["/proj/main.vl"],
    "/proj/main.vl",
    memReader(files),
  );
  const d = unusedDiag(diagnostics);
  assert(
    d === undefined,
    `a used import must not warn; got ${JSON.stringify(diagnostics)}`,
  );
});
