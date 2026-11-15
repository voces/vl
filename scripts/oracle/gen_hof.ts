// A generator of well-typed VL programs over generics and higher-order code, the axis today's
// clause-1 families live on:
//   - un-annotated (hole) functions handed on and called at two types;
//   - generic function values in re-pointed `let`s (S2.5, T9.3);
//   - records, lists and maps of closures;
//   - declaration order: every top-level function may be declared before or after its uses.
// Like gen.ts the programs carry no expectation; the oracle supplies it.
//
//   deno run -A scripts/oracle/gen_hof.ts <out-dir> [--seed S] [--count N] [--stmts K] [--omit a,b]
// `--stmts 1` makes one statement a program, so a failure names its case (the `// case` line);
// `--omit 7,8` leaves cases out, to look past a filed family.

class Rng {
  constructor(private s: number) {}
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number { return Math.floor(this.next() * n); }
  pick<X>(xs: X[]): X { return xs[this.int(xs.length)]; }
  chance(p: number): boolean { return this.next() < p; }
}

type T = "i32" | "i64" | "f64" | "string";
const LIT: Record<T, string[]> = {
  i32: ["0", "1", "7", "-3", "100"],
  i64: ["3000000000", "-9000000003", "4294967296"],
  f64: ["1.5", "-0.25", "2.0", "0.1"],
  string: ['"a"', '"bc"', '"é"', '""'],
};

// The library every program may draw on. Each entry is one top-level function, with the types it
// can be called at: a hole (un-annotated) function lists every type its body is legal at.
const LIB: { name: string; src: string; at: T[]; arity: number }[] = [
  { name: "hid", src: "function hid(x) { x }", at: ["i32", "i64", "f64", "string"], arity: 1 },
  { name: "hdbl", src: "function hdbl(x) { x + x }", at: ["i32", "i64", "f64", "string"], arity: 1 },
  { name: "hinc", src: "function hinc(x) { x + 1 }", at: ["i32", "i64", "f64"], arity: 1 },
  { name: "gid", src: "function gid<A>(x: A): A { x }", at: ["i32", "i64", "f64", "string"], arity: 1 },
  { name: "hpick", src: "function hpick(c, a, b) { if c { a } else { b } }", at: ["i32", "i64", "f64", "string"], arity: 3 },
];
const HELPERS = [
  "function app<A, B>(f: (x: A) => B, x: A): B { f(x) }",
  "function twice<A>(f: (x: A) => A, x: A): A { f(f(x)) }",
  "function mapL<A, B>(xs: A[], f: (x: A) => B): B[] {\n  const out: B[] = []\n  for x in xs { out.push(f(x)) }\n  out\n}",
  "function compose<A, B, C>(f: (x: A) => B, g: (x: B) => C): (x: A) => C { (x: A) => g(f(x)) }",
  "function hcall(f, x) { f(x) }",
  "function hmk(k) { (x: i32) => x * k }",
  "function sel<A>(f: (x: A) => A): (x: A) => A { f }",
];

class Gen {
  body: string[] = [];
  n = 0;
  constructor(public r: Rng, public omit = new Set<number>()) {}
  fresh(p: string): string { return `${p}${this.n++}`; }
  lit(t: T): string { const l = this.r.pick(LIT[t]); return l.startsWith("-") ? `(${l})` : l; }
  fnAt(t: T): string {
    const ok = LIB.filter((f) => f.arity === 1 && f.at.includes(t));
    return this.r.pick(ok).name;
  }

  stmt() {
    const r = this.r;
    const t = r.pick<T>(["i32", "i64", "f64", "string"]);
    let k = r.int(14);
    while (this.omit.has(k)) k = r.int(14);
    this.body.push(`// case ${k}`);
    switch (k) {
      case 0: // a hole function called directly at two types
        {
          const f = r.pick(LIB.filter((f) => f.arity === 1 && f.at.length > 1));
          const [a, b] = [r.pick(f.at), r.pick(f.at)];
          this.body.push(`print(${f.name}(${this.lit(a)}))`, `print(${f.name}(${this.lit(b)}))`);
        }
        return;
      case 1: // handed to a generic higher-order function
        this.body.push(`print(app(${this.fnAt(t)}, ${this.lit(t)}))`);
        return;
      case 2:
        this.body.push(`print(twice(${this.fnAt(t)}, ${this.lit(t)}))`);
        return;
      case 3: { // a re-pointed let of generic or hole functions (S2.5)
        const g = this.fresh("g");
        const f1 = this.fnAt(t), f2 = this.fnAt(t);
        this.body.push(`let ${g} = ${f1}`, `print(${g}(${this.lit(t)}))`, `${g} = ${f2}`, `print(${g}(${this.lit(t)}))`);
        return;
      }
      case 4: { // a list of closures over one type
        const fs = this.fresh("fs");
        const k = 1 + r.int(3);
        const items = Array.from({ length: k }, () => `(x: ${t}) => ${this.fnAt(t)}(x)`);
        this.body.push(`const ${fs}: ((x: ${t}) => ${t})[] = [${items.join(", ")}]`, `for f in ${fs} { print(f(${this.lit(t)})) }`);
        return;
      }
      case 5: { // a record of closures at two types
        const o = this.fresh("ops");
        const u = r.pick<T>(["i32", "f64", "string"]);
        this.body.push(
          `const ${o}: { f: (x: ${t}) => ${t}, g: (x: ${u}) => ${u} } = { f: ${this.fnAt(t)}, g: (y: ${u}) => ${this.fnAt(u)}(y) }`,
          `print(${o}.f(${this.lit(t)}))`,
          `print(${o}.g(${this.lit(u)}))`,
        );
        return;
      }
      case 6: { // a map of closures
        const m = this.fresh("mf");
        this.body.push(
          `const ${m}: {[string]: (x: i32) => i32} = Map()`,
          `${m}["a"] = hmk(${r.int(5)})`,
          `${m}["b"] = (x: i32) => hinc(x)`,
          `for k, f in ${m} {\n  print(k)\n  print(f(${this.lit("i32")}))\n}`,
        );
        return;
      }
      case 7: // mapL over a list, with a hole function
        {
          const u = r.pick<T>(["i32", "f64"]);
          this.body.push(`for y in mapL([${this.lit(u)}, ${this.lit(u)}], ${this.fnAt(u)}) { print(y) }`);
        }
        return;
      case 8: // compose
        {
          const u = r.pick<T>(["i32", "i64", "f64"]);
          this.body.push(`print(compose(${this.fnAt(u)}, ${this.fnAt(u)})(${this.lit(u)}))`);
        }
        return;
      case 9: // a hole higher-order function, called with closures at two types
        this.body.push(`print(hcall(${this.fnAt(t)}, ${this.lit(t)}))`, `print(hcall((z: i32) => z * 2, ${this.lit("i32")}))`);
        return;
      case 10: // hpick at a type, with a call in an arm
        this.body.push(`print(hpick(${r.chance(0.5)}, ${this.lit(t)}, ${this.fnAt(t)}(${this.lit(t)})))`);
        return;
      case 12: { // a generic function value through a generic, its type from the destination only
        const h = this.fresh("h");
        const f = r.pick(LIB.filter((f) => f.arity === 1 && f.at.includes(t)));
        this.body.push(`const ${h}: (x: ${t}) => ${t} = sel(${f.name})`, `print(${h}(${this.lit(t)}))`);
        return;
      }
      case 13: { // the same delivered to an annotated parameter
        const u = this.fresh("use");
        this.body.push(`function ${u}(g: (x: ${t}) => ${t}) { print(g(${this.lit(t)})) }`, `${u}(sel(${this.fnAt(t)}))`);
        return;
      }
      default: { // a closure capturing a let, called after the let is reassigned
        const v = this.fresh("c");
        const f = this.fresh("k");
        this.body.push(`let ${v} = ${this.lit("i32")}`, `const ${f} = (x: i32) => hinc(x) + ${v}`, `${v} = ${this.lit("i32")}`, `print(app(${f}, ${this.lit("i32")}))`);
      }
    }
  }

  program(stmts = 0): string {
    const ns = stmts || 4 + this.r.int(10);
    for (let i = 0; i < ns; i++) this.stmt();
    // Declaration order: each library function and helper goes before or after the statements.
    const decls = [...LIB.map((f) => f.src), ...HELPERS];
    const before: string[] = [], after: string[] = [];
    for (const d of decls) (this.r.chance(0.5) ? before : after).push(d);
    return [...before, ...this.body, ...after].join("\n") + "\n";
  }
}

if (import.meta.main) {
  const args = Deno.args;
  const dir = args[0];
  const flag = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const seed = Number(flag("--seed", "1")), count = Number(flag("--count", "200"));
  const stmts = Number(flag("--stmts", "0"));
  const omit = new Set(flag("--omit", "").split(",").filter((x) => x !== "").map(Number));
  Deno.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    const g = new Gen(new Rng(seed * 300007 + i), omit);
    Deno.writeTextFileSync(`${dir}/ho_s${seed}_${String(i).padStart(4, "0")}.vl`, g.program(stmts));
  }
}
