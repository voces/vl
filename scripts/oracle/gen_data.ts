// A generator of well-typed VL programs over data rather than arithmetic: evaluation order
// through printing calls (E10.1), records, lists and maps under mutation and aliasing, closures
// that capture by reference (E14.2), loops with break and continue, and strings. Like gen.ts,
// the programs carry no expectation: the oracle supplies it.
//
//   deno run -A scripts/oracle/gen_data.ts <out-dir> [--seed S] [--count N]

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

const HEAD = [
  "type R = { a: i32, b: string, xs: i32[] }",
  "function t(s: string, v: i32): i32 { print(s); return v }",
  "function ts(s: string, v: string): string { print(s); return v }",
  "function tb(s: string, v: boolean): boolean { print(s); return v }",
  "function add3(x: i32, y: i32, z: i32): i32 { return x * 100 + y * 10 + z }",
  "function sum(xs: i32[]): i32 {\n  let s = 0\n  for x in xs { s = s + x }\n  return s\n}",
  "function bump(r: R, k: i32) { r.a = r.a + k\n  r.xs.push(k) }",
  "type N = { v: i32, next: N | null }",
  "type U = { tag: \"p\", p: i32 } | { tag: \"q\", q: string }",
  "function walk(n: N | null): i32 {\n  let s = 0\n  let c = n\n  while c != null {\n    s = s * 10 + c.v\n    c = c.next\n  }\n  return s\n}",
  "function firstOver(xs: i32[], k: i32): i32 {\n  for x in xs { if x > k { return x } }\n  return -1\n}",
  "function show(u: U): string { return if u is { tag: \"p\", p: i32 } { \"p\\{u.p}\" } else { u.q } }",
  "function mk(a: i32): R { { a: a, b: \"m\\{a}\", xs: [a, a + 1] } }",
];

const STRS = ['"a"', '"bc"', '"é"', '""', '"x y"', '"Z"'];

class Gen {
  out: string[] = [];
  n = 0;
  ints: string[] = [];
  lets: string[] = [];
  lists: string[] = [];
  recs: string[] = [];
  maps: string[] = [];
  strs: string[] = [];
  closures: string[] = [];
  constructor(public r: Rng) {}
  fresh(p: string): string { return `${p}${this.n++}`; }
  tag(): string { return `"${String.fromCharCode(97 + this.r.int(26))}${this.n++}"`; }

  int(d: number): string {
    const r = this.r;
    if (d <= 0 || r.chance(0.3)) {
      if (this.ints.length && r.chance(0.6)) return r.pick(this.ints);
      return String(r.int(20) - 5);
    }
    switch (r.int(9)) {
      case 0: return `t(${this.tag()}, ${this.int(d - 1)})`;
      case 1: return `(${this.int(d - 1)} ${r.pick(["+", "-", "*"])} ${this.int(d - 1)})`;
      case 2: if (this.lists.length) { const l = r.pick(this.lists); return `${l}.length`; } return "1";
      case 3: if (this.recs.length) return `${r.pick(this.recs)}.a`; return "2";
      case 4: if (this.maps.length) return `(${r.pick(this.maps)}[${this.str(0)}] ?? ${this.int(d - 1)})`; return "3";
      case 5: return `add3(${this.int(d - 1)}, ${this.int(d - 1)}, ${this.int(d - 1)})`;
      case 6: if (this.lists.length) return `sum(${r.pick(this.lists)})`; return "4";
      case 7: if (this.strs.length) return `${r.pick(this.strs)}.length`; return "5";
      default: if (this.closures.length) return `${r.pick(this.closures)}()`; return "6";
    }
  }

  str(d: number): string {
    const r = this.r;
    if (d <= 0 || r.chance(0.4)) {
      if (this.strs.length && r.chance(0.5)) return r.pick(this.strs);
      return r.pick(STRS);
    }
    switch (r.int(4)) {
      case 0: return `ts(${this.tag()}, ${this.str(d - 1)})`;
      case 1: return `(${this.str(d - 1)} + ${this.str(d - 1)})`;
      case 2: return `"\\{${this.int(d - 1)}}-\\{${this.str(d - 1)}}"`;
      default: if (this.recs.length) return `${r.pick(this.recs)}.b`; return '"q"';
    }
  }

  list(d: number): string {
    const k = this.r.int(4);
    return "[" + Array.from({ length: k }, () => this.int(d)).join(", ") + "]";
  }

  stmt() {
    const r = this.r;
    switch (r.int(17)) {
      case 0: {
        const v = this.fresh("n");
        this.out.push(`let ${v}: i32 = ${this.int(2)}`);
        this.ints.push(v);
        this.lets.push(v);
        return;
      }
      case 1: {
        const v = this.fresh("xs");
        this.out.push(`const ${v}: i32[] = ${this.list(2)}`);
        this.lists.push(v);
        return;
      }
      case 2: {
        const v = this.fresh("r");
        this.out.push(`const ${v}: R = { a: ${this.int(2)}, b: ${this.str(1)}, xs: ${this.list(1)} }`);
        this.recs.push(v);
        return;
      }
      case 3: {
        const v = this.fresh("m");
        this.out.push(`const ${v}: {[string]: i32} = Map()`);
        this.out.push(`${v}[${this.str(0)}] = ${this.int(1)}`);
        this.maps.push(v);
        return;
      }
      case 4: {
        const v = this.fresh("s");
        this.out.push(`const ${v} = ${this.str(2)}`);
        this.strs.push(v);
        return;
      }
      case 5: {
        if (!this.lists.length) return;
        const l = r.pick(this.lists);
        if (r.chance(0.5)) this.out.push(`${l}.push(${this.int(2)})`);
        else this.out.push(`if ${l}.length > 0 { ${l}[t(${this.tag()}, 0)] ${r.pick(["=", "+=", "-=", "*="])} ${this.int(2)} }`);
        return;
      }
      case 6: {
        if (!this.recs.length) return;
        const x = r.pick(this.recs);
        const a = this.fresh("al");
        this.out.push(`const ${a} = ${x}`);
        this.out.push(`${a}.a ${r.pick(["=", "+=", "-="])} ${this.int(1)}`);
        this.out.push(`print(${x}.a)`);
        this.recs.push(a);
        return;
      }
      case 7: {
        if (!this.recs.length) return;
        this.out.push(`bump(${r.pick(this.recs)}, ${this.int(1)})`);
        return;
      }
      case 8: {
        if (!this.lets.length) return;
        const v = r.pick(this.lets);
        const c = this.fresh("f");
        this.out.push(`const ${c} = (): i32 => {\n  ${v} = ${v} + ${this.int(0)}\n  return ${v}\n}`);
        this.closures.push(c);
        return;
      }
      case 9: {
        const i = this.fresh("i");
        const acc = this.fresh("acc");
        const n = 1 + r.int(6);
        const brk = r.int(n + 2), cnt = r.int(n + 2);
        this.out.push(`let ${acc} = 0\nfor ${i} in 0 until ${n} {\n  if ${i} == ${cnt} { continue }\n  if ${i} == ${brk} { break }\n  ${acc} = ${acc} + ${i} * ${this.int(0)}\n}\nprint(${acc})`);
        return;
      }
      case 10: {
        const w = this.fresh("w");
        this.out.push(`let ${w} = ${r.int(5)}\nwhile ${w} > 0 {\n  ${w} = ${w} - 1\n  print(${w})\n}`);
        return;
      }
      case 11: {
        if (!this.maps.length) return;
        const m = r.pick(this.maps);
        const k = this.str(0);
        this.out.push(`${m}[${k}] = (${m}[${k}] ?? 0) + ${this.int(1)}`);
        this.out.push(`for k, v in ${m} {\n  print(k)\n  print(v)\n}`);
        return;
      }
      case 12: {
        if (!this.lists.length) return;
        const l = r.pick(this.lists);
        const a = this.fresh("ys");
        this.out.push(`const ${a} = ${l}\n${a}.push(${this.int(1)})\nprint(${l}.length)`);
        this.lists.push(a);
        return;
      }
      case 13: {
        if (this.lists.length < 1) return;
        this.out.push(`print(${r.pick(this.lists)} == ${this.list(0)})`);
        return;
      }
      case 14: {
        this.out.push(`print(${r.chance(0.5) ? "tb(" + this.tag() + ", " + `${this.int(1)} > ${this.int(1)}` + ") && tb(" + this.tag() + ", true)" : "tb(" + this.tag() + ", false) || tb(" + this.tag() + ", " + `${this.int(1)} == ${this.int(1)}` + ")"})`);
        return;
      }
      case 15: {
        this.extra();
        return;
      }
      default: {
        if (r.chance(0.5)) this.out.push(`print(${this.int(3)})`);
        else this.out.push(`print(${this.str(2)})`);
      }
    }
  }

  // The shapes past the first sweep: closures over loop variables and in containers, linked
  // records, unions, nullable reads, spreads, string walks, `match`, shadowing, early return.
  extra() {
    const r = this.r;
    switch (r.int(12)) {
      case 0: {
        const fs = this.fresh("fs");
        this.out.push(`const ${fs}: (() => i32)[] = []\nfor i in 0 until ${1 + r.int(4)} { ${fs}.push(() => i * ${this.int(0)}) }\nfor f in ${fs} { print(f()) }`);
        return;
      }
      case 1: {
        const n = this.fresh("ln");
        this.out.push(`const ${n}: N = { v: ${r.int(9)}, next: { v: ${r.int(9)}, next: ${r.chance(0.5) ? "null" : `{ v: ${r.int(9)}, next: null }`} } }\nprint(walk(${n}))\nprint(${n}.next?.next?.v ?? -1)`);
        return;
      }
      case 2: {
        const u = this.fresh("u");
        this.out.push(r.chance(0.5) ? `const ${u}: U = { tag: "p", p: ${this.int(1)} }\nprint(show(${u}))` : `const ${u}: U = { tag: "q", q: ${this.str(1)} }\nprint(show(${u}))`);
        return;
      }
      case 3: {
        if (!this.lists.length) return;
        const l = r.pick(this.lists);
        this.out.push(`print(${l}.pop() ?? -100)\nprint(${l}.length)`);
        return;
      }
      case 4: {
        if (!this.lists.length) return;
        const l = r.pick(this.lists);
        const v = this.fresh("sp");
        this.out.push(`const ${v} = [...${l}, ${this.int(1)}] + ${l}\nprint(${v}.length)\nprint(sum(${v}))`);
        this.lists.push(v);
        return;
      }
      case 5: {
        const s = this.str(1);
        const c = this.fresh("cs");
        this.out.push(`let ${c} = 0\nfor ch in ${s} { ${c} = ${c} * 31 + ch }\nprint(${c})`);
        return;
      }
      case 6: {
        const x = this.int(1);
        this.out.push(`print(match ${x} { 0 => "zero", 1 | 2 => "small", _ => "other" })`);
        return;
      }
      case 7: {
        if (!this.lists.length) return;
        this.out.push(`print(firstOver(${r.pick(this.lists)}, ${this.int(1)}))`);
        return;
      }
      case 8: {
        const v = this.fresh("sh");
        this.out.push(`const ${v} = ${this.int(1)}\n{\n  const ${v} = ${this.int(1)} + 1\n  print(${v})\n}\nprint(${v})`);
        return;
      }
      case 9: {
        const a = this.fresh("mr");
        this.out.push(`const ${a} = mk(${this.int(1)})\nprint(${a}.b)\nprint(${a} == mk(${a}.a))\n${a}.xs.push(1)\nprint(${a} == mk(${a}.a))`);
        this.recs.push(a);
        return;
      }
      case 10: {
        if (!this.lets.length) return;
        const v = r.pick(this.lets);
        const g = this.fresh("g");
        this.out.push(`const ${g} = (k: i32): i32 => ${v} + k\n${v} = ${this.int(1)}\nprint(${g}(${this.int(0)}))`);
        return;
      }
      default: {
        const mm = this.fresh("mm");
        this.out.push(`const ${mm}: {[string]: R} = Map()\n${mm}["k"] = mk(${this.int(1)})\nconst q${this.n++} = ${mm}["k"]\nif q${this.n - 1} != null { q${this.n - 1}.a = q${this.n - 1}.a + 1 }\nprint((${mm}["k"] ?? mk(0)).a)`);
      }
    }
  }

  program(): string {
    const ns = 6 + this.r.int(12);
    for (let i = 0; i < ns; i++) this.stmt();
    for (const v of this.ints) this.out.push(`print(${v})`);
    for (const l of this.lists) this.out.push(`print(sum(${l}))`);
    return [...HEAD, ...this.out].join("\n") + "\n";
  }
}

if (import.meta.main) {
  const args = Deno.args;
  const dir = args[0];
  const flag = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const seed = Number(flag("--seed", "1")), count = Number(flag("--count", "200"));
  Deno.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    const g = new Gen(new Rng(seed * 200003 + i));
    Deno.writeTextFileSync(`${dir}/da_s${seed}_${String(i).padStart(4, "0")}.vl`, g.program());
  }
}
