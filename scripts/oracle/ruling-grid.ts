// The acceptance grid for two owner rulings of 2026-11-15: D16410 (a call's destination type
// binds a type parameter no argument binds) and D16293 (a) (an integer literal `let` stored a
// float takes the float, spec 4.3 at stores). Each case states what the ruling makes it print, or
// `refused` for a check refusal; the oracle gives every one (tests/oracle_smoke_test.ts).
//
//   deno run -A scripts/oracle/ruling-grid.ts write <dir>
//   vl run --batch --out-dir <outs> <dir>/*.vl && deno run -A scripts/oracle/ruling-grid.ts check <dir> <outs>

const KIND = `function kind<T>(v: T): string {
  if v is i32 { return "i32" }
  if v is i64 { return "i64" }
  if v is f32 { return "f32" }
  if v is f64 { return "f64" }
  return "other"
}
`;
const SEL = `function gid<A>(x: A): A { return x }
function sel<A>(f: (x: A) => A): (x: A) => A { return f }
`;
const MK = "function mk<T>(): T[] { return [] }\n";

export type Case = { name: string; ruling: string; src: string; want: string };

export function grid(): Case[] {
  const store = (name: string, body: string, want: string): Case => ({ name: `rg_store_${name}`, ruling: "D16293", src: KIND + body, want });
  const dest = (name: string, src: string, want: string): Case => ({ name: `rg_dest_${name}`, ruling: "D16410", src, want });
  return [
    store("witness", "function sum(xs) {\n  let t = 0\n  let i = 0\n  while i < xs.length { t = t + xs[i]; i = i + 1 }\n  return t\n}\nprint(sum([1.5, 2.5]))\nprint(sum([1, 2]))\n", "4\n3"),
    store("plain", "let t = 0\nt = 1.5\nprint(t)\nprint(kind(t))\n", "1.5\nf64"),
    store("compound", "let t = 0\nt = t + 0.5\nprint(t)\nprint(kind(t))\n", "0.5\nf64"),
    store("f32", "const f: f32 = 1.5\nlet t = 0\nt = f\nprint(kind(t))\n", "f32"),
    store("int_only", "let t = 0\nt = t + 1\nprint(kind(t))\n", "i32"),
    store("read_before", "let t = 0\nprint(t)\nt = 2.5\nprint(t)\nprint(kind(t))\n", "0\n2.5\nf64"),
    store("loop", "let t = 3\nconst xs: f64[] = [0.25, 0.5]\nfor x in xs { t = t + x }\nprint(t)\nprint(kind(t))\n", "3.75\nf64"),
    store("i64_literal", "let t = 9000000000\nt = 0.5\nprint(kind(t))\n", "f64"),
    store("param", "function f(x: f32) {\n  let t = 0\n  t = x\n  print(kind(t))\n}\nf(1.5)\n", "f32"),
    // D16490: a float literal beside `t` adopts its `f32`, and a float-literal `let` stored only `f32` is `f32`
    store("f32_then_literal", "const f: f32 = 1.5\nlet t = 0\nt = f\nt = t - 0.1\nprint(t)\nprint(kind(t))\n", "1.399999976158142\nf32"),
    store("f32_then_compound", "const f: f32 = 1.5\nlet t = 0\nt = f\nt -= 0.25\nprint(kind(t))\n", "f32"),
    store("float_init_f32", "const f: f32 = 1.5\nlet t = 0.0\nt = f\nprint(t - 0.1)\nprint(kind(t))\n", "1.399999976158142\nf32"),
    dest("witness", SEL + "const k: (x: f64) => f64 = sel(gid)\nprint(k(1.5))\n", "1.5"),
    dest("string", SEL + 'const k: (x: string) => string = sel(gid)\nprint(k("ab"))\n', "ab"),
    dest("i64", SEL + "const k: (x: i64) => i64 = sel(gid)\nprint(k(3000000000))\n", "3000000000"),
    dest("argument", SEL + "function use(k: (x: f64) => f64) { print(k(2.5)) }\nuse(sel(gid))\n", "2.5"),
    dest("return", SEL + "function mk2(): (x: f64) => f64 { return sel(gid) }\nprint(mk2()(0.25))\n", "0.25"),
    // the un-annotated spelling of the witness: a hole function, bound by the destination too
    dest("hole_fn", SEL + "function hdbl(x) { return x + x }\nfunction use4(k: (x: i32) => i32) { print(k(4)) }\nuse4(sel(hdbl))\n", "8"),
    dest("hole_fn_const", SEL + "function hdbl(x) { return x + x }\nconst k: (x: f64) => f64 = sel(hdbl)\nprint(k(1.25))\n", "2.5"),
    dest("return_only", MK + "const xs: string[] = mk()\nprint(xs.length)\n", "0"),
    dest("nullable", "function z<T>(): T | null { return null }\nconst v: string | null = z()\nprint(v == null)\n", "true"),
    dest("none_binding", MK + "const xs = mk()\nprint(xs.length)\n", "refused"),
    dest("none_operand", MK + "print(mk().length)\n", "refused"),
  ];
}

// Grades a `vl run --batch` recording of the written grid against each case's want.
function check(dir: string, outs: string): number {
  let bad = 0;
  for (const c of grid()) {
    let out = "", err = "";
    try { out = Deno.readTextFileSync(`${outs}/${c.name}.vl.out`).replace(/\n$/, ""); } catch { /* none */ }
    try { err = Deno.readTextFileSync(`${outs}/${c.name}.vl.err`); } catch { /* none */ }
    const got = err ? (/type error/.test(err) ? "refused" : err.split("\n").find((l) => l.trim()) ?? "error") : out;
    const ok = got === c.want;
    if (!ok) bad++;
    console.log(`${ok ? "AGREE   " : "DIFFER  "} ${c.ruling} ${c.name}  want ${JSON.stringify(c.want)}  got ${JSON.stringify(got.slice(0, 120))}`);
  }
  console.log(`ruling-grid: ${grid().length - bad} of ${grid().length} cases agree with the compiler (${dir})`);
  return bad ? 1 : 0;
}

if (import.meta.main) {
  const [mode, dir, outs] = Deno.args;
  if (mode === "write") {
    Deno.mkdirSync(dir, { recursive: true });
    for (const c of grid()) {
      Deno.writeTextFileSync(`${dir}/${c.name}.vl`, c.src);
      Deno.writeTextFileSync(`${dir}/${c.name}.want`, c.want + "\n");
    }
  } else if (mode === "check") Deno.exit(check(dir, outs));
  else {
    console.error("usage: ruling-grid.ts write <dir> | check <dir> <outs>");
    Deno.exit(2);
  }
}
