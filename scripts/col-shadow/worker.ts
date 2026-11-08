// One shard of the return-column shadow: compile each file with `fnColShadowArm(2)` on a fresh
// instance of the seed, no imports staged, and print the named rows as JSON lines.
const [compiler, list, shard, of] = Deno.args;
const mod = new WebAssembly.Module(Deno.readFileSync(compiler));
const files = Deno.readTextFileSync(list).split("\n").filter((f) => f);
type Exports = Record<string, (...args: number[]) => number>;
const dec = new TextDecoder();
for (let i = Number(shard); i < files.length; i += Number(of)) {
  const f = files[i];
  let src: string;
  try {
    src = Deno.readTextFileSync(f);
  } catch {
    continue;
  }
  let exp: Exports;
  try {
    exp = new WebAssembly.Instance(mod, {}).exports as unknown as Exports;
    exp.fnColShadowArm(2);
    exp.modReset();
    exp.srcReset();
    for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
    const rc = exp.compileSrc();
    const rows: string[] = [];
    for (let r = 0; r < exp.fnRetShadowRowCount(); r++) {
      const b = new Uint8Array(exp.fnRetShadowRowLen(r));
      for (let j = 0; j < b.length; j++) b[j] = exp.fnRetShadowRowAt(r, j);
      rows.push(`${dec.decode(b)}\t${exp.fnRetShadowRowN(r)}`);
    }
    console.log(JSON.stringify({ f, rc, rows }));
  } catch (e) {
    console.log(JSON.stringify({ f, rc: -1, err: String(e).slice(0, 80) }));
  }
}
