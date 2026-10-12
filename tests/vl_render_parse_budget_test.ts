// THE RENDER-PARSE RATCHET, VALIDATED AGAINST CONTROLS IT MUST AND MUST NOT FIRE ON.
//
// `scripts/render-parse-budget.py` counts `tyToEmitName(` calls and the ten
// type-string parsers in the emitter. A counter that stopped seeing calls would
// still pass `--check` (counts may only fall), so this grades a miniature emitter
// module under `--root`: the real calls are listed, and a call in a comment, a
// name in a string, a parser's own declaration, a parser's body, a renderer's body
// (`tyToEmitNameAt`) and a file outside the emitter are not.
//
// Pure Python + a file walk — no seed, no binary.

import { fileURLToPath } from "node:url";
import { pythonBin } from "./support/tree.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");
const SCRIPT = `${ROOT}/scripts/render-parse-budget.py`;

const run = async (args: string[]): Promise<string> => {
  const { code, stdout, stderr } = await new Deno.Command(pythonBin(), {
    args: [SCRIPT, ...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const out = new TextDecoder().decode(stdout);
  if (code !== 0) {
    throw new Error(
      `render-parse-budget.py ${args.join(" ")} exited ${code}: ` +
        `${new TextDecoder().decode(stderr)}${out}`,
    );
  }
  return out;
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

Deno.test("render-parse ratchet: counts the emitter's real calls and nothing else", async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl_render_parse_" });
  try {
    await Deno.mkdir(`${dir}/compiler`);
    await Deno.writeTextFile(`${dir}/compiler/emit_x.vl`, EMIT);
    await Deno.writeTextFile(`${dir}/compiler/typecheck.vl`, CHECKER);
    const got = (await run(["--list", "--root", dir])).trim().split("\n").filter((l) => l);
    const want = [
      "compiler/emit_x.vl:8  kindOf  nameIsArray",
      "compiler/emit_x.vl:8  kindOf  tyToEmitName",
      "compiler/emit_x.vl:14  emitCast  tyToEmitName",
      "compiler/emit_x.vl:15  emitCast  nullablePartOf",
      "compiler/emit_x.vl:15  emitCast  tyToEmitName",
    ];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(`want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("render-parse ratchet: the committed tree is at or under its baseline", async () => {
  const out = await run(["--check"]);
  if (!out.includes("render-parse budget ok")) {
    throw new Error(`--check: ${out}`);
  }
});
