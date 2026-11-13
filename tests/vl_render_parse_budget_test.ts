// THE RENDER-PARSE RATCHET, VALIDATED AGAINST CONTROLS IT MUST AND MUST NOT FIRE ON.
//
// `scripts/render-parse-census.vl` counts `tyToEmitName(` calls and type-string parser calls
// in the emitter: every export of compiler/tyname.vl but the display rewrite, plus the census's
// extra parsers. A counter that stopped seeing calls would still pass `--check` (counts may only
// fall), so this grades a miniature tree under `--root`: the real calls are listed, and a call in
// a comment, a name in a string, a parser's own declaration, a parser's body or its `<parser>Go`
// ladder, a renderer's body (`tyToEmitNameAt`), the display rewrite and a file outside the
// emitter are not. A grammar export and `check_emit_queries.vl` are in scope. An extra parser
// declared nowhere fails the census. An origins file re-codes a graded site by its key; a stale
// row is ignored and an ungraded site stays unclassified. The committed tree against its baseline is the
// `render-parse budget` row of scripts/gate.sh and its own step in ci.yml.
//
// @test-timing native

import { builtScript } from "./support/builtScript.ts";
import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-render-parse-budget] skipped — missing vl binary or seed wasm.",
  );
}

const census = async (
  args: string[],
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [
      "run",
      await builtScript("scripts/render-parse-census.vl", { cwd: ROOT }),
      "--",
      ...args,
    ],
    cwd: ROOT,
    env: nativeEnv(),
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout) + dec.decode(stderr) };
};

const EMIT = `export function nameIsArray(name: string) {
  splitUnionAtoms(name, [])
}
function nameIsArrayGo(name: string) { nullablePartOf(name) }

function kindOf(t: i32) {
  // nameIsArray(tyToEmitName(t)) in a comment is not a call
  const msg = "tyToEmitName( in a message"
  nameIsArray(tyToEmitName(t))
}

function shapeOf(name: string) {
  const inner = groupInnerOf(name)
  demangleSpelling(inner)
}

export function tyToEmitNameAt(ix: i32, rc: i32) { nullablePartOf(tyToEmitName(ix)) }

function emitCast(fromTy: i32, toTy: i32) {
  const fk = valueAtomKind(tyToEmitName(fromTy))
  if nullablePartOf(tyToEmitName(toTy)) != "" && fk >= 0 { return }
}
`;
const CHECKER = `function render(t: i32) { tyToEmitName(t) }
`;
const QUERIES = `export function recordClonedTy(name: string) { nameToTy(name) }
`;
const TYNAME = `export function nameIsArray(name: string) { name.length > 2 }
export function splitUnionAtoms(name: string, out: string[]) { 0 }
export function groupInnerOf(name: string) { name }
export function demangleSpelling(name: string) { name }
function privateHelper(name: string) { name }
`;

// Declares every parser the census lists, so a fixture tree passes its stale-name check.
const stubOf = (names: string[], drop: string): string =>
  names.filter((n) => n !== drop).map((n) =>
    `export function ${n}(name: string) { 0 }\n`
  ).join("");

const writeTree = async (dir: string, parsers: string[], drop: string) => {
  await Deno.mkdir(`${dir}/compiler`);
  await Deno.writeTextFile(`${dir}/compiler/emit_x.vl`, EMIT);
  await Deno.writeTextFile(`${dir}/compiler/typecheck.vl`, CHECKER);
  await Deno.writeTextFile(`${dir}/compiler/check_emit_queries.vl`, QUERIES);
  await Deno.writeTextFile(`${dir}/compiler/tyname.vl`, TYNAME);
  await Deno.writeTextFile(`${dir}/compiler/parsers.vl`, stubOf(parsers, drop));
};

Deno.test({
  name:
    "render-parse ratchet: counts the emitter's real calls and nothing else",
  ignore: !ENABLED,
  async fn() {
    const real = await census(["--parsers"]);
    const parsers = real.out.trim().split(/\r?\n/).filter((l) => l);
    if (
      real.code !== 0 || !parsers.includes("nameToTy") ||
      !parsers.includes("groupInnerOf")
    ) {
      throw new Error(
        `--parsers on the tree: rc ${real.code}, got ${
          JSON.stringify(parsers)
        }`,
      );
    }
    if (parsers.includes("demangleSpelling")) {
      throw new Error("--parsers lists the display rewrite `demangleSpelling`");
    }
    const extras = parsers.filter((p) => !TYNAME.includes(`function ${p}(`));
    const dir = await Deno.makeTempDir({ prefix: "vl_render_parse_" });
    try {
      await writeTree(dir, extras, "");
      const r = await census(["--list", "--root", dir]);
      const got = r.out.trim().split(/\r?\n/).filter((l) => l);
      const want = [
        "compiler/check_emit_queries.vl:1  recordClonedTy  nameToTy",
        "compiler/emit_x.vl:9  kindOf  nameIsArray",
        "compiler/emit_x.vl:9  kindOf  tyToEmitName",
        "compiler/emit_x.vl:13  shapeOf  groupInnerOf",
        "compiler/emit_x.vl:20  emitCast  valueAtomKind",
        "compiler/emit_x.vl:20  emitCast  tyToEmitName",
        "compiler/emit_x.vl:21  emitCast  nullablePartOf",
        "compiler/emit_x.vl:21  emitCast  tyToEmitName",
      ];
      if (r.code !== 0 || JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(
          `rc ${r.code}: want ${JSON.stringify(want)}, got ${
            JSON.stringify(got)
          }`,
        );
      }
      const only = await census(["--list", "ty-render", "--root", dir]);
      const gotRender = only.out.trim().split(/\r?\n/).filter((l) => l);
      const wantRender = want.filter((l) => l.endsWith("tyToEmitName"));
      if (JSON.stringify(gotRender) !== JSON.stringify(wantRender)) {
        throw new Error(
          `--list ty-render: want ${JSON.stringify(wantRender)}, got ${
            JSON.stringify(gotRender)
          }`,
        );
      }
      await Deno.mkdir(`${dir}/scripts`);
      await Deno.writeTextFile(
        `${dir}/scripts/render-parse-origins.txt`,
        "# a comment\n" +
          "render\tcompiler/emit_x.vl\tkindOf\tnameIsArray\t0\n" +
          "source\tcompiler/emit_x.vl\tshapeOf\tgroupInnerOf\t0\n" +
          "render\tcompiler/emit_x.vl\tgone\tnameIsArray\t0\n",
      );
      const byCode = async (code: string) =>
        (await census(["--list", code, "--root", dir])).out.trim().split(
          /\r?\n/,
        ).filter((l) => l);
      const graded = {
        "ty-string-parse": await byCode("ty-string-parse"),
        "ty-source-parse": await byCode("ty-source-parse"),
        "ty-parse-unclassified": await byCode("ty-parse-unclassified"),
      };
      const wantGraded = {
        "ty-string-parse": ["compiler/emit_x.vl:9  kindOf  nameIsArray"],
        "ty-source-parse": ["compiler/emit_x.vl:13  shapeOf  groupInnerOf"],
        "ty-parse-unclassified": [
          "compiler/check_emit_queries.vl:1  recordClonedTy  nameToTy",
          "compiler/emit_x.vl:20  emitCast  valueAtomKind",
          "compiler/emit_x.vl:21  emitCast  nullablePartOf",
        ],
      };
      if (JSON.stringify(graded) !== JSON.stringify(wantGraded)) {
        throw new Error(
          `origins: want ${JSON.stringify(wantGraded)}, got ${
            JSON.stringify(graded)
          }`,
        );
      }
      const sites = await census(["--sites", "--root", dir]);
      if (
        !sites.out.includes(
          "compiler/emit_x.vl\tshapeOf\tgroupInnerOf\t0\t13\t",
        )
      ) {
        throw new Error(
          `--sites: want a keyed row for shapeOf's groupInnerOf, got ${sites.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
    const stale = await Deno.makeTempDir({ prefix: "vl_render_parse_stale_" });
    try {
      await writeTree(stale, extras, "nameToTy");
      const r = await census(["--list", "--root", stale]);
      if (r.code !== 2 || !r.out.includes("`nameToTy` is declared nowhere")) {
        throw new Error(
          `stale parser: want rc 2 naming nameToTy, got rc ${r.code}: ${r.out}`,
        );
      }
    } finally {
      await Deno.remove(stale, { recursive: true });
    }
  },
});
