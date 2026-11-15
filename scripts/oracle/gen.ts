// A generator of well-typed VL programs over the axis scripts/fuzzgen.vl leaves out:
// arithmetic, mixed widths, casts, constant folding and evaluation order. fuzzgen's payload
// round-trip needs no oracle; these programs need one, and the oracle is what supplies it.
//
//   deno run -A scripts/oracle/gen.ts <out-dir> [--seed S] [--count N]
//
// Every program is meant to pass `vl check`: types are tracked while generating, and only
// combinations E2.2, T2.6 and E8 permit are emitted.

type T = "i32" | "i64" | "f64" | "f32";
const INTS: T[] = ["i32", "i64"];

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

const LITS: Record<T, string[]> = {
  i32: ["0", "1", "2", "3", "7", "-1", "-5", "100", "255", "65535", "2147483647", "-2147483648", "46341", "0x7fffffff", "0xFFFFFFFF", "1_000"],
  i64: ["0", "1", "-1", "9", "3000000000", "-9000000003", "9223372036854775807", "-9223372036854775807", "4294967296", "0xFFFFFFFF"],
  f64: ["0.0", "1.5", "-2.25", "0.1", "3.0", "1e10", "-0.5", "1e-7", "123456.789", "2.5"],
  f32: ["0.5", "1.5", "-0.25", "0.1", "3.0", "16777217.0", "2.5"],
};

class Gen {
  vars: { name: string; t: T; mut: boolean }[] = [];
  fns: { name: string; params: T[]; ret: T }[] = [];
  out: string[] = [];
  n = 0;
  constructor(public r: Rng) {}

  fresh(p: string): string { return `${p}${this.n++}`; }

  lit(t: T): string {
    const l = this.r.pick(LITS[t]);
    return l.startsWith("-") ? `(${l})` : l;
  }

  // An expression of exactly type t.
  expr(t: T, d: number): string {
    const r = this.r;
    if (d <= 0 || r.chance(0.25)) {
      const vs = this.vars.filter((v) => v.t === t);
      if (vs.length && r.chance(0.75)) return r.pick(vs).name;
      return this.lit(t);
    }
    const isInt = INTS.includes(t);
    const k = r.int(12);
    switch (k) {
      case 0: case 1: case 2: {
        const ops = isInt ? ["+", "-", "*", "/", "%", "&", "|", "^"] : ["+", "-", "*", "/", "%"];
        return `(${this.expr(t, d - 1)} ${r.pick(ops)} ${this.expr(t, d - 1)})`;
      }
      case 3: {
        // E2.2: two runtime widths meet at the wider one
        if (t === "i64") return `(${this.expr("i32", d - 1)} ${r.pick(["+", "-", "*"])} ${this.expr("i64", d - 1)})`;
        if (t === "f64") {
          const s = r.pick<T>(["i32", "f32"]);
          return r.chance(0.5) ? `(${this.expr(s, d - 1)} ${r.pick(["+", "-", "*", "/"])} ${this.expr("f64", d - 1)})` : `(${this.expr("f64", d - 1)} ${r.pick(["+", "-", "*", "/"])} ${this.expr(s, d - 1)})`;
        }
        return `(-${this.expr(t, d - 1)})`;
      }
      case 4:
        if (isInt) {
          const w = t === "i32" ? 32 : 64;
          const count = r.chance(0.5) ? String(r.int(w)) : this.expr("i32", d - 1);
          return `(${this.expr(t, d - 1)} ${r.pick(["<<", ">>", ">>>"])} ${count})`;
        }
        return `${r.pick(["trunc", "floor", "ceil", "nearest", "abs"])}(${this.expr(t, d - 1)})`;
      case 5: return this.cast(t, d);
      case 6: return `(if ${this.cond(d - 1)} { ${this.expr(t, d - 1)} } else { ${this.expr(t, d - 1)} })`;
      case 7: {
        const f = this.fns.filter((f) => f.ret === t);
        if (f.length) {
          const g = r.pick(f);
          return `${g.name}(${g.params.map((p) => this.expr(p, d - 1)).join(", ")})`;
        }
        return this.expr(t, d - 1);
      }
      case 8: return `${r.pick(["min", "max"])}(${this.expr(t, d - 1)}, ${this.expr(t, d - 1)})`;
      case 9: return `tr("${this.fresh("e")}", ${this.expr(t, d - 1)})`.replace("tr(", `tr_${t}(`);
      case 10: if (isInt) return `(~${this.expr(t, d - 1)})`; return `(${this.expr(t, d - 1)} * ${this.lit(t)})`;
      default: {
        // a literal tree: exact constant arithmetic, typed at its use (E9.1)
        const a = this.lit(t), b = this.lit(t);
        return `(${a} ${r.pick(["+", "-", "*"])} ${b})`;
      }
    }
  }

  cast(t: T, d: number): string {
    const r = this.r;
    const s = r.pick<T>(["i32", "i64", "f64", "f32"]);
    const e = this.expr(s, d - 1);
    if (t === "f64" || t === "f32") return `(${e} as ${t})`;
    if (s === "f64" || s === "f32") return r.chance(0.5) ? `((${e} as? ${t}) ?? ${this.lit(t)})` : `(${e} as! ${t})`;
    if (s === t) return `(${e} as ${t})`;
    if (s === "i32" && t === "i64") return `(${e} as i64)`;
    return r.chance(0.5) ? `(${e} as% ${t})` : `((${e} as? ${t}) ?? ${this.lit(t)})`;
  }

  cond(d: number): string {
    const r = this.r;
    const t = r.pick<T>(["i32", "i64", "f64", "f32"]);
    const c = `(${this.expr(t, d)} ${r.pick(["<", "<=", ">", ">=", "==", "!="])} ${this.expr(t, d)})`;
    if (d > 0 && r.chance(0.3)) return `(${c} ${r.pick(["&&", "||"])} ${this.cond(d - 1)})`;
    if (d > 0 && r.chance(0.15)) return `trb("${this.fresh("c")}", ${c})`;
    return c;
  }

  stmt(d: number) {
    const r = this.r;
    const k = r.int(10);
    const t = r.pick<T>(["i32", "i64", "f64", "f32", "i32", "i64"]);
    if (k <= 2 || this.vars.length < 2) {
      const name = this.fresh("v");
      const mut = r.chance(0.6);
      this.out.push(`${mut ? "let" : "const"} ${name}: ${t} = ${this.expr(t, d)}`);
      this.vars.push({ name, t, mut });
    } else if (k <= 4) {
      const vs = this.vars.filter((v) => v.mut);
      if (!vs.length) return;
      const v = r.pick(vs);
      const ops = INTS.includes(v.t) ? ["=", "+=", "-=", "*=", "&=", "|=", "^="] : ["=", "+=", "-=", "*=", "/="];
      this.out.push(`${v.name} ${r.pick(ops)} ${this.expr(v.t, d)}`);
    } else if (k === 5) {
      const vs = this.vars.filter((v) => v.mut && INTS.includes(v.t));
      if (vs.length) {
        const v = r.pick(vs);
        this.out.push(`print(${r.pick([`${v.name}++`, `++${v.name}`, `${v.name}--`, `--${v.name}`])})`);
      }
    } else if (k === 6) {
      const vs = this.vars.filter((v) => v.mut);
      if (vs.length) {
        const v = r.pick(vs);
        const i = this.fresh("i");
        this.out.push(`for ${i} in 0 until ${1 + r.int(4)} { ${v.name} = ${this.expr(v.t, d - 1)} }`);
      }
    } else if (k === 7) {
      this.out.push(`if ${this.cond(d - 1)} { print(${this.expr(t, d - 1)}) } else { print("no") }`);
    } else if (k === 8) {
      this.out.push(`print("<\\{${this.expr(t, d)}}>")`);
    } else {
      this.out.push(`print(${this.expr(t, d)})`);
    }
  }

  program(): string {
    const r = this.r;
    const head: string[] = [];
    for (const t of ["i32", "i64", "f64", "f32"] as T[]) {
      head.push(`function tr_${t}(s: string, v: ${t}): ${t} { print(s); v }`);
    }
    head.push(`function trb(s: string, v: boolean): boolean { print(s); v }`);
    const nf = r.int(3);
    for (let i = 0; i < nf; i++) {
      const params = Array.from({ length: 1 + r.int(3) }, () => r.pick<T>(["i32", "i64", "f64", "f32"]));
      const ret = r.pick<T>(["i32", "i64", "f64", "f32"]);
      const name = this.fresh("f");
      const saved = this.vars;
      this.vars = params.map((t, j) => ({ name: `p${j}`, t, mut: false }));
      const body = this.expr(ret, 3);
      this.vars = saved;
      head.push(`function ${name}(${params.map((t, j) => `p${j}: ${t}`).join(", ")}): ${ret} { ${body} }`);
      this.fns.push({ name, params, ret });
    }
    const ns = 4 + r.int(8);
    for (let i = 0; i < ns; i++) this.stmt(3);
    for (const v of this.vars) this.out.push(`print(${v.name})`);
    return [...head, ...this.out].join("\n") + "\n";
  }
}

if (import.meta.main) {
  const args = Deno.args;
  const dir = args[0];
  const flag = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const seed = Number(flag("--seed", "1")), count = Number(flag("--count", "200"));
  Deno.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    const g = new Gen(new Rng(seed * 100003 + i));
    Deno.writeTextFileSync(`${dir}/ar_s${seed}_${String(i).padStart(4, "0")}.vl`, g.program());
  }
}
