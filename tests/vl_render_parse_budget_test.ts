// THE RENDER-PARSE RATCHET, VALIDATED AGAINST CONTROLS IT MUST AND MUST NOT FIRE ON.
//
// `scripts/render-parse-census.vl` counts `tyToEmitName(` calls and the ten
// type-string parsers in the emitter. A counter that stopped seeing calls would
// still pass `--check` (counts may only fall), so this grades a miniature emitter
// module under `--root`: the real calls are listed, and a call in a comment, a
// name in a string, a parser's own declaration, a parser's body, a renderer's body
// (`tyToEmitNameAt`) and a file outside the emitter are not. The committed tree against its
// baseline is the `render-parse budget` row of scripts/gate.sh and its own step in ci.yml.
//
// @test-timing native

import { builtScript } from "./support/builtScript.ts";
import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-render-parse-budget] skipped — missing vl binary or seed wasm.");
}

const census = async (args: string[]): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", await builtScript("scripts/render-parse-census.vl", { cwd: ROOT }), "--", ...args],
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

function kindOf(t: i32) {
  // nameIsArray(tyToEmitName(t)) in a comment is not a call
  const msg = "tyToEmitName( in a message"
  nameIsArray(tyToEmitName(t))
}

export function tyToEmitNameAt(ix: i32, rc: i32) { nullablePartOf(tyToEmitName(ix)) }

function emitCast(fromTy: i32, toTy: i32) {
  const fk = valueAtomKind(tyToEmitName(fromTy))
  if nullablePartOf(tyToEmitName(toTy)) != "" && fk >= 0 { return }
}
`;
const CHECKER = `function render(t: i32) { tyToEmitName(t) }
`;

Deno.test({
  name: "render-parse ratchet: counts the emitter's real calls and nothing else",
  ignore: !ENABLED,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: "vl_render_parse_" });
    try {
      await Deno.mkdir(`${dir}/compiler`);
      await Deno.writeTextFile(`${dir}/compiler/emit_x.vl`, EMIT);
      await Deno.writeTextFile(`${dir}/compiler/typecheck.vl`, CHECKER);
      const r = await census(["--list", "--root", dir]);
      const got = r.out.trim().split(/\r?\n/).filter((l) => l);
      const want = [
        "compiler/emit_x.vl:8  kindOf  nameIsArray",
        "compiler/emit_x.vl:8  kindOf  tyToEmitName",
        "compiler/emit_x.vl:14  emitCast  tyToEmitName",
        "compiler/emit_x.vl:15  emitCast  nullablePartOf",
        "compiler/emit_x.vl:15  emitCast  tyToEmitName",
      ];
      if (r.code !== 0 || JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(`rc ${r.code}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
      }
      const only = await census(["--list", "ty-render", "--root", dir]);
      const gotRender = only.out.trim().split(/\r?\n/).filter((l) => l);
      const wantRender = want.filter((l) => l.endsWith("tyToEmitName"));
      if (JSON.stringify(gotRender) !== JSON.stringify(wantRender)) {
        throw new Error(`--list ty-render: want ${JSON.stringify(wantRender)}, got ${JSON.stringify(gotRender)}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
