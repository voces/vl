// A decision module writes no bytes (ir-design-2026-11.md §10.1(a)).
//
// `compiler/emit_plan_<family>.vl` holds the decisions legacy's writers and the IR's lowering
// both read. Each is named by what it decides, and its header says what it does not do. This
// test holds the mechanical half: no import from `wasmEmit.vl` or any `ir_*.vl`, no byte writer
// or `emitExpr` imported, no `*_helpers` name. Failures throw with want and got.

const DIR = "compiler";
const PLAN = /^emit_plan_[a-z0-9_]+\.vl$/;
// Writers in `emit_bytes.vl`: `w*` and `fb*`, less the readers that query the buffer or a table.
const WRITER = /^(w[A-Z0-9]|fb[A-Z0-9]|rope[A-Z])/;
const READERS = new Set([
  "wTarget",
  "wPeekBack",
  "wRangeEq",
  "wLen",
  "wIsOneScalarConst",
  "fbLocalIsUnsetRef",
  "fbMapSlotOf",
  "ropeAt",
]);

function importsOf(text: string): { names: string[]; from: string }[] {
  const out: { names: string[]; from: string }[] = [];
  for (const m of text.matchAll(/^import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/gm)) {
    const names = m[1].split(",").map((s) => s.trim()).filter((s) => s !== "");
    out.push({ names, from: m[2] });
  }
  return out;
}

Deno.test("decision modules: byte-free, below wasmEmit and the IR", () => {
  const files = [...Deno.readDirSync(DIR)].map((e) => e.name).filter((n) =>
    PLAN.test(n)
  ).sort();
  if (files.length === 0) {
    throw new Error(`want at least one ${DIR}/emit_plan_*.vl, got none`);
  }
  const bad: string[] = [];
  for (const f of files) {
    if (/helpers?\.vl$/.test(f)) {
      bad.push(`${f}: a decision module is named by what it decides`);
    }
    const text = Deno.readTextFileSync(`${DIR}/${f}`);
    if (!/writes no bytes/.test(text.slice(0, 2000))) {
      bad.push(`${f}: header must say it writes no bytes`);
    }
    for (const { names, from } of importsOf(text)) {
      if (from === "./wasmEmit" || /^\.\/ir(_|$)/.test(from)) {
        bad.push(`${f}: imports from ${from}`);
      }
      for (const n of names) {
        if (
          n === "emitExpr" ||
          (from === "./emit_bytes" && WRITER.test(n) && !READERS.has(n))
        ) {
          bad.push(`${f}: imports the writer ${n} from ${from}`);
        }
      }
    }
  }
  if (bad.length > 0) {
    throw new Error(
      `want every decision module byte-free; got:\n  ${bad.join("\n  ")}`,
    );
  }
});
