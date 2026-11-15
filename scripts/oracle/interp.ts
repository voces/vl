// A definitional interpreter for the VL subset in syntax.ts. Plain dynamic values, no
// representation decisions; each rule cites the spec section it implements. Three ways a
// run ends besides normal output: `Trap` (the spec says the program traps), `TypeFault`
// (a value reached a place its type forbids, so the checker accepted an unsound program
// or this interpreter is wrong) and `Unsupported` (outside the subset: no verdict).

import { Expr, FnDecl, parse, Stmt, Ty, Unsupported } from "./syntax.ts";

export class Trap extends Error {}
export class TypeFault extends Error {}
// A constant that cannot take the width the oracle gave it. The checker types a literal
// from its later uses (T2.5, D3246), which a dynamic oracle cannot see, so this is no verdict.
export class LitFault extends Unsupported {}

// ── values ─────────────────────────────────────────────────────────────────────────
// i32 = JS number, i64 = bigint, f64/f32 = Flt, exact constant (E9.1, T2.4) = Lit.
export class Flt { constructor(public v: number, public w: 32 | 64) {} }
// A float constant also carries its exact rational value `q` while it has one (E9.1).
// `radix` is 0, or the pattern width of the widest radix literal in the tree (32 or 64, T2.3).
// `wideDec`: the tree holds a decimal literal outside i32, which makes a radix tree i64-wide.
// `join`: the value of an `if` whose arms are constants. It adopts its use's type like a constant
// but is no part of an exact tree, since E9.1 does not list `if`.
export class Lit {
  wideDec = false;
  join = false;
  derived = false; // computed by an operator, not written
  lone = false; // a radix literal as written, not a tree of them (owner ruling 4.1 is about these)
  // A radix tree whose value depends on its width and that no use has fixed yet carries its
  // 64-bit reading too: `i` is the 32-bit one (ruling A: it computes at the use's width).
  w64: bigint | null = null;
  trap64 = false; // its 64-bit reading divides by zero
  arm: Expr | null = null; // a join's taken float constant arm, for an f32 peer to fold again (Q9)

  constructor(public i: bigint | null, public f: number | null, public radix: number | boolean, public q: [bigint, bigint] | null = null) {}
}
export class Rec { constructor(public f: Map<string, Val>) {} }

// The f32 nearest the integer `n`, ties to even, rounded once (a double first would round twice).
function bigToF32(n: bigint): number {
  const m = n < 0n ? -n : n;
  if (m < 1n << 53n) return Math.fround(Number(n));
  const sh = BigInt(m.toString(2).length - 24), q = m >> sh, r = m - (q << sh), half = 1n << (sh - 1n);
  const up = r > half || (r === half && (q & 1n) === 1n);
  const v = Math.fround(Number((up ? q + 1n : q) << sh));
  return n < 0n ? -v : v;
}

// The 64-bit reading of an integer constant: its `w64` when the tree depends on its width.
function v64(l: Lit): bigint {
  if (l.trap64) throw new Trap("integer divide by zero");
  return l.w64 ?? l.i!;
}
function widthDep(l: Lit): boolean { return l.w64 !== null || l.trap64; }

// A read of a decimal `const` is its value written in place (T2.4), so its width is the value's,
// not its spelling's; a radix tree's read computes the tree at its own use (D14990), so it keeps it.
function constRead(l: Lit): Lit {
  if (l.radix || l.i === null || !l.wideDec) return l;
  const c = new Lit(l.i, l.f, l.radix, l.q);
  c.join = l.join;
  c.derived = l.derived;
  c.wideDec = l.i < BigInt(I32_MIN) || l.i > BigInt(I32_MAX);
  return c;
}
export class VMap { m = new Map<string, [Val, Val]>(); }
export class VSet { m = new Map<string, Val>(); }
// The type a container was built at (ruling 4.4): set where it is first delivered at a declared
// type; `is` on an empty container reads it.
const builtAt = new WeakMap<object, { t: Ty; env: Env }>();
export class Fn { constructor(public decl: FnDecl, public env: Env) {} }
export class Bi { constructor(public name: string, public call: (args: Val[], ctx: Interp) => Val) {} }
export const VOID = Symbol("void");
export type Val = number | bigint | Flt | Lit | boolean | string | null | Val[] | Rec | VMap | VSet | Fn | Bi | typeof VOID;

class Ret { constructor(public v: Val) {} }
class Brk { constructor(public label: string | null) {} }
class Cont { constructor(public label: string | null) {} }
class NullOut {} // a bare `as` that failed: the enclosing function returns null (E8.2)

// `tree`: an un-annotated `const`'s float constant tree, folded again at each read's use type (E9.1).
type Box = { v: Val; ty: Ty | null; mut: boolean; tree?: Expr };
type TyDef = { params: string[]; ty: Ty };

export class Env {
  vars = new Map<string, Box>();
  types = new Map<string, TyDef | "param">();
  fns = new Map<string, Fn[]>(); // overloads by first-parameter type (E11.4 O1)
  constructor(public parent: Env | null) {}
  lookup(n: string): Box | null {
    return this.vars.get(n) ?? this.parent?.lookup(n) ?? null;
  }
  lookupFns(n: string): Fn[] | null {
    return this.fns.get(n) ?? this.parent?.lookupFns(n) ?? null;
  }
  lookupTy(n: string): TyDef | "param" | null {
    return this.types.get(n) ?? this.parent?.lookupTy(n) ?? null;
  }
}

const I32_MIN = -2147483648, I32_MAX = 2147483647;
const I64_MIN = -(1n << 63n), I64_MAX = (1n << 63n) - 1n;
const NUMERIC = new Set(["i32", "i64", "f64", "f32", "u8", "u16", "u32", "i8", "i16"]);
const WIDENS: Record<string, string[]> = { i32: ["i64", "f64"], f32: ["f64"] };
const ANY: Ty = { k: "name", name: "any", args: [] };

export function show(v: Val): string {
  if (v === null) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  if (v instanceof Flt) return String(v.v);
  if (v instanceof Lit) return v.i !== null ? String(v.i) : String(v.f);
  if (Array.isArray(v)) return "[" + v.map(show).join(", ") + "]";
  if (v instanceof Rec) return "{" + [...v.f].map(([k, x]) => k + ": " + show(x)).join(", ") + "}";
  if (v instanceof VMap) return "Map{" + [...v.m.values()].map(([k, x]) => show(k) + ": " + show(x)).join(", ") + "}";
  if (v instanceof VSet) return "Set{" + [...v.m.values()].map(show).join(", ") + "}";
  if (v === VOID) return "void";
  return "<function>";
}
function showTy(t: Ty): string {
  switch (t.k) {
    case "name": return t.name + (t.args.length ? "<" + t.args.map(showTy).join(", ") + ">" : "");
    case "list": return showTy(t.el) + "[]";
    case "map": return "{[" + showTy(t.key) + "]: " + showTy(t.val) + "}";
    case "union": return t.arms.map(showTy).join(" | ");
    case "rec": return "{" + t.fields.map((f) => f.name + (f.opt ? "?" : "") + ": " + showTy(f.ty)).join(", ") + "}";
    case "fn": return "(" + t.params.map(showTy).join(", ") + ") => " + showTy(t.ret);
    case "lit": return typeof t.v === "string" ? JSON.stringify(t.v) : String(t.v);
    case "null": return "null";
  }
}

// ── numbers ────────────────────────────────────────────────────────────────────────

function numKind(v: Val): string | null {
  if (typeof v === "number") return "i32";
  if (typeof v === "bigint") return "i64";
  if (v instanceof Flt) return v.w === 64 ? "f64" : "f32";
  return null;
}
function wrap32(x: bigint): number { return Number(BigInt.asIntN(32, x)); }
function wrap64(x: bigint): bigint { return BigInt.asIntN(64, x); }

// A constant at the numeric type `k` (T2.1-T2.4, E9.1). Out of range is a checker refusal
// the program should never have passed, so it is a TypeFault.
// Ruling 4.1: an integer constant at a float the float cannot hold exactly is refused.
function intAtFloat(x: bigint, n: number, k: string): number {
  if (!Number.isFinite(n) || BigInt(n) !== x) throw new LitFault(`literal typed from uses: constant ${x} is not exact at ${k}`);
  return n;
}
// E9.1: a finite constant past f32's largest finite value is refused; an infinity stays one.
function f32Finite(f: number, r: number): number {
  if (Number.isFinite(f) && !Number.isFinite(r)) throw new LitFault(`literal typed from uses: constant ${f} overflows f32`);
  return r;
}
function litTo(l: Lit, k: string): Val {
  if (l.i !== null) {
    const x = l.i;
    switch (k) {
      case "i32":
        // T2.3/E9.1: a radix tree is a bit pattern at the use's width; a ring operator commutes
        // with wrapping, so wrapping the exact value is the same as computing at the width.
        // T2.3: a pattern wider than 32 bits is i64, which an i32 does not hold.
        if (l.radix === 64) throw new LitFault(`literal typed from uses: a pattern wider than 32 bits at i32`);
        if (l.radix) return wrap32(x);
        if (l.join && l.derived) return wrap32(x);
        if (x < BigInt(I32_MIN) || x > BigInt(I32_MAX)) throw new LitFault(`literal typed from uses: constant ${x} overflows i32`);
        return Number(x);
      case "i64":
        if (l.radix || widthDep(l)) return wrap64(v64(l));
        // A tree over a literal join is no constant (E9.1 does not list `if`): it wraps.
        if (l.join) return wrap64(x);
        if (x < I64_MIN || x > I64_MAX) throw new LitFault(`literal typed from uses: constant ${x} overflows i64`);
        return x;
      case "f64":
        if (l.radix && l.lone) return radixFloat(x, 64, false);
        if (l.radix) return new Flt(Number(wrap64(v64(l))), 64); // ruling 4.2: a radix tree computes at 64 bits
        return new Flt(intAtFloat(x, Number(x), "f64"), 64);
      case "f32":
        if (l.radix && l.lone) return radixFloat(x, 32, false);
        if (l.radix) throw new Unsupported("spec gap: a radix constant tree at f32");
        return new Flt(intAtFloat(x, Math.fround(Number(x)), "f32"), 32);
      case "u8": case "u16": case "u32": case "i8": case "i16": return litTo(l, "i32");
    }
  } else {
    const f = l.f!;
    switch (k) {
      case "f64": return new Flt(f, 64);
      case "f32": return new Flt(f32Finite(f, Math.fround(f)), 32);
      case "i32": case "i64":
        if (!Number.isInteger(f)) throw new LitFault(`literal typed from uses: constant ${f} is not a whole number`);
        return litTo(new Lit(BigInt(f), null, false), k);
    }
  }
  throw new TypeFault(`constant at ${k}`);
}
// T2.3 (owner ruling 4.1): a radix literal in a float context is the value its digits spell.
// At a destination or a peer the float must hold it exactly, as a decimal literal must (D1890);
// only `as f32` / `as f64` rounds. The bit-pattern reading is for integer contexts only.
function radixFloat(u: bigint, w: 32 | 64, round: boolean): Flt {
  const v = w === 32 ? Math.fround(Number(u)) : Number(u);
  if (!round && BigInt(v) !== u) throw new TypeFault(`constant ${u} is not exact at f${w}`);
  return new Flt(v, w);
}
function litDefault(l: Lit): Val {
  if (l.f !== null) return new Flt(l.f, 64);
  const x = l.i!;
  // T2.3: a pattern of 32 bits or fewer is the i32 with those bits; a wider one is i64.
  // T2.3: a tree of patterns of 32 bits or fewer is the i32 with those bits; a wider one is i64.
  if (l.radix) return l.radix === 64 || l.wideDec ? wrap64(v64(l)) : wrap32(x);
  // A tree over a literal join is typed by its arms, not its value, and wraps there.
  if (l.join && l.derived) return l.wideDec ? wrap64(x) : wrap32(x);
  if (x >= BigInt(I32_MIN) && x <= BigInt(I32_MAX)) return Number(x);
  return litTo(l, "i64");
}
function toKind(v: Val, k: string): Val {
  if (v instanceof Lit) return litTo(v, k);
  const vk = numKind(v);
  if (vk === k) return v;
  if (vk === "i32" && k === "i64") return BigInt(v as number);
  if (vk === "i32" && k === "f64") return new Flt(v as number, 64);
  if (vk === "f32" && k === "f64") return new Flt((v as Flt).v, 64);
  throw new TypeFault(`${vk} ${show(v)} meets ${k} (no implicit conversion, T2.6)`);
}
function wider(a: string, b: string): string {
  if (a === b) return a;
  const s = new Set([a, b]);
  if (s.has("i32") && s.has("i64")) return "i64";
  if (s.has("i32") && s.has("f64")) return "f64";
  if (s.has("f32") && s.has("f64")) return "f64";
  throw new TypeFault(`operator mixes ${a} and ${b} (E2.2)`);
}

// The double nearest n/d (d > 0), ties to even: one rounding, as E9.1 asks.
export function ratToDouble(n: bigint, d: bigint): number {
  if (n === 0n) return 0;
  const neg = n < 0n;
  if (neg) n = -n;
  const bl = (x: bigint) => x.toString(2).length;
  let e = bl(n) - bl(d) - 54;
  let q: bigint, rem: boolean;
  if (e >= 0) { const dd = d << BigInt(e); q = n / dd; rem = n % dd !== 0n; }
  else { const nn = n << BigInt(-e); q = nn / d; rem = nn % d !== 0n; }
  while (q >= (1n << 54n)) { rem = rem || (q & 1n) === 1n; q >>= 1n; e++; }
  const guard = q & 1n;
  q >>= 1n;
  e++;
  if (guard === 1n && (rem || (q & 1n) === 1n)) { q += 1n; if (q === (1n << 53n)) { q >>= 1n; e++; } }
  if (e > 971 || e < -1074) return (neg ? -1 : 1) * (Number(n) / Number(d));
  const v = Number(q) * Math.pow(2, e);
  return neg ? -v : v;
}

// A constant's default type beside another constant: a radix pattern of 32 bits beside a decimal
// whose default is i64 is read at i64, its peer's width (T2.3).
function pairDefault(l: Lit, other: Lit): Val {
  const d = litDefault(l);
  // T2.3: a pattern beside a constant whose default is i64, radix or decimal, is zero-extended.
  if (l.radix === 32 && !l.wideDec && other.i !== null && numKind(litDefault(other)) === "i64") return litTo(l, "i64");
  // a constant whose value depends on its width (`(-1) >>> 30`) takes that i64 too
  if (widthDep(l) && other.i !== null && numKind(litDefault(other)) === "i64") return litTo(l, "i64");
  return d;
}

function asJoin(l: Lit): Lit {
  const j = new Lit(l.i, l.f, l.radix, l.q);
  j.wideDec = l.wideDec;
  j.w64 = l.w64;
  j.trap64 = l.trap64;
  j.join = true;
  return j;
}

// A shift of a constant by a run-time count: no constant, but typed as one toward its use (Q8).
function constShift(e: Expr): boolean {
  return e.k === "bin" && ["<<", ">>", ">>>"].includes(e.op) && constLike(e.l) && !isConstTree(e.r);
}

// A constant-left shift, or `-`/`~` over one: typed as a constant toward its use (Q8, 4.2).
function shiftTree(e: Expr): boolean {
  return constShift(e) || (e.k === "un" && (e.op === "-" || e.op === "~") && shiftTree(e.e));
}

// A tree whose leaves are constants, constant-left shifts and literal joins of such trees: no
// constant (a join is not, E9.1), but typed as one toward its use (4.3, Q8, T2.4).
function constLike(e: Expr): boolean {
  if (isConstTree(e) || shiftTree(e)) return true;
  if (e.k === "un") return (e.op === "-" || e.op === "~") && constLike(e.e);
  if (e.k === "bin") return ["+", "-", "*", "&", "|", "^", "<<", ">>", ">>>"].includes(e.op) && constLike(e.l) && (constLike(e.r) || ["<<", ">>", ">>>"].includes(e.op));
  if (e.k === "if") {
    const tail = (b: Stmt[] | null) => { const t = b && b.length ? b[b.length - 1] : null; return !!t && t.k === "expr" && constLike(t.e); };
    return tail(e.t) && tail(e.f);
  }
  return false;
}

function isConstTree(e: Expr): boolean {
  if (isNumLit(e)) return true;
  if (e.k === "un") return (e.op === "-" || e.op === "~") && isConstTree(e.e);
  return e.k === "bin" && ["+", "-", "*", "/", "%", "&", "|", "^", "<<", ">>", ">>>"].includes(e.op) && isConstTree(e.l) && isConstTree(e.r);
}

function negatedRadix(e: Expr): boolean {
  if (e.k === "un" && e.op === "-") return negatedRadix(e.e);
  return e.k === "int" && !!e.radix;
}

// Whether a constant tree holds a radix literal, or a float literal.
function treeHas(e: Expr, what: "radix" | "float"): boolean {
  if (e.k === "int") return what === "radix" && !!e.radix;
  if (e.k === "float") return what === "float";
  if (e.k === "un") return treeHas(e.e, what);
  return e.k === "bin" && (treeHas(e.l, what) || treeHas(e.r, what));
}
const F64_TY: Ty = { k: "name", name: "f64", args: [] };
const I64_TY: Ty = { k: "name", name: "i64", args: [] };

function litHolds(l: Lit, k: string): boolean {
  if (l.i === null) return k === "f64" || k === "f32";
  if (l.radix) return k !== "i32" || (l.radix === 32 && !l.wideDec);
  if (k === "i32") return l.i >= BigInt(I32_MIN) && l.i <= BigInt(I32_MAX);
  if (k === "i64") return l.i >= I64_MIN && l.i <= I64_MAX;
  return true;
}

// Owner ruling 4.3 (T3.6): a literal joined with a typed numeric value adopts that type when it
// fits: an integer literal when the type holds it exactly, a float literal at f32 or f64.
function joinFits(l: Lit, k: string): boolean {
  if (!litHolds(l, k)) return false;
  if (l.i === null || l.radix || (k !== "f32" && k !== "f64")) return true;
  const n = k === "f32" ? Math.fround(Number(l.i)) : Number(l.i);
  return Number.isFinite(n) && BigInt(n) === l.i;
}

export function parseRat(s: string): [bigint, bigint] {
  const m = /^([0-9]*)(?:\.([0-9]*))?(?:[eE]([-+]?[0-9]+))?$/.exec(s)!;
  const frac = m[2] ?? "", exp = Number(m[3] ?? "0") - frac.length;
  const digits = BigInt((m[1] || "0") + frac);
  return exp >= 0 ? [digits * 10n ** BigInt(exp), 1n] : [digits, 10n ** BigInt(-exp)];
}

// True while the constant tree initialising a binding annotated `f32` is evaluated (E9.1).
let f32Fold = false

// Filed defects whose compiled reading the oracle reproduces when asked (`oracle.ts diff` asks,
// to tell a disagreement a filed row explains from a new one). Empty for every other run.
export const emulating = new Set<string>();

// E9.1 / ruling 4.2: a radix constant is a bit pattern at its use's width under every operator.
// The width is 64 at an i64 or f64 use, 32 at an i32 one, and with no use the tree's default
// (T2.3). Ring operators commute with wrapping, so only these need the width before they run.
function radixWidth(op: string, a: Lit, b: Lit, expK: string | null): 32 | 64 {
  if (expK === "i64" || expK === "f64") return 64;
  if (expK === "f32") throw new Unsupported("spec gap: a radix constant tree at f32");
  // Q8: a constant shift count of 32 to 63 makes the untyped left operand i64, beside a peer
  // too (an i32 destination refuses it at check, E6.2).
  if (["<<", ">>", ">>>"].includes(op) && b.i !== null && b.i >= 32n && b.i <= 63n) return 64;
  if (expK) return 32;
  return a.radix === 64 || b.radix === 64 || a.wideDec || b.wideDec ? 64 : 32;
}
function radixAtWidth(op: string, a: Lit, b: Lit, expK: string | null): Lit {
  const w = radixWidth(op, a, b, expK);
  const at = (w: 32 | 64, p: bigint, q: bigint): bigint => {
    const W = BigInt(w), x = BigInt.asIntN(w, p), y = BigInt.asIntN(w, q), n = y & (W - 1n);
    if ((op === "/" || op === "%") && y === 0n) throw new Trap("integer divide by zero");
    if (op === "/" && y === -1n && x === -(1n << (W - 1n))) throw new Trap("integer overflow");
    const r = op === "/" ? x / y : op === "%" ? x % y : op === "&" ? x & y : op === "|" ? x | y : op === "^" ? x ^ y
      : op === "<<" ? x << n : op === ">>" ? x >> n : BigInt.asUintN(w, x) >> n;
    return BigInt.asIntN(w, r);
  };
  // A shift count is typed by itself, never by the left operand (Q8): it keeps its own reading.
  const shift = op === "<<" || op === ">>" || op === ">>>";
  const cnt = (): bigint => b.radix === 64 || b.wideDec ? v64(b) : b.i!;
  const q64 = (): bigint => shift ? cnt() : v64(b);
  // T2.3: a leaf wider than 32 bits is i64, so an i32 use cannot hold the tree.
  if (expK === "i32" && (a.radix === 64 || (!shift && b.radix === 64))) throw new LitFault("literal typed from uses: a pattern wider than 32 bits at i32");
  const l = new Lit(w === 64 ? at(64, v64(a), q64()) : at(32, a.i!, b.i!), null, w);
  l.derived = true;
  // No use has fixed the width: keep the 64-bit reading for a use that turns out to be i64.
  if (w === 32 && !expK) {
    try {
      const r = at(64, v64(a), q64());
      if (r !== l.i) l.w64 = r;
    } catch (x) {
      if (!(x instanceof Trap)) throw x;
      l.trap64 = true;
    }
  }
  return l;
}

function litArith(op: string, a: Lit, b: Lit, expK: string | null = null): Val {
  // a radix literal meeting a float constant is the value its digits spell (T2.3); a radix tree
  // beside that f64 computes at 64 bits (ruling 4.2)
  const atFloat = (x: Lit) => x.lone ? radixFloat(x.i!, 64, false) : new Flt(Number(wrap64(v64(x))), 64);
  if ((a.f !== null && b.radix) || (b.f !== null && a.radix)) return arith(op, a.radix ? atFloat(a) : a, b.radix ? atFloat(b) : b);
  if (a.i !== null && b.i !== null) {
    const x = a.i, y = b.i, radix = Math.max(Number(a.radix), Number(b.radix));
    const L = (r: bigint) => { const l = new Lit(r, null, radix); l.wideDec = a.wideDec || b.wideDec; return l; };
    // A ring operator commutes with wrapping, so it carries an operand's 64-bit reading through.
    const ring = (f: (p: bigint, q: bigint) => bigint): Lit => {
      const l = L(f(x, y));
      if (widthDep(a) || widthDep(b)) {
        try { const r = f(v64(a), v64(b)); if (r !== l.i) l.w64 = r; } catch (t) { if (!(t instanceof Trap)) throw t; l.trap64 = true; }
      }
      return l;
    };
    switch (op) {
      case "+": return ring((p, q) => p + q);
      case "-": return ring((p, q) => p - q);
      case "*": return ring((p, q) => p * q);
      // the checker refuses a decimal tree's zero divisor; what reaches here runs, and traps (T1.2);
      // a radix tree's divisor is read at its width, which may make it zero (ruling A)
      // D2.3: a constant integer division by zero has no value, so it is refused, radix or not.
      case "/": if (y === 0n) throw new TypeFault("division by zero in a constant expression"); if (radix) return radixAtWidth(op, a, b, expK); return L(x / y);
      case "%": if (y === 0n) throw new TypeFault("division by zero in a constant expression"); if (radix) return radixAtWidth(op, a, b, expK); return L(x % y);
      case "&": case "|": case "^": case "<<": case ">>": case ">>>":
        if (radix) return radixAtWidth(op, a, b, expK);
        if (op === "&") return L(x & y);
        if (op === "|") return L(x | y);
        if (op === "^") return L(x ^ y);
        if (op === "<<") return L(x << y);
        if (op === ">>") return L(x >> y);
        // `>>>` of a non-negative constant is `>>`; of a negative one it needs a width: i64 at an
        // i64 use or under Q8's count of 32 to 63, else the default.
        if (x >= 0n) return L(x >> y);
        if (expK === "i64" || (y >= 32n && y <= 63n)) return arith(">>>", litTo(a, "i64"), litDefault(b));
        if (expK || a.wideDec || y < 0n || y > 31n) return arith(">>>", litDefault(a), litDefault(b));
        // No use has fixed the width: the 32-bit reading, with the 64-bit one for an i64 use.
        { const l = L(BigInt.asIntN(32, BigInt.asUintN(32, x) >> y)), r = BigInt.asUintN(64, x) >> y; if (r !== l.i) l.w64 = r; return l; }
    }
  } else {
    // E9.1 (owner ruling 2026-11-15): a float constant folds in IEEE, as at run time; an integer
    // operand converts to the nearest double first. JS numbers are IEEE doubles, `%` is `fmod`.
    // A tree used at `f32` folds in f32 arithmetic instead (`expK`, or `f32Fold` at a binding).
    const at = f32Fold || expK === "f32" ? (v: number) => f32Finite(v, Math.fround(v)) : (v: number) => v;
    const x = at(a.f ?? Number(a.i)), y = at(b.f ?? Number(b.i));
    switch (op) {
      case "+": return new Lit(null, at(x + y), false);
      case "-": return new Lit(null, at(x - y), false);
      case "*": return new Lit(null, at(x * y), false);
      case "/": return new Lit(null, at(x / y), false);
      case "%": return new Lit(null, at(x % y), false);
    }
  }
  throw new TypeFault(`operator ${op} on constants`);
}

// `expK` is the numeric destination, when there is one. A constant that does not fit its typed
// peer computes at a wider destination instead, the peer widened (DECISIONS D3043: an i64
// binding, return, argument or operator peer adopts the literal tree).
function arith(op: string, a: Val, b: Val, expK: string | null = null): Val {
  if (a instanceof Lit && b instanceof Lit && (a.join || b.join)) {
    // A literal join beside a constant, with no use yet, stays an untyped join: the tree is typed
    // where it is used, as a constant tree is (4.3, one rule for every join form).
    // Only a ring operator commutes with wrapping, so only it may run before the join is typed.
    if (!expK && a.join !== b.join && ["+", "-", "*"].includes(op)) {
      const r = litArith(op, a, b, null);
      if (r instanceof Lit) { r.join = true; r.derived = true; return r; }
    }
    // Q8: a constant count of 32 to 63 makes a constant left, a literal join among them, i64.
    if (["<<", ">>", ">>>"].includes(op) && b.i !== null && b.i >= 32n && b.i <= 63n && !expK) return arith(op, litTo(a, "i64"), litDefault(b));
    const at = (l: Lit, o: Lit) => expK && litHolds(l, expK) ? litTo(l, expK) : pairDefault(l, o);
    return arith(op, at(a, b), at(b, a));
  }
  if (a instanceof Lit && b instanceof Lit) return litArith(op, a, b, expK);
  let ka = a instanceof Lit ? null : numKind(a), kb = b instanceof Lit ? null : numKind(b);
  // D3043: with no destination, an integer constant that does not fit its `i32` peer is `i64`.
  if (!expK && (ka === null) !== (kb === null)) {
    const lit = (a instanceof Lit ? a : b) as Lit;
    // A tree over a literal join is typed by its arms, not its value (E9.1 does not list `if`).
    const joinTyped = lit.join && lit.derived && !lit.wideDec;
    if ((ka ?? kb) === "i32" && lit.i !== null && !joinTyped && !litHolds(lit, "i32") && !["<<", ">>", ">>>"].includes(op)) expK = "i64";
  }
  if (expK && (ka === null) !== (kb === null)) {
    const peer = (ka ?? kb)!, lit = (a instanceof Lit ? a : b) as Lit;
    if (peer !== expK && WIDENS[peer]?.includes(expK) && !litHolds(lit, peer)) {
      a = toKind(a, expK);
      b = toKind(b, expK);
      ka = kb = expK;
    }
  }
  if ((ka === null && !(a instanceof Lit)) || (kb === null && !(b instanceof Lit))) {
    throw new TypeFault(`operator ${op} on ${show(a)} and ${show(b)}`);
  }
  // E2.1: a literal operand adapts to the other operand; shifts adapt the count to the value.
  // A float constant meeting an integer operand computes at f64 (E2.2 with T2.2's default).
  const floatLit = (v: Val) => v instanceof Lit && v.f !== null;
  const k = ka === "i32" && floatLit(b) ? "f64" : kb === "i32" && floatLit(a) ? "f64" : ka && kb ? (["<<", ">>", ">>>"].includes(op) ? ka : wider(ka, kb)) : (ka ?? kb)!;
  // Q8 leaves a literal-join shift count's width beside a typed left open: the compiler reads a
  // join at its own default and a bare tree at the left's width, so a join whose readings differ is
  // a spec gap here.
  if (["<<", ">>", ">>>"].includes(op) && b instanceof Lit && b.join && b.i !== null && ka === "i64") {
    const d = litDefault(b);
    if (BigInt(d as number | bigint) !== wrap64(v64(b))) throw new Unsupported("spec gap: a literal-join shift count's width beside a typed i64 (Q8)");
  }
  const cnt = b;
  const x = toKind(a, k), y = ["<<", ">>", ">>>"].includes(op) ? toKind(cnt, k === "i64" ? (kb === "i32" || numKind(cnt) === "i32" ? "i32" : "i64") : k) : toKind(b, k);
  if (k === "i32") {
    const p = x as number, q = y as number;
    switch (op) {
      case "+": return (p + q) | 0;
      case "-": return (p - q) | 0;
      case "*": return Math.imul(p, q);
      case "/": if (q === 0) throw new Trap("integer divide by zero"); if (p === I32_MIN && q === -1) throw new Trap("integer overflow"); return Math.trunc(p / q) | 0;
      case "%": if (q === 0) throw new Trap("integer divide by zero"); if (q === -1) return 0; return p % q | 0;
      case "&": return p & q;
      case "|": return p | q;
      case "^": return p ^ q;
      case "<<": return p << (q & 31);
      case ">>": return p >> (q & 31);
      case ">>>": return (p >>> (q & 31)) | 0;
    }
  } else if (k === "i64") {
    const p = x as bigint, q = typeof y === "number" ? BigInt(y) : y as bigint;
    switch (op) {
      case "+": return wrap64(p + q);
      case "-": return wrap64(p - q);
      case "*": return wrap64(p * q);
      case "/": if (q === 0n) throw new Trap("integer divide by zero"); if (p === I64_MIN && q === -1n) throw new Trap("integer overflow"); return wrap64(p / q);
      case "%": if (q === 0n) throw new Trap("integer divide by zero"); if (q === -1n) return 0n; return p % q;
      case "&": return p & q;
      case "|": return p | q;
      case "^": return p ^ q;
      case "<<": return wrap64(p << (q & 63n));
      case ">>": return p >> (q & 63n);
      case ">>>": return wrap64(BigInt.asUintN(64, p) >> (q & 63n));
    }
  } else {
    const p = (x as Flt).v, q = (y as Flt).v, w = (x as Flt).w;
    const F = (r: number) => new Flt(w === 32 ? Math.fround(r) : r, w);
    switch (op) {
      case "+": return F(p + q);
      case "-": return F(p - q);
      case "*": return F(p * q);
      case "/": return F(p / q);
      case "%": return F(p % q);
    }
  }
  throw new TypeFault(`operator ${op} at ${k}`);
}

function compare(op: string, a: Val, b: Val): boolean {
  if (typeof a === "string" && typeof b === "string") {
    const c = cmpCodePoints(a, b);
    return op === "<" ? c < 0 : op === "<=" ? c <= 0 : op === ">" ? c > 0 : c >= 0;
  }
  let x: number | bigint, y: number | bigint;
  // A comparison is not a constant operator (E9.1): each side takes its default type first,
  // which is also where a radix constant becomes its i32 bit pattern.
  if (a instanceof Lit && b instanceof Lit) return compare(op, pairDefault(a, b), pairDefault(b, a));
  {
    const k = a instanceof Lit ? numKind(b) : b instanceof Lit ? numKind(a) : wider(numKind(a) ?? "?", numKind(b) ?? "?");
    if (!k) throw new TypeFault(`comparison on ${show(a)} and ${show(b)}`);
    const p = toKind(a, k), q = toKind(b, k);
    x = p instanceof Flt ? p.v : p as number | bigint;
    y = q instanceof Flt ? q.v : q as number | bigint;
  }
  switch (op) {
    case "<": return x < y;
    case "<=": return x <= y;
    case ">": return x > y;
    default: return x >= y;
  }
}
function cmpCodePoints(a: string, b: string): number {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

// E3.1: `==` on lists and records compares contents.
function equal(a: Val, b: Val): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  const na = a instanceof Lit || numKind(a), nb = b instanceof Lit || numKind(b);
  if (na && nb) {
    if (a instanceof Lit && b instanceof Lit) return equal(pairDefault(a, b), pairDefault(b, a));
    const k = a instanceof Lit ? numKind(b)! : b instanceof Lit ? numKind(a)! : wider(numKind(a)!, numKind(b)!);
    const p = toKind(a, k), q = toKind(b, k);
    return p instanceof Flt ? p.v === (q as Flt).v : p === q;
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (a instanceof Rec && b instanceof Rec) {
    if (a.f.size !== b.f.size) return false;
    for (const [k, v] of a.f) { if (!b.f.has(k) || !equal(v, b.f.get(k)!)) return false; }
    return true;
  }
  if (na || nb || Array.isArray(a) || Array.isArray(b) || a instanceof Rec || b instanceof Rec) return false;
  throw new TypeFault(`== on ${show(a)} and ${show(b)}`);
}

function keyOf(v: Val): string {
  if (v instanceof Lit) v = litDefault(v);
  if (typeof v === "string") return "s" + v;
  if (typeof v === "number") return "n" + v;
  if (typeof v === "bigint") return "n" + v;
  if (typeof v === "boolean") return "b" + v;
  if (v === null) return "null";
  if (v instanceof Flt) return "f" + v.v;
  if (Array.isArray(v)) return "[" + v.map(keyOf).join(",") + "]";
  if (v instanceof Rec) return "{" + [...v.f].map(([k, x]) => k + ":" + keyOf(x)).join(",") + "}";
  throw new TypeFault("map key " + show(v));
}

const utf8 = new TextEncoder();
const utf8d = new TextDecoder("utf-8", { fatal: true });
function bytes(s: string): Uint8Array { return utf8.encode(s); }

// ── the interpreter ────────────────────────────────────────────────────────────────

export class Interp {
  out: string[] = [];
  steps = 0;
  depth = 0;
  constructor(public fuel = 5_000_000) {}

  tick() { if (++this.steps > this.fuel) throw new Unsupported("fuel exhausted (oracle step budget)"); }

  // ── types: resolution, conformance, delivery ──
  resolve(t: Ty, env: Env, seen = 0): Ty {
    if (t.k !== "name") return t;
    if (NUMERIC.has(t.name) || ["boolean", "string", "void", "never", "any", "unknown"].includes(t.name)) return t;
    if (t.name === "Set") return t;
    const d = env.lookupTy(t.name);
    if (d === "param") return ANY;
    if (!d) throw new Unsupported("unknown type " + t.name);
    if (seen > 50) throw new Unsupported("alias depth");
    // T9.4: an alias's parameters are substituted by its arguments, or erased to `any`.
    if (!d.params.length) return this.resolve(d.ty, env, seen + 1);
    const m = new Map(d.params.map((p, i) => [p, t.args[i] ?? ANY]));
    return this.resolve(subst(d.ty, m), env, seen + 1);
  }
  withParams(env: Env, ps: string[]): Env {
    const e = new Env(env);
    for (const p of ps) e.types.set(p, "param");
    return e;
  }

  // T3.4: whether the value fits the type. `memo` breaks cycles through recursive types.
  // `exact` is the `is` test: a record's field set must be the type's (OPEN-QUESTIONS Q2, today's
  // behaviour and its recommendation (b)); a delivery allows extra fields (T4.6).
  fits(v: Val, t: Ty, env: Env, memo = new Set<unknown>(), exact = false): boolean {
    t = this.resolve(t, env);
    switch (t.k) {
      case "name":
        switch (t.name) {
          case "any": case "unknown": return true;
          case "never": return false;
          case "void": return v === VOID;
          case "boolean": return typeof v === "boolean";
          case "string": return typeof v === "string";
          case "i32": return typeof v === "number" || (v instanceof Lit && v.i !== null && v.i >= BigInt(I32_MIN) && v.i <= BigInt(I32_MAX));
          case "u8": return typeof v === "number" && v >= 0 && v <= 255;
          case "i64": return typeof v === "bigint" || (v instanceof Lit && v.i !== null);
          case "f64": return (v instanceof Flt && v.w === 64) || (v instanceof Lit && v.f !== null);
          case "f32": return v instanceof Flt && v.w === 32;
          case "Set": return v instanceof VSet;
        }
        throw new Unsupported("type " + t.name);
      case "null": return v === null;
      case "lit":
        if (typeof t.v === "bigint") return ((typeof v === "number" || typeof v === "bigint") && BigInt(v) === t.v) || (v instanceof Lit && v.i === t.v);
        if (typeof t.v === "string" && t.v.startsWith("\u0000float:")) return v instanceof Flt && v.v === Number(t.v.slice(7));
        return v === t.v;
      case "union": return t.arms.some((a) => this.fits(v, a, env, memo, exact));
      case "list": {
        if (!Array.isArray(v)) return false;
        const key = [v, t];
        if ([...memo].some((m) => (m as unknown[])[0] === v && (m as unknown[])[1] === t)) return true;
        memo.add(key);
        return v.every((x) => this.fits(x, t.el, env, memo, exact));
      }
      case "map":
        if (!(v instanceof VMap)) return false;
        return [...v.m.values()].every(([k, x]) => this.fits(k, t.key, env, memo, exact) && this.fits(x, t.val, env, memo, exact));
      case "rec": {
        if (!(v instanceof Rec)) return false;
        if ([...memo].some((m) => (m as unknown[])[0] === v && (m as unknown[])[1] === t)) return true;
        memo.add([v, t]);
        // T4.6: extra fields are allowed (width subtyping); a nullable field may be absent (T4.4).
        if (exact && [...v.f.keys()].some((k) => !t.fields.some((f) => f.name === k))) return false;
        return t.fields.every((f) => v.f.has(f.name) ? this.fits(v.f.get(f.name)!, f.ty, env, memo, exact) : (f.opt || this.fits(null, f.ty, env, memo, exact)));
      }
      case "fn": return v instanceof Fn || v instanceof Bi;
    }
  }

  // T3.4 tests the value, but `is` on an empty container decides by the type it was built at
  // (owner ruling 4.4, #8222): its annotation, or the first union arm an empty literal reached.
  // A container never delivered at a declared type is fully open and matches vacuously (D16047).
  isTest(v: Val, t: Ty, env: Env): boolean {
    // a type parameter is erased here, while the compiler tests the instance's type
    if (mentionsParam(t, env)) throw new Unsupported("`is` on a type parameter");
    const r = this.fits(v, t, env, new Set(), true);
    const empty = (Array.isArray(v) && v.length === 0) || ((v instanceof VMap || v instanceof VSet) && v.m.size === 0);
    const built = empty ? builtAt.get(v as object) : undefined;
    if (built) {
      const x = this.resolve(t, env);
      const arms = x.k === "union" ? x.arms : [x];
      const want = this.canonTy(built.t, built.env);
      return arms.some((a) => this.canonTy(a, env) === want);
    }
    return r;
  }

  // A spelling of `t` that two equal types share: aliases resolved, union arms and record fields
  // in sorted order (`string | i32` and `i32 | string` are one type).
  canonTy(t: Ty, env: Env, depth = 0): string {
    if (depth > 20) return showTy(t);
    const r = this.resolve(t, env);
    const c = (x: Ty) => this.canonTy(x, env, depth + 1);
    switch (r.k) {
      case "union": return [...new Set(r.arms.map(c))].sort().join(" | ");
      case "list": return "(" + c(r.el) + ")[]";
      case "map": return "{[" + c(r.key) + "]: " + c(r.val) + "}";
      case "rec": return "{" + r.fields.map((f) => f.name + (f.opt ? "?" : "") + ": " + c(f.ty)).sort().join(", ") + "}";
      case "name": return r.args.length ? r.name + "<" + r.args.map(c).join(", ") + ">" : r.name;
      default: return showTy(r);
    }
  }

  // The arm of the declared type `t` the container `v` is built at: `t` itself, or the first
  // union arm of its kind that holds it.
  containerArm(v: Val, t: Ty, env: Env): Ty | null {
    const r = this.resolve(t, env);
    for (const a of r.k === "union" ? r.arms : [r]) {
      const x = this.resolve(a, env);
      const kind = Array.isArray(v) ? x.k === "list" : v instanceof VMap ? x.k === "map" : v instanceof Rec ? x.k === "rec" : x.k === "name" && x.name === "Set";
      if (kind && this.fits(v, x, env)) return x;
    }
    return null;
  }

  // The numeric member a value delivered to `t` converts to, or null for none (T2.6).
  numTarget(v: Val, t: Ty, env: Env): string | null {
    t = this.resolve(t, env);
    const arms = t.k === "union" ? t.arms.map((a) => this.resolve(a, env)) : [t];
    const names = arms.filter((a) => a.k === "name" && NUMERIC.has(a.name)).map((a) => (a as { name: string }).name);
    const k = v instanceof Lit ? null : numKind(v);
    if (k && names.includes(k)) return null;
    if (v instanceof Lit) {
      const order = v.f !== null ? ["f64", "f32", "i32", "i64"] : ["i32", "i64", "f64", "f32", "u8"];
      for (const o of order) {
        if (!names.includes(o)) continue;
        try { litTo(v, o); return o; } catch { /* try the next member */ }
      }
      return names.length ? names[0] : null;
    }
    if (k === "i32") return names.includes("i64") ? "i64" : names.includes("f64") ? "f64" : null;
    if (k === "f32") return names.includes("f64") ? "f64" : null;
    return null;
  }

  // A delivery: convert per T2.6 (in place for a fresh container), then check the value fits.
  deliver(v: Val, t: Ty | null, env: Env, what: string): Val {
    if (!t) return v instanceof Lit ? litDefault(v) : v;
    v = this.convert(v, t, env);
    if (!this.fits(v, t, env)) throw new TypeFault(`${what}: ${show(v)} does not fit ${showTy(t)}`);
    return v instanceof Lit ? litDefault(v) : v;
  }
  convert(v: Val, t: Ty, env: Env, depth = 0): Val {
    if (depth > 40) return v;
    // the first declared type a container meets is the type it is built at (ruling 4.4)
    if ((Array.isArray(v) || v instanceof VMap || v instanceof VSet || v instanceof Rec) && !builtAt.has(v) && !mentionsParam(t, env)) {
      const arm = this.containerArm(v, t, env);
      if (arm) builtAt.set(v, { t: arm, env });
    }
    const r = this.resolve(t, env);
    const nk = (v instanceof Lit || numKind(v)) ? this.numTarget(v, r, env) : null;
    if (nk) return toKind(v, nk);
    if (v instanceof Lit) return v;
    if (r.k === "union") {
      if (this.fits(v, r, env)) return v;
      for (const a of r.arms) {
        const c = this.convert(v, a, env, depth + 1);
        if (this.fits(c, a, env)) return c;
      }
      return v;
    }
    // A function value delivered to a function type returns that type (T8.3): an unannotated
    // lambda's result is delivered there.
    if (r.k === "fn" && v instanceof Fn && !v.decl.ret) {
      try { this.resolve(r.ret, v.env); return new Fn({ ...v.decl, ret: r.ret }, v.env); } catch { return v; }
    }
    if (r.k === "list" && Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = this.convert(v[i], r.el, env, depth + 1);
    } else if (r.k === "rec" && v instanceof Rec) {
      for (const f of r.fields) if (v.f.has(f.name)) v.f.set(f.name, this.convert(v.f.get(f.name)!, f.ty, env, depth + 1));
    } else if (r.k === "map" && v instanceof VMap) {
      const es = [...v.m.values()];
      v.m.clear();
      for (const [k, x] of es) {
        const ck = this.convert(k, r.key, env, depth + 1);
        v.m.set(keyOf(ck), [ck, this.convert(x, r.val, env, depth + 1)]);
      }
    }
    return v;
  }

  // ── programs ──
  run(src: string): string[] {
    const prog = parse(src);
    const env = new Env(null);
    installBuiltins(env);
    try {
      this.execBlock(prog, env);
    } catch (x) {
      // E8.2: a bare `as` propagates null, which the module's top level has no function to return.
      if (x instanceof NullOut) throw new TypeFault("a bare `as` failed at the top level, where nothing returns its null");
      throw x;
    }
    return this.out;
  }

  hoist(body: Stmt[], env: Env) {
    for (const s of body) {
      if (s.k === "type") env.types.set(s.name, { params: s.params, ty: s.ty });
      if (s.k === "fn") {
        const fn = new Fn(s.fn, env);
        const prev = env.fns.get(s.fn.name) ?? [];
        prev.push(fn);
        env.fns.set(s.fn.name, prev);
      }
      if (s.k === "import") this.importStd(s, env);
    }
  }

  importStd(s: Extract<Stmt, { k: "import" }>, env: Env) {
    const lib = STD[s.from];
    if (!lib) throw new Unsupported("import " + s.from);
    for (const n of s.names) {
      const f = lib[n.name];
      if (!f) throw new Unsupported(`import ${n.name} from ${s.from}`);
      env.vars.set(n.as, { v: new Bi(n.name, f), ty: null, mut: false });
    }
  }

  // S1.1 / E13.1: run the statements; the value is the last expression statement's.
  execBlock(body: Stmt[], env: Env, expLast: Ty | null = null): Val {
    this.hoist(body, env);
    let last: Val = VOID;
    for (let i = 0; i < body.length; i++) {
      const s = body[i];
      last = VOID;
      if (s.k === "expr") last = this.eval(s.e, env, i === body.length - 1 ? expLast : null);
      else this.exec(s, env);
    }
    return last;
  }

  exec(s: Stmt, env: Env): void {
    this.tick();
    switch (s.k) {
      case "let": {
        if (env.vars.has(s.name) && env.vars.get(s.name)!.v !== undefined) {
          // S3.3 refuses a redeclaration in one scope; a hoisted std import is the one exception.
        }
        let v: Val = null;
        if (s.e) {
          f32Fold = !!s.ty && this.foldsAt(s.e, env) && this.isF32(s.ty, env);
          try { v = this.eval(s.e, env, s.ty); } finally { f32Fold = false; }
          // T2.4: an unannotated literal `const` stays an exact constant; a `let` takes i32/f64.
          if (s.ty) v = this.deliver(v, s.ty, env, `binding '${s.name}'`);
          else if (v === VOID) throw new TypeFault(`binding '${s.name}' to a void value`);
        } else if (!s.ty) throw new Unsupported("let without type or initialiser");
        const tree = s.kind === "const" && !s.ty && s.e && isConstTree(s.e) && (treeHas(s.e, "float") || treeHas(s.e, "radix")) ? s.e : undefined;
        env.vars.set(s.name, { v, ty: s.ty, mut: s.kind === "let", tree });
        return;
      }
      case "fn": case "type": case "import": return;
      case "expr": this.eval(s.e, env, null); return;
      case "return": throw new Ret(s.e ? this.eval(s.e, env, this.retTy(env)) : VOID);
      case "break": throw new Brk(s.label);
      case "continue": throw new Cont(s.label);
      case "while": {
        for (;;) {
          this.tick();
          const c = this.eval(s.c, env, null);
          if (typeof c !== "boolean") throw new TypeFault("while-condition " + show(c));
          if (!c) return;
          if (this.loopBody(s.body, env, s.label, null)) return;
        }
      }
      case "forRange": {
        const a = this.asI32(this.eval(s.a, env, null), "range start");
        const b = this.asI32(this.eval(s.b, env, null), "range end");
        const step = s.step ? this.asI32(this.eval(s.step, env, null), "range step") : 1;
        if (step === 0) throw new TypeFault("range step 0");
        for (let i = a; step > 0 ? (s.incl ? i <= b : i < b) : (s.incl ? i >= b : i > b);) {
          this.tick();
          const box = { v: i as Val, ty: null, mut: true };
          if (this.loopBody(s.body, env, s.label, [s.v, box])) return;
          i = this.asI32(box.v, "range variable") + step;
          if (i > I32_MAX || i < I32_MIN) return;
        }
        return;
      }
      case "forIn": {
        const xs = this.eval(s.e, env, null);
        if (Array.isArray(xs)) {
          if (s.v2) throw new Unsupported("for i, x in list");
          for (let i = 0; i < xs.length; i++) {
            if (this.loopBody(s.body, env, s.label, [s.v, { v: num(xs[i]), ty: null, mut: true }])) return;
          }
          return;
        }
        if (xs instanceof VMap) {
          // T7.1: deleting while walking behaves like JS `Map`, so the walk is live.
          for (const [k, v] of xs.m.values()) {
            const vars: [string, Box][] = [[s.v, { v: k, ty: null, mut: false }]];
            if (s.v2) vars.push([s.v2, { v, ty: null, mut: false }]);
            if (this.loopBody(s.body, env, s.label, ...vars)) return;
          }
          return;
        }
        if (typeof xs === "string") {
          for (const ch of xs) {
            if (this.loopBody(s.body, env, s.label, [s.v, { v: ch.codePointAt(0)!, ty: null, mut: false }])) return;
          }
          return;
        }
        if (xs instanceof VSet) throw new Unsupported("for over a set");
        throw new TypeFault("for-in over " + show(xs));
      }
    }
  }

  // One loop iteration in a fresh scope (S5.8). True when the loop ends.
  loopBody(body: Stmt[], env: Env, label: string | null, ...vars: ([string, Box] | null)[]): boolean {
    const e = new Env(env);
    for (const v of vars) if (v) e.vars.set(v[0], v[1]);
    try {
      this.execBlock(body, e);
    } catch (x) {
      if (x instanceof Brk && (x.label === null || x.label === label)) return true;
      if (x instanceof Cont && (x.label === null || x.label === label)) return false;
      throw x;
    }
    return false;
  }

  asI32(v: Val, what: string): number {
    if (v instanceof Lit) v = litTo(v, "i32");
    if (typeof v !== "number") throw new TypeFault(`${what} must be i32, got ${show(v)}`);
    return v;
  }
  asBool(v: Val, what: string): boolean {
    if (typeof v !== "boolean") throw new TypeFault(`${what} must be boolean, got ${show(v)}`);
    return v;
  }

  retTy(env: Env): Ty | null {
    for (let e: Env | null = env; e; e = e.parent) { const b = e.vars.get(" ret"); if (b) return (b.v as unknown as { ty: Ty | null }).ty; }
    return null;
  }

  // ── calls ──
  callFn(fn: Fn, args: { name: string | null; v: Val | null; e: Expr | null }[], callerEnv: Env | null, _line: number, bind: Map<string, Ty> | null = null): Val {
    const d = fn.decl;
    if (++this.depth > 400) throw new Unsupported("recursion depth (oracle)");
    try {
      const env = new Env(fn.env);
      // A type parameter the destination binds (D3539) is that type in the body.
      for (const p of d.tparams) env.types.set(p, bind?.has(p) ? { params: [], ty: bind.get(p)! } : "param");
      // An argument is typed in the caller's scope, where the callee's type parameters are erased.
      const erased = new Map(d.tparams.map((p) => [p, bind?.get(p) ?? ANY]));
      const argTy = (t: Ty | null) => t && erased.size ? subst(t, erased) : t;
      env.vars.set(" ret", { v: { ty: d.ret } as unknown as Val, ty: null, mut: false });
      const pos = args.filter((a) => a.name === null);
      const named = new Map(args.filter((a) => a.name !== null).map((a) => [a.name!, a]));
      let pi = 0;
      for (const p of d.params) {
        let v: Val;
        if (p.rest) {
          const rest: Val[] = [];
          while (pi < pos.length) {
            const a = pos[pi++];
            if (a.e && a.e.k === "spread") rest.push(...(this.eval(a.e.e, callerEnv!, null) as Val[]));
            else rest.push(a.v !== null || !a.e ? a.v : this.eval(a.e, callerEnv!, p.ty && p.ty.k === "list" ? argTy(p.ty.el) : null));
          }
          v = this.deliver(rest, p.ty, env, `argument '${p.name}'`);
        } else {
          const a = named.get(p.name) ?? (pi < pos.length ? pos[pi++] : null);
          if (a) {
            if (a.e && a.e.k === "spread") throw new Unsupported("spread into a non-rest parameter");
            v = a.e ? this.eval(a.e, callerEnv!, argTy(p.ty)) : a.v;
          } else if (p.def) v = this.eval(p.def, fn.env, p.ty);
          else if (p.opt) v = null;
          else throw new TypeFault(`missing argument '${p.name}' to ${d.name}`);
          v = this.deliver(v, p.ty, env, `argument '${p.name}' of ${d.name}`);
        }
        env.vars.set(p.name, { v, ty: p.ty, mut: true });
      }
      if (pi < pos.length) throw new TypeFault(`too many arguments to ${d.name}`);
      let r: Val;
      try {
        // the body's last expression is delivered to the return type, so it is its context
        // A block body returns a value only through `return`; an expression body is its value
        // (DECISIONS, "A function's block body returns a value only through `return`").
        if (Array.isArray(d.body)) {
          this.execBlock(d.body, env, d.ret);
          r = VOID;
        } else {
          r = this.eval(d.body, env, d.ret);
        }
        if (d.ret && d.ret.k === "name" && d.ret.name === "void") r = VOID;
        // spec gap (owner question): S8.1 says every path returns; the compiler lets a body whose
        // return type admits null fall off its end, and the result is null.
        else if (r === VOID && d.ret && this.fits(null, d.ret, env)) r = null;
      } catch (x) {
        if (x instanceof Ret) r = x.v;
        else if (x instanceof NullOut) r = null;
        else throw x;
      }
      if (d.ret) {
        if (d.ret.k === "name" && d.ret.name === "void") return VOID;
        if (d.ret.k === "name" && d.ret.name === "never") throw new TypeFault(`never-returning ${d.name} returned`);
        return this.deliver(r, d.ret, env, `return of ${d.name}`);
      }
      return r instanceof Lit ? litDefault(r) : r;
    } finally {
      this.depth--;
    }
  }

  // A type parameter no argument's parameter names is bound by the call's destination type
  // (D16410); with no destination the call is refused. A generic function passed bare still binds
  // (D16411: a later call of the result binds it).
  unboundTyParam(d: FnDecl, args: { name: string | null; e: Expr }[], exp: Ty | null) {
    if (!d.tparams.length || (exp && !mentions(exp, "any"))) return;
    const bound = new Set<string>();
    const pos = args.filter((a) => a.name === null);
    let pi = 0;
    for (const p of d.params) {
      const named = args.find((x) => x.name === p.name);
      const got = named ? [named] : p.rest ? pos.slice(pi) : pi < pos.length ? [pos[pi]] : [];
      if (!named) pi = p.rest ? pos.length : pi + got.length;
      if (!p.ty || !got.length) continue;
      for (const t of d.tparams) if (mentions(p.ty, t)) bound.add(t);
    }
    const free = d.tparams.find((t) => !bound.has(t));
    if (free) throw new TypeFault(`cannot infer type parameter \`${free}\` of ${d.name}: no argument binds it and the call has no destination type`);
  }

  callValue(f: Val, args: { name: string | null; e: Expr }[], env: Env, line: number, bind: Map<string, Ty> | null = null): Val {
    if (f instanceof Fn) return this.callFn(f, args.map((a) => ({ name: a.name, v: null, e: a.e })), env, line, bind);
    if (f instanceof Bi) return f.call(this.evalArgs(args, env), this);
    throw new TypeFault("call of " + show(f));
  }
  evalArgs(args: { name: string | null; e: Expr }[], env: Env): Val[] {
    const out: Val[] = [];
    for (const a of args) {
      if (a.name) throw new Unsupported("named argument to a builtin");
      if (a.e.k === "spread") out.push(...(this.eval(a.e.e, env, null) as Val[]));
      else out.push(this.eval(a.e, env, null));
    }
    return out;
  }

  // Overloads of one name are told apart by their first parameter (E11.4, O1).
  pickOverload(fns: Fn[], first: Val, _env: Env): Fn {
    if (fns.length === 1) return fns[0];
    for (const f of fns) {
      const p = f.decl.params[0];
      if (p && p.ty && this.fits(first, p.ty, f.env)) return f;
    }
    throw new Unsupported("overload resolution");
  }

  // ── expressions ──
  eval(e: Expr, env: Env, exp: Ty | null): Val {
    this.tick();
    switch (e.k) {
      case "int": {
        const l = new Lit(e.v, null, e.radix ? (e.v > 0xffffffffn ? 64 : 32) : 0);
        l.wideDec = !e.radix && e.v > BigInt(I32_MAX);
        l.lone = !!e.radix;
        return l;
      }
      case "float": return new Lit(null, e.v, false, parseRat(e.raw));
      case "str": return e.v;
      case "interp": return e.parts.map((p) => typeof p === "string" ? p : this.render(this.eval(p, env, null))).join("");
      case "bool": return e.v;
      case "null": return null;
      case "id": {
        const b = env.lookup(e.name);
        // T2.5: a `let` slot holding a constant takes its type from later stores; a read
        // until then sees the default. A `const` constant is the exact value (T2.4).
        // D14990: a read of a radix tree `const` computes the tree at that read's own width.
        if (b?.tree && b.v instanceof Lit && b.v.radix && !b.v.lone && !f32Fold && !(exp && this.isF32(exp, env))) return this.eval(b.tree, env, exp);
        if (b?.tree && !f32Fold && exp && this.isF32(exp, env)) {
          f32Fold = true;
          try { return this.eval(b.tree, env, null); } finally { f32Fold = false; }
        }
        if (b?.tree && f32Fold) return this.eval(b.tree, env, null);
        if (b) return b.mut && b.v instanceof Lit ? litDefault(b.v) : b.v instanceof Lit ? constRead(b.v) : b.v;
        const fns = env.lookupFns(e.name);
        if (fns) { if (fns.length > 1) throw new Unsupported("overloaded function as a value"); return fns[0]; }
        if (e.name.startsWith("__")) throw new Unsupported("intrinsic " + e.name);
        throw new TypeFault(`undeclared '${e.name}' at line ${e.line}`);
      }
      case "list": {
        const r = exp ? this.resolve(exp, env) : null;
        const el = r && r.k === "list" ? r.el : null;
        const out: Val[] = [];
        for (const it of e.items) {
          if (it.k === "spread") {
            const xs = this.eval(it.e, env, null);
            if (!Array.isArray(xs)) throw new TypeFault("spread of " + show(xs));
            out.push(...xs);
          } else {
            const v = this.eval(it, env, el);
            out.push(el ? this.convert(v, el, env) : v);
          }
        }
        // E15.2: no context, the elements join; a constant takes the join's numeric type.
        return this.settleLits(out);
      }
      case "obj": {
        const r = exp ? this.pickRecArm(exp, e.fields.map((f) => f.name), env) : null;
        const m = new Map<string, Val>();
        for (const f of e.fields) {
          const ft = r ? r.fields.find((x) => x.name === f.name)?.ty ?? null : null;
          let v = this.eval(f.e, env, ft);
          if (v === VOID) throw new TypeFault("void field value");
          if (ft) v = this.convert(v, ft, env);
          m.set(f.name, v); // a constant field waits for its delivery (T4.5)
        }
        return new Rec(m);
      }
      case "un": {
        const v = this.eval(e.e, env, exp);
        if (e.op === "!") return !this.asBool(v, "operand of !");
        if (e.op === "-") {
          if (v instanceof Lit && v.i !== null) { const n = new Lit(-v.i, null, v.radix); n.wideDec = e.e.k === "int" ? !v.radix && (-v.i < BigInt(I32_MIN) || -v.i > BigInt(I32_MAX)) : v.wideDec; n.join = v.join; n.w64 = v.w64 === null ? null : -v.w64; n.trap64 = v.trap64; return n; } // `-2147483648` is an i32 literal (T2.1), the minus folded in
          if (v instanceof Lit) { const n = new Lit(null, -v.f!, false, v.q ? [-v.q[0], v.q[1]] : null); n.join = v.join; return n; }
          if (v instanceof Flt) return new Flt(-v.v, v.w);
          return arith("-", typeof v === "bigint" ? 0n : 0, v);
        }
        if (e.op === "~") {
          if (v instanceof Lit && v.i !== null && !v.radix) { const n = new Lit(-v.i - 1n, null, false); n.join = v.join; n.derived = true; n.wideDec = v.wideDec; return n; }
          // a radix constant's `~` keeps the pattern exact, so its use's width reads it (ruling A)
          if (v instanceof Lit && v.i !== null) {
            const n = new Lit(~v.i, null, v.radix);
            n.join = v.join; n.derived = true; n.wideDec = v.wideDec; n.trap64 = v.trap64;
            if (v.w64 !== null) n.w64 = ~v.w64;
            return n;
          }
          if (typeof v === "number") return ~v;
          if (typeof v === "bigint") return wrap64(~v);
          throw new Unsupported("~ on " + show(v));
        }
        return v;
      }
      case "bin": return this.binary(e, env, exp);
      case "assign": return this.assign(e, env);
      case "incdec": {
        const target = this.freeze(e.target, env);
        const cur = this.eval(target, env, null);
        const nv = arith(e.op === "++" ? "+" : "-", cur, new Lit(1n, null, false));
        this.store(target, nv, env);
        return e.prefix ? nv : cur;
      }
      case "member": {
        const o = this.eval(e.e, env, null);
        if (o === null && e.opt) return null;
        return this.member(o, e.name);
      }
      case "index": {
        const o = this.eval(e.e, env, null);
        const opFns = env.lookupFns("[]");
        if (opFns) return this.callFn(this.pickOverload(opFns, o, env), [{ name: null, v: o, e: null }, { name: null, v: null, e: e.i }], env, 0);
        if (o instanceof VMap) {
          const k = this.eval(e.i, env, null);
          return num(o.m.get(keyOf(k))?.[1] ?? null);
        }
        const i = this.asI32(this.eval(e.i, env, null), "index");
        if (Array.isArray(o)) {
          if (i < 0 || i >= o.length) throw new Trap(`index ${i} out of range for length ${o.length}`);
          return num(o[i]);
        }
        if (typeof o === "string") {
          const b = bytes(o);
          if (i < 0 || i >= b.length) throw new Trap(`string index ${i} out of range`);
          return b[i];
        }
        throw new TypeFault("index into " + show(o));
      }
      case "call": return this.call(e, env, exp);
      case "as": return this.cast(e, env);
      case "is": {
        const v = this.eval(e.e, env, null);
        const r = this.isTest(v, e.ty, env);
        return e.neg ? !r : r;
      }
      case "lambda": return new Fn(e.fn, env);
      case "if": {
        const c = this.asBool(this.eval(e.c, env, null), "if-condition");
        // E9.1 does not list `if`, so with no context its value is typed, not a constant.
        // An else-less `if` in value position is `T | null`: a false condition yields `null`.
        const v = c ? this.blockValue(e.t, env, exp) : e.f ? this.blockValue(e.f, env, exp) : null;
        // T3.6 at an `if` join: a constant arm adapts to the other arm's type, read from its
        // declaration since that arm did not run; one that cannot widens the join.
        const other = c ? e.f : e.t;
        const ok = other && other.length ? other[other.length - 1] : null;
        const kOther = ok && ok.k === "expr" ? this.staticKind(ok.e, env) : null;
        // 4.3 with Q9: a float constant arm that adopts an `f32` arm folds in f32 arithmetic, as
        // at run time; a constant tree is pure, so the taken arm is evaluated again.
        const taken = c ? e.t : e.f, tk = taken && taken.length ? taken[taken.length - 1] : null;
        const d16498 = (v: Lit): bigint | null =>
          emulating.has("D16498") && v.radix && !v.lone && v.i !== null && tk && tk.k === "expr" && tk.e.k === "bin" && ["/", "%", "<<", ">>"].includes(tk.e.op)
            ? BigInt.asIntN(32, v.i) : null;
        if (v instanceof Lit && v.f !== null && kOther === "f32" && !f32Fold && tk && tk.k === "expr" && isConstTree(tk.e)) {
          f32Fold = true;
          let r: Val;
          try { r = this.eval(tk.e, env, null); } finally { f32Fold = false; }
          return r instanceof Lit ? litTo(r, "f32") : r;
        }
        // A generic's erased parameter (`any`) is no context: the join settles here. With a
        // context, a constant arm beside a typed one still takes that type when it fits.
        // An integer arm beside a decimal arm outside i32 is the pair's i64, under a destination too
        // (4.3; T2.3 for a radix arm, as `pairDefault`).
        // The other arm's constant tails, through nested joins of constants; null when one is not.
        const tails = (x: Expr): Expr[] | null => {
          if (x.k === "if") {
            const arm = (b: Stmt[] | null) => { const t = b && b.length ? b[b.length - 1] : null; return t && t.k === "expr" ? tails(t.e) : null; };
            const a = arm(x.t), b = arm(x.f);
            return a && b ? [...a, ...b] : null;
          }
          return isConstTree(x) ? [x] : null;
        };
        const wideOther = (): boolean => {
          if (!(v instanceof Lit) || v.i === null || kOther || !ok || ok.k !== "expr") return false;
          return (tails(ok.e) ?? []).some((t) => {
            // the arm did not run: a trap in its constant is no trap of the program
            let o: Val;
            try { o = this.eval(t, env, null); } catch (x) { if (x instanceof Trap) return false; throw x; }
            if (!(o instanceof Lit) || o.i === null) return false;
            // a radix tree is i64 when it holds a wider pattern or a decimal outside i32 (D16492)
            if (o.radix) return o.radix === 64 || o.wideDec;
            return (o.i < BigInt(I32_MIN) || o.i > BigInt(I32_MAX)) && o.i >= I64_MIN && o.i <= I64_MAX;
          });
        };
        if (exp && !(exp.k === "name" && exp.name === "any")) {
          if (wideOther()) return d16498(v as Lit) ?? litTo(v as Lit, "i64");
          if (v instanceof Lit && kOther && joinFits(v, kOther)) { try { return litTo(v, kOther); } catch { /* the join */ } }
          return v instanceof Lit ? asJoin(v) : v;
        }
        if (v instanceof Lit) {
          // A float arm makes the join a float context, where a radix arm is its digits' value (4.1).
          if (v.radix && v.i !== null && !kOther && ok && ok.k === "expr" && isConstTree(ok.e) && treeHas(ok.e, "float")) {
            return v.lone ? radixFloat(v.i, 64, false) : new Flt(Number(wrap64(v.i)), 64);
          }
          if (wideOther()) return d16498(v) ?? litTo(v, "i64");
          if (!kOther && ok && ok.k === "expr" && isConstTree(ok.e)) {
            const j = asJoin(v);
            if (v.f !== null && tk && tk.k === "expr" && isConstTree(tk.e)) j.arm = tk.e;
            return j;
          }
          if (!kOther) return litDefault(v);
          if (kOther === "i64" && d16498(v) !== null) return d16498(v)!;
          if (joinFits(v, kOther)) { try { return litTo(v, kOther); } catch { /* the default */ } }
          const d = litDefault(v), dk = numKind(d)!;
          return WIDENS[kOther]?.includes(dk) ? d : WIDENS[dk]?.includes(kOther) ? toKind(d, kOther) : d;
        }
        const kv = numKind(v);
        if (kv && ok && ok.k === "expr" && isConstTree(ok.e)) {
          let lit: Lit;
          try { lit = this.eval(ok.e, env, null) as Lit; } catch (x) { if (x instanceof Trap) return v; throw x; }
          if (!joinFits(lit, kv)) { const dk = numKind(litDefault(lit))!; if (WIDENS[kv]?.includes(dk)) return toKind(v, dk); }
        }
        // T3.6: a typed arm beside a wider typed arm widens to it, whichever arm ran
        if (kv && kOther && kOther !== kv && WIDENS[kv]?.includes(kOther)) return toKind(v, kOther);
        return v;
      }
      case "block": return this.execBlock(e.body, new Env(env));
      case "match": return this.match(e, env, exp);
      case "spread": throw new Unsupported("spread here");
      case "val": return e.v as Val;
    }
  }

  // The declared type of an expression where a declaration names one, or null. Only the
  // spellings a literal join needs: a binding, a field of one, a call of a declared function.
  declTy(e: Expr, env: Env): Ty | null {
    try {
      if (e.k === "id") return env.lookup(e.name)?.ty ?? null;
      if (e.k === "as") return e.mode === "as?" ? { k: "union", arms: [e.ty, { k: "null" }] } : e.ty;
      if (e.k === "bin" && e.op === "??") {
        const a = this.declTy(e.l, env), b = this.declTy(e.r, env);
        return a && b ? { k: "union", arms: [a, b] } : a ?? b;
      }
      if (e.k === "member") {
        const o = this.declTy(e.e, env);
        if (!o) return null;
        const r = this.resolve(o, env);
        const arms = r.k === "union" ? r.arms.map((a) => this.resolve(a, env)) : [r];
        const fs = arms.flatMap((a) => a.k === "rec" ? a.fields.filter((f) => f.name === e.name).map((f) => f.ty) : []);
        return fs.length === 1 ? fs[0] : fs.length ? { k: "union", arms: fs } : null;
      }
      if (e.k === "call" && e.f.k === "id" && !env.lookup(e.f.name)) {
        const fns = env.lookupFns(e.f.name);
        if (fns && fns.length === 1 && !fns[0].decl.tparams.length) return fns[0].decl.ret;
      }
    } catch { /* an unresolvable name: no declaration to read */ }
    return null;
  }

  // The numeric type an expression has without running it, where its spelling says, else null.
  staticKind(e: Expr, env: Env): string | null {
    const one = (t: Ty | null): string | null => {
      if (!t) return null;
      try { const r = this.resolve(t, env); return r.k === "name" && NUMERIC.has(r.name) ? r.name : null; } catch { return null; }
    };
    switch (e.k) {
      case "as": return one(e.ty);
      case "id": { const b = env.lookup(e.name); return b ? (one(b.ty) ?? (b.v instanceof Lit ? null : numKind(b.v))) : null; }
      case "call":
        // min, max, abs and the rounding functions keep their operand's width (E2.7)
        if (e.f.k === "id" && ["min", "max", "abs", "floor", "ceil", "trunc", "nearest"].includes(e.f.name) && !env.lookupFns(e.f.name)) {
          for (const a of e.args) { const k = this.staticKind(a.e, env); if (k) return k; }
          // Over constants alone the call is still no constant (E9.1): it is typed at the
          // arguments' default, which a literal beside it adopts (T3.6).
          if (!e.args.length || !e.args.every((a) => isConstTree(a.e))) return null;
          const v = e.args.map((a) => this.eval(a.e, env, null));
          if (!v.every((x) => x instanceof Lit)) return null;
          const ls = v as Lit[];
          const ks = ls.map((l, i) => numKind(ls.length === 2 ? pairDefault(l, ls[1 - i]) : litDefault(l))!);
          try { return ks.reduce((a, b) => wider(a, b)); } catch { return null; }
        }
        return one(this.declTy(e, env));
      case "un": return e.op === "-" || e.op === "~" ? this.staticKind(e.e, env) : null;
      case "bin": {
        // A shift is its left operand's type; a constant left has none of its own here (Q8).
        if (["<<", ">>", ">>>"].includes(e.op)) return isConstTree(e.l) ? null : this.staticKind(e.l, env);
        if (!["+", "-", "*", "/", "%", "&", "|", "^"].includes(e.op)) return null;
        const a = this.staticKind(e.l, env), b = this.staticKind(e.r, env);
        if (a && b) { try { return wider(a, b); } catch { return null; } }
        // D3043: a constant that does not fit its typed i32 peer makes the operator i64
        const k = a ?? b, cst = a ? e.r : e.l;
        if (k === "i32" && isConstTree(cst)) {
          try { const v = this.eval(cst, env, null); if (v instanceof Lit && v.i !== null && !litHolds(v, "i32")) return "i64"; } catch { /* the default */ }
        }
        return k;
      }
      case "if": {
        // a join is its arms' wider kind; a constant arm has none here and takes the other's,
        // unless it is outside i32, which makes the join i64 (4.3)
        const wideConst = (x: Expr): boolean => {
          if (!isConstTree(x)) return false;
          try { const v = this.eval(x, env, null); return v instanceof Lit && v.i !== null && !litHolds(v, "i32"); } catch { return false; }
        };
        const arm = (b: Stmt[] | null) => {
          const t = b && b.length ? b[b.length - 1] : null;
          return t && t.k === "expr" ? this.staticKind(t.e, env) ?? (wideConst(t.e) ? "i64" : null) : null;
        };
        const a = arm(e.t), b = arm(e.f);
        if (a && b) { try { return wider(a, b); } catch { return a; } }
        return a ?? b;
      }
      default: return null;
    }
  }

  // An `if` arm's value, with a lone tail expression evaluated against the context type.
  blockValue(body: Stmt[], env: Env, exp: Ty | null): Val {
    const e = new Env(env);
    if (body.length === 1 && body[0].k === "expr") { this.hoist([], e); return this.eval(body[0].e, e, exp); }
    return this.execBlock(body, e);
  }

  settleLits(xs: Val[]): Val[] {
    if (!xs.some((x) => x instanceof Lit)) return xs;
    const kinds = new Set(xs.filter((x) => !(x instanceof Lit)).map(numKind).filter((k) => k));
    // T3.6 (ruling 4.3): a literal element beside one typed member adopts it when it fits. With
    // several members it keeps its default type, absorbed into a member that type widens into
    // (T2.6); the ruling names one typed value, so that half follows today's compiler.
    const fit = (l: Lit) => {
      const k = kinds.size === 1 ? [...kinds][0]! : null;
      if (k && joinFits(l, k)) { try { return litTo(l, k); } catch { /* falls to the default */ } }
      const d = litDefault(l), dk = numKind(d)!;
      if (kinds.has(dk)) return d;
      const into = WIDENS[dk]?.find((w) => kinds.has(w));
      return into ? toKind(d, into) : d;
    };
    if (kinds.size) return xs.map((x) => x instanceof Lit ? fit(x) : x);
    return xs; // all constants: each waits for its delivery, a read sees its default
  }

  pickRecArm(t: Ty, names: string[], env: Env): Extract<Ty, { k: "rec" }> | null {
    const r = this.resolve(t, env);
    if (r.k === "rec") return r;
    if (r.k !== "union") return null;
    const recs = r.arms.map((a) => this.resolve(a, env)).filter((a) => a.k === "rec") as Extract<Ty, { k: "rec" }>[];
    const exact = recs.filter((a) => a.fields.length === names.length && a.fields.every((f) => names.includes(f.name)));
    if (exact.length >= 1) return exact[0];
    return recs.find((a) => names.every((n) => a.fields.some((f) => f.name === n))) ?? null;
  }

  render(v: Val): string {
    if (v instanceof Lit) v = litDefault(v);
    if (Array.isArray(v) || v instanceof Rec || v instanceof VMap || v instanceof VSet || v instanceof Fn || v instanceof Bi || v === VOID) {
      throw new TypeFault("print of a non-scalar " + show(v));
    }
    return show(v);
  }

  binary(e: Extract<Expr, { k: "bin" }>, env: Env, exp: Ty | null): Val {
    const op = e.op;
    if (op === "&&" || op === "||") {
      const l = this.asBool(this.eval(e.l, env, null), `left of ${op}`);
      if (op === "&&" ? !l : l) return l;
      return this.asBool(this.eval(e.r, env, null), `right of ${op}`);
    }
    if (op === "??") {
      // T3.6: a numeric literal on the right adapts to the left's type; one that cannot (2.5
      // against i32) makes the join the wider type, and a non-null left value widens to it.
      const litR = isNumLit(e.r);
      const l = this.eval(e.l, env, exp);
      if (l !== null) {
        const k = numKind(l);
        if (!litR || !k) return l;
        const lit = this.eval(e.r, env, null) as Lit;
        if (joinFits(lit, k)) return l;
        const dk = numKind(litDefault(lit))!;
        return WIDENS[dk]?.includes(k) || WIDENS[k]?.includes(dk) ? toKind(l, wider(dk, k)) : l;
      }
      if (!litR) return this.eval(e.r, env, exp);
      const lit = this.eval(e.r, env, null) as Lit;
      const dl = this.declTy(e.l, env);
      const t = dl ? this.numTarget(lit, dl, env) : null;
      if (t && joinFits(lit, t)) { try { return litTo(lit, t); } catch { /* the join widens */ } }
      return exp ? lit : litDefault(lit);
    }
    // A numeric context flows into both operands of arithmetic (a literal tree adopts it).
    const arithOp = ["+", "-", "*", "/", "%", "&", "|", "^", "<<", ">>", ">>>"].includes(op);
    // A bitwise operator is integer-only (E6.1), so a float context does not reach its operands;
    // a radix constant tree at an f64 computes at 64 bits instead (ruling 4.2).
    if (exp && ["&", "|", "^", "<<", ">>", ">>>"].includes(op)) {
      try {
        const x = this.resolve(exp, env);
        if (x.k === "name" && (x.name === "f64" || x.name === "f32")) exp = x.name === "f64" && (isConstTree(e) || constShift(e)) && treeHas(isConstTree(e) ? e : e.l, "radix") ? I64_TY : null;
      } catch { exp = null; }
    }
    // E6.2: a constant shift count is non-negative and below the operand's width; 32 to 63 widen
    // a constant left to i64 (Q8), so 64 bounds every left and 32 a typed `i32` one, below.
    const constCount = ["<<", ">>", ">>>"].includes(op) && isConstTree(e.r) ? this.eval(e.r, env, null) : null;
    if (constCount instanceof Lit && constCount.i !== null) {
      if (constCount.i < 0n) throw new TypeFault(`shift count ${constCount.i} is negative`);
      if (constCount.i > 63n) throw new TypeFault(`shift count ${constCount.i} is out of range`);
    }
    // Q8: that count makes a constant-left shift on the left i64, as it makes a constant left.
    if (constCount instanceof Lit && constCount.i !== null && constCount.i > 31n && constShift(e.l)) {
      const lv = this.eval(e.l, env, I64_TY);
      return arith(op, lv, typeof lv === "bigint" ? constCount.i : litDefault(constCount));
    }
    // A shift's result is its left operand's type, and a count never types the left: a constant
    // left takes its destination's width, else its own default (coordinator ruling on Q8).
    if (["<<", ">>", ">>>"].includes(op) && constLike(e.l) && !isConstTree(e.r)) {
      let k: string | null = null;
      if (exp) { try { const x = this.resolve(exp, env); if (x.k === "name" && (x.name === "i32" || x.name === "i64")) k = x.name; } catch { /* none */ } }
      const lv = this.eval(e.l, env, k ? exp : null);
      const rv = this.eval(e.r, env, null);
      // A radix pattern Q8 made 64 bits wide stays i64 under an i32 context.
      const q8Wide = lv instanceof Lit && !!lv.radix && (lv.radix === 64 || lv.wideDec);
      const left = lv instanceof Lit ? (k && !(k === "i32" && q8Wide) ? litTo(lv, k) : litDefault(lv)) : lv;
      // The count is masked to the left's width (E6.2), so it converts to that width's integer.
      const count = typeof left === "bigint" && typeof rv === "number" ? BigInt(rv)
        : typeof left === "number" && typeof rv === "bigint" ? Number(BigInt.asIntN(32, rv)) : rv;
      return arith(op, left, count);
    }
    // D16492: a shift of a constant by a run-time count, alone or in a tree of constants, beside a
    // constant outside i32 computes at i64, a radix left read at its pattern there.
    if (arithOp && !exp && !["<<", ">>", ">>>"].includes(op)) {
      // A tree of constants and such shifts, holding at least one shift.
      const radixShift = (x: Expr): boolean => {
        if (x.k === "bin" && ["<<", ">>", ">>>"].includes(x.op)) return constShift(x);
        if (x.k === "un" && (x.op === "-" || x.op === "~")) return radixShift(x.e);
        if (x.k !== "bin" || !["+", "-", "*", "&", "|", "^"].includes(x.op)) return false;
        return (radixShift(x.l) && (isConstTree(x.r) || radixShift(x.r))) || (isConstTree(x.l) && radixShift(x.r));
      };
      const wide = (x: Expr) => { if (!isConstTree(x)) return false; const v = this.eval(x, env, null); return v instanceof Lit && v.i !== null && !litHolds(v, "i32"); };
      const ls = radixShift(e.l) && wide(e.r), rs = radixShift(e.r) && wide(e.l);
      if (ls || rs) {
        const l = this.eval(e.l, env, ls ? I64_TY : null);
        return arith(op, l, this.eval(e.r, env, rs ? I64_TY : null));
      }
    }
    // A radix tree beside a float constant has that f64 as its peer (ruling 4.2).
    if (arithOp && !exp && isConstTree(e.l) && isConstTree(e.r)) {
      const radixL = treeHas(e.l, "radix") && !treeHas(e.l, "float"), radixR = treeHas(e.r, "radix") && !treeHas(e.r, "float");
      if (radixR && treeHas(e.l, "float") && !radixL) return arith(op, this.eval(e.l, env, null), this.eval(e.r, env, F64_TY));
      if (radixL && treeHas(e.r, "float") && !radixR) return arith(op, this.eval(e.l, env, F64_TY), this.eval(e.r, env, null));
    }
    // A constant operand takes its typed peer's type as its context (DECISIONS D3043: an operator
    // peer adopts the literal tree). A constant has no effects, so its side may run second.
    // A shift of a constant by a variable count takes a peer's type as a constant does (Q8).
    const peerTyped = (x: Expr) => isConstTree(x) || (x.k === "bin" && ["<<", ">>", ">>>"].includes(x.op) && isConstTree(x.l));
    // Under an integer destination, a radix tree or a shifted constant beside a typed integer
    // peer still takes the peer's width when its constant fits it (D3043); else the destination's.
    const intExp = exp && (() => { try { const x = this.resolve(exp, env); return x.k === "name" && (x.name === "i32" || x.name === "i64"); } catch { return false; } })();
    const atPeer = (x: Expr, k: string | null): boolean => {
      if (!intExp || (k !== "i32" && k !== "i64")) return false;
      // A join of constant-like arms takes the peer's type as a constant does; its arms decide a
      // widening themselves, and it is evaluated once.
      if (x.k === "if" && constLike(x)) return true;
      const c = x.k === "bin" && ["<<", ">>", ">>>"].includes(x.op) && isConstTree(x.l) ? x.l : isConstTree(x) && treeHas(x, "radix") ? x : null;
      if (!c) return false;
      const v = this.eval(c, env, null);
      return v instanceof Lit && litHolds(v, k);
    };
    // D3043: a constant takes its typed peer's type only if it fits; one that does not fit an
    // `i32` peer is read with no context, and `arith` widens the peer to i64.
    const peerCtx = (x: Expr, kTy: Ty | null): Ty | null => {
      if (!kTy || kTy.k !== "name" || kTy.name !== "i32" || !isConstTree(x)) return kTy;
      const v = this.eval(x, env, null);
      return v instanceof Lit && v.i !== null && !litHolds(v, "i32") ? null : kTy;
    };
    let l: Val, r: Val;
    const rExp = arithOp && !["<<", ">>", ">>>"].includes(op) ? exp : null;
    if (arithOp && peerTyped(e.l) && !peerTyped(e.r) && (!exp || (intExp && !["<<", ">>", ">>>"].includes(op)))) {
      r = this.eval(e.r, env, rExp);
      const k = numKind(r);
      const kTy: Ty | null = k ? { k: "name", name: k, args: [] } : null;
      l = this.eval(e.l, env, !exp ? peerCtx(e.l, kTy) : atPeer(e.l, k) ? kTy : exp);
    } else {
      l = this.eval(e.l, env, arithOp ? exp : null);
      const k = numKind(l);
      const kTy: Ty | null = k ? { k: "name", name: k, args: [] } : null;
      const shiftOp = ["<<", ">>", ">>>"].includes(op);
      r = this.eval(e.r, env, arithOp && !shiftOp && !(l instanceof Lit) && atPeer(e.r, k) ? kTy : rExp ?? (arithOp && !exp && k && peerTyped(e.r) && !shiftOp ? peerCtx(e.r, kTy) : null));
    }
    if (constCount instanceof Lit && constCount.i !== null && constCount.i > 31n && !(l instanceof Lit) && numKind(l) === "i32" && !constShift(e.l)) {
      throw new TypeFault(`shift count ${constCount.i} is out of range for an i32 operand`);
    }
    // E9.1: a float constant tree that adopts an `f32` peer folds in f32 arithmetic, whatever
    // destination is outside the operator. A tree is pure, so it is evaluated again.
    if ((arithOp || ["<", "<=", ">", ">=", "==", "!="].includes(op)) && !["<<", ">>", ">>>"].includes(op) && !f32Fold) {
      const atF32 = (te: Expr, v: Val, peer: Val): Val => {
        if (v instanceof Lit && v.f !== null && v.join && v.derived && numKind(peer) === "f32") {
          if (emulating.has("D16497")) return litDefault(v);
          throw new Unsupported("spec gap: a float tree over a literal join beside an f32 (D16497)");
        }
        if (v instanceof Lit && v.f !== null && v.arm && numKind(peer) === "f32") te = v.arm;
        else if (!(v instanceof Lit) || v.f === null || !this.foldsAt(te, env) || numKind(peer) !== "f32") return v;
        f32Fold = true;
        try { return this.eval(te, env, null); } finally { f32Fold = false; }
      };
      l = atF32(e.l, l, r);
      r = atF32(e.r, r, l);
    }
    // An operator function (`function "+"(self: V, other: V)`) applies to its own types.
    const opFns = env.lookupFns(op);
    if (opFns && !(l instanceof Lit) && numKind(l) === null && typeof l !== "string" && typeof l !== "boolean" && l !== null) {
      const f = this.pickOverload(opFns, l, env);
      return this.callFn(f, [{ name: null, v: l, e: null }, { name: null, v: r, e: null }], env, 0);
    }
    switch (op) {
      case "==": return equal(l, r);
      case "!=": return !equal(l, r);
      case "<": case "<=": case ">": case ">=": return compare(op, l, r);
      case "+":
        if (typeof l === "string" && typeof r === "string") return l + r;
        if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
    }
    let expK: string | null = null;
    if (exp) { try { const x = this.resolve(exp, env); if (x.k === "name" && NUMERIC.has(x.name)) expK = x.name; } catch { /* no destination */ } }
    if (l instanceof Lit && r instanceof Lit && exp) {
      // `>>>` of a negative constant needs a width: the destination's, when it is i64.
      if (op === ">>>" && l.i !== null && l.i < 0n && !l.radix && expK === "i64") return arith(">>>", litTo(l, "i64"), litDefault(r));
      // E9.1: the exact constant is computed first and typed at its use.
      if (l.join || r.join) return arith(op, l, r, expK);
      return litArith(op, l, r, expK ?? (this.isF32(exp, env) ? "f32" : null));
    }
    return arith(op, l, r, expK);
  }

  assign(e: Extract<Expr, { k: "assign" }>, env: Env): Val {
    let v: Val;
    if (e.op === "=") {
      // E10.1: the place's own operands (object, index) are evaluated before the value
      const target = this.freeze(e.target, env);
      v = this.eval(e.e, env, this.targetTy(e.target, env));
      this.store(target, v, env);
      return v;
    } else {
      // E7.2: a compound assignment evaluates its target's object and index once.
      const target = this.freeze(e.target, env);
      const cur = this.eval(target, env, null);
      // E9.1: a constant tree beside an `f32` target folds in f32 arithmetic, as at run time.
      f32Fold = this.foldsAt(e.e, env) && numKind(cur) === "f32";
      let rhs: Val;
      try { rhs = this.eval(e.e, env, null); } finally { f32Fold = false; }
      // Q9: a join's taken float constant arm beside an `f32` target folds there too.
      if (rhs instanceof Lit && rhs.f !== null && rhs.arm && numKind(cur) === "f32") {
        f32Fold = true;
        try { rhs = this.eval(rhs.arm, env, null); } finally { f32Fold = false; }
      }
      v = arith(e.op.slice(0, -1), cur, rhs);
      this.store(target, v, env);
      return v;
    }
  }
  // D3539: a generic whose result is its bare type parameter `T`, every argument at a bare `T`
  // a constant tree of the destination's kind (a float tree at a float, an integer one at an
  // integer, D4024), takes `T` from a numeric destination, as a literal written there would.
  dstBindLits(d: FnDecl, args: { name: string | null; e: Expr }[], exp: Ty | null, env: Env): Map<string, Ty> | null {
    if (!exp || !d.ret || d.ret.k !== "name" || !d.tparams.includes(d.ret.name)) return null;
    const t = d.ret.name;
    let k: string | null = null;
    try { const x = this.resolve(exp, env); if (x.k === "name" && NUMERIC.has(x.name)) k = x.name; } catch { return null; }
    if (!k) return null;
    const pos = args.filter((a) => a.name === null);
    let pi = 0, any = false;
    for (const p of d.params) {
      const a = args.find((x) => x.name === p.name) ?? (p.rest ? null : pos[pi++] ?? null);
      if (!p.ty || p.ty.k !== "name" || p.ty.name !== t) {
        if (p.ty && mentions(p.ty, t)) return null;
        continue;
      }
      if (!a || !this.foldsAt(a.e, env)) return null;
      const float = a.e.k === "id" || treeHas(a.e, "float");
      if (float !== (k === "f32" || k === "f64")) return null;
      any = true;
    }
    return any ? new Map([[t, exp]]) : null;
  }
  // Whether `e` is a constant tree, or a read of a `const` holding one, which folds at its use.
  foldsAt(e: Expr, env: Env): boolean {
    return isConstTree(e) || (e.k === "id" && !!env.lookup(e.name)?.tree);
  }
  // Whether `t`'s one number member is `f32` (`f32`, `f32 | null`, `F | string` with `F = f32`):
  // the member a constant tree adopts (E9.1). Each arm is resolved through its aliases.
  isF32(t: Ty, env: Env): boolean {
    try {
      const r = this.resolve(t, env);
      const arms = (r.k === "union" ? r.arms : [r]).map((a) => this.resolve(a, env));
      const nums = arms.filter((a) => a.k === "name" && NUMERIC.has(a.name));
      return nums.length === 1 && nums[0].k === "name" && nums[0].name === "f32";
    } catch { return false; }
  }
  freeze(t: Expr, env: Env): Expr {
    if (t.k === "index") return { k: "index", e: { k: "val", v: this.eval(t.e, env, null) }, i: { k: "val", v: this.eval(t.i, env, null) } };
    if (t.k === "member") return { k: "member", e: { k: "val", v: this.eval(t.e, env, null) }, name: t.name, opt: t.opt };
    return t;
  }
  targetTy(t: Expr, env: Env): Ty | null {
    if (t.k === "id") return env.lookup(t.name)?.ty ?? null;
    return null;
  }
  // A store keeps the slot's numeric width: a constant adopts the value it replaces (T2.5).
  store(t: Expr, v: Val, env: Env) {
    const adopt = (old: Val, nv: Val): Val => {
      if (nv instanceof Lit) { const k = numKind(old); return k ? litTo(nv, k) : nv; }
      if (old instanceof Lit) return nv;
      const ko = numKind(old), kn = numKind(nv);
      if (ko && kn && ko !== kn) return toKind(nv, ko);
      return nv;
    };
    if (t.k === "id") {
      const b = env.lookup(t.name);
      if (!b) throw new TypeFault(`assignment to undeclared '${t.name}'`);
      if (!b.mut) throw new TypeFault(`assignment to const '${t.name}'`);
      b.v = b.ty ? this.deliver(v, b.ty, env, `assignment to '${t.name}'`) : adopt(b.v, v);
      return;
    }
    if (t.k === "member") {
      const o = this.eval(t.e, env, null);
      if (!(o instanceof Rec)) throw new TypeFault("field store into " + show(o));
      o.f.set(t.name, this.atElem(o, o.f.has(t.name) ? adopt(o.f.get(t.name)!, v) : (v instanceof Lit ? litDefault(v) : v), t.name));
      return;
    }
    if (t.k === "index") {
      const o = this.eval(t.e, env, null);
      const opFns = env.lookupFns("[]=");
      if (opFns) { this.callFn(this.pickOverload(opFns, o, env), [{ name: null, v: o, e: null }, { name: null, v: null, e: t.i }, { name: null, v, e: null }], env, 0); return; }
      if (o instanceof VMap) {
        const k = this.eval(t.i, env, null);
        const key = keyOf(k);
        const old = o.m.get(key);
        o.m.set(key, [old ? old[0] : (k instanceof Lit ? litDefault(k) : k), this.atElem(o, old ? adopt(old[1], v) : this.settleOne(o, v))]);
        return;
      }
      const i = this.asI32(this.eval(t.i, env, null), "index");
      if (Array.isArray(o)) {
        if (i < 0 || i >= o.length) throw new Trap(`index ${i} out of range for length ${o.length}`);
        o[i] = this.atElem(o, adopt(o[i], v));
        return;
      }
      throw new TypeFault("index store into " + show(o));
    }
    throw new TypeFault("assignment target");
  }
  // A value written into a container built at a declared type meets that type's element (or the
  // field's type), so an empty container written there is built at it (ruling 4.4).
  atElem(o: Val, v: Val, field?: string): Val {
    const b = builtAt.get(o as object);
    if (!b) return v;
    const t = b.t;
    const el = t.k === "list" ? t.el : t.k === "map" ? t.val : t.k === "rec" ? t.fields.find((f) => f.name === field)?.ty : undefined;
    // A constant stored there is typed at the element (T2.4). A value is converted only: an alias
    // may hold the container at another declared type, so the built type is no fit check.
    if (!el) return v;
    return v instanceof Lit ? this.deliver(v, el, b.env, "store") : this.convert(v, el, b.env);
  }
  settleOne(m: VMap, v: Val): Val {
    if (!(v instanceof Lit)) return v;
    for (const [, x] of m.m.values()) { const k = numKind(x); if (k) return litTo(v, k); }
    return v;
  }

  member(o: Val, name: string): Val {
    if (o instanceof Rec) {
      if (o.f.has(name)) return num(o.f.get(name)!);
      return null; // T4.4: an omitted field admits null
    }
    if (name === "length") {
      if (Array.isArray(o)) return o.length;
      if (typeof o === "string") return bytes(o).length;
    }
    // spec gap (owner question): a map's `.length` is accepted by the compiler but T7 names no count.
    if ((name === "size" || name === "length") && (o instanceof VMap || o instanceof VSet)) return o.m.size;
    throw new TypeFault(`member '${name}' of ${show(o)}`);
  }

  call(e: Extract<Expr, { k: "call" }>, env: Env, exp: Ty | null = null): Val {
    if (e.f.k === "member") {
      const recvE = e.f.e, name = e.f.name;
      const recv = this.eval(recvE, env, null);
      if (recv === null && e.f.opt) return null;
      if (recv instanceof Rec && recv.f.has(name)) return this.callValue(recv.f.get(name)!, e.args, env, e.line);
      // E11.4: a function in scope whose first parameter is `self`, then the storage operations.
      const fns = env.lookupFns(name);
      const box = env.lookup(name);
      if (fns && fns.some((f) => f.decl.params[0]?.name === "self")) {
        const f = this.pickOverload(fns.filter((f) => f.decl.params[0]?.name === "self"), recv, env);
        return this.callFn(f, [{ name: null, v: recv, e: null }, ...e.args.map((a) => ({ name: a.name, v: null, e: a.e }))], env, e.line);
      }
      if (box && box.v instanceof Bi && STD_METHOD.has(box.v.name)) return box.v.call([recv, ...this.evalArgs(e.args, env)], this);
      return this.method(recv, name, this.evalArgs(e.args, env));
    }
    if (e.f.k === "id") {
      const box = env.lookup(e.f.name);
      if (!box) {
        const fns = env.lookupFns(e.f.name);
        if (fns) {
          let f = fns[0];
          if (fns.length > 1) {
            const first = this.eval(e.args[0].e, env, null);
            f = this.pickOverload(fns, first, env);
            return this.callFn(f, [{ name: null, v: first, e: null }, ...e.args.slice(1).map((a) => ({ name: a.name, v: null, e: a.e }))], env, e.line);
          }
          this.unboundTyParam(f.decl, e.args, exp);
          return this.callFn(f, e.args.map((a) => ({ name: a.name, v: null, e: a.e })), env, e.line, this.dstBindLits(f.decl, e.args, exp, env));
        }
      }
    }
    const f = this.eval(e.f, env, null);
    if (f instanceof Fn) this.unboundTyParam(f.decl, e.args, exp);
    const bind = f instanceof Fn ? this.dstBindLits(f.decl, e.args, exp, env) : null;
    // E2.7 keeps an operand's width, and E9.1 does not make min/max/abs of constants a
    // constant: a constant argument adapts to a typed one, else takes its own default; the
    // destination does not reach it.
    if (f instanceof Bi && ["min", "max", "abs"].includes(f.name)) {
      // A shift of a constant takes a typed argument's width as a constant does (Q8), read from
      // the declarations so each argument still runs once, in order.
      // A shift of a constant, or a tree over one, takes a typed argument's width, or an i64
      // constant argument's (D16492), as a constant does.
      const shifted = (x: Expr) => !isConstTree(x) && x.k !== "if" && constLike(x);
      const pk = e.args.map((a) => shifted(a.e) || isConstTree(a.e) ? null : this.staticKind(a.e, env)).find((k) => k === "i32" || k === "i64")
        ?? (e.args.some((a) => { if (!isConstTree(a.e)) return false; const v = this.eval(a.e, env, null); return v instanceof Lit && v.i !== null && numKind(litDefault(v)) === "i64"; }) ? "i64" : null);
      const args = pk && e.args.some((a) => shifted(a.e)) && !e.args.some((a) => a.name || a.e.k === "spread")
        ? e.args.map((a) => this.eval(a.e, env, shifted(a.e) ? { k: "name", name: pk, args: [] } : null))
        : this.evalArgs(e.args, env);
      const typed = args.some((a) => !(a instanceof Lit) && numKind(a) !== null);
      // D3043: a constant argument that does not fit the typed `i32` beside it makes the call i64.
      if (typed && args.some((a) => numKind(a) === "i32" && !(a instanceof Lit)) && !args.some((a) => !(a instanceof Lit) && numKind(a) !== "i32")) {
        if (args.some((a) => a instanceof Lit && a.i !== null && !(a.join && a.derived && !a.wideDec) && !litHolds(a, "i32"))) {
          return f.call(args.map((a) => a instanceof Lit ? litTo(a, "i64") : typeof a === "number" ? BigInt(a) : a), this);
        }
      }
      // E9.1: a constant tree beside an `f32` argument folds in f32 arithmetic; a tree is pure.
      if (args.some((a) => !(a instanceof Lit) && numKind(a) === "f32")) {
        args.forEach((a, i) => {
          if (!(a instanceof Lit) || !this.foldsAt(e.args[i].e, env)) return;
          f32Fold = true;
          try { args[i] = this.eval(e.args[i].e, env, null); } finally { f32Fold = false; }
        });
      }
      if (emulating.has("D16497") && args.some((a) => a instanceof Lit && a.join && a.f !== null) && args.some((a) => a instanceof Flt && a.w === 32)) {
        return f.call(args.map((a) => a instanceof Lit ? litDefault(a) : a instanceof Flt ? new Flt(a.v, 64) : a), this);
      }
      const lits = args.filter((a) => a instanceof Lit) as Lit[];
      return f.call(args.map((a) => a instanceof Lit && !typed ? (lits.length === 2 ? pairDefault(a, lits[0] === a ? lits[1] : lits[0]) : litDefault(a)) : a), this);
    }
    return this.callValue(f, e.args, env, e.line, bind);
  }

  // The built-in storage operations (E11.4; std.md STD1.3 and its "not yet in force" list).
  method(o: Val, name: string, a: Val[]): Val {
    const settle = (xs: Val[], v: Val): Val => {
      if (!(v instanceof Lit)) return v;
      const k = xs.map(numKind).find((k) => k) ?? null;
      return k ? litTo(v, k) : v;
    };
    if (Array.isArray(o)) {
      switch (name) {
        case "push": for (const v of a) o.push(this.atElem(o, settle(o, v))); return VOID;
        case "pop": return o.length ? o.pop()! : null; // narrowing.md: `pop` is `T | null`
        case "clear": o.length = 0; return VOID;
        case "slice": {
          const s = a.length > 0 ? this.asI32(a[0], "slice start") : 0;
          const t = a.length > 1 ? this.asI32(a[1], "slice end") : o.length;
          if (s < 0 || t > o.length || s > t) throw new Unsupported("spec gap: list slice out of range");
          return o.slice(s, t);
        }
        case "map": return o.map((x) => this.apply(a[0], [x]));
        case "filter": return o.filter((x) => { const r = this.apply(a[0], [x]); return this.asBool(r, "filter predicate"); });
        case "includes": return o.some((x) => equal(x, a[0]));
        case "indexOf": return o.findIndex((x) => equal(x, a[0]));
        case "get": throw new Unsupported("list.get");
      }
    }
    if (o instanceof VMap) {
      switch (name) {
        case "set": {
          const key = keyOf(a[0]);
          const old = o.m.get(key);
          o.m.set(key, [old ? old[0] : (a[0] instanceof Lit ? litDefault(a[0]) : a[0]), this.settleOne(o, a[1])]);
          return VOID;
        }
        case "get": return o.m.get(keyOf(a[0]))?.[1] ?? null;
        case "has": return o.m.has(keyOf(a[0]));
        case "delete": return o.m.delete(keyOf(a[0]));
        case "keys": return [...o.m.values()].map((e) => e[0]);
        case "values": return [...o.m.values()].map((e) => e[1]);
      }
    }
    if (o instanceof VSet) {
      switch (name) {
        case "add": { const v = a[0] instanceof Lit ? litDefault(a[0]) : a[0]; o.m.set(keyOf(v), v); return VOID; }
        case "has": return o.m.has(keyOf(a[0]));
        case "delete": return o.m.delete(keyOf(a[0]));
      }
    }
    if (typeof o === "string") {
      switch (name) {
        case "slice": {
          const b = bytes(o);
          const s = a.length > 0 ? this.asI32(a[0], "slice start") : 0;
          const t = a.length > 1 ? this.asI32(a[1], "slice end") : b.length;
          if (s < 0 || t > b.length || s > t) throw new Unsupported("spec gap: string slice out of range");
          try { return utf8d.decode(b.slice(s, t)); } catch { throw new Unsupported("spec gap: slice inside a code point"); }
        }
        case "includes": return o.includes(a[0] as string);
        case "indexOf": throw new Unsupported("string indexOf (byte offset)");
      }
    }
    throw new Unsupported(`method '${name}' on ${show(o).slice(0, 40)}`);
  }

  apply(f: Val, args: Val[]): Val {
    if (f instanceof Fn) return this.callFn(f, args.map((v) => ({ name: null, v, e: null })), null, 0);
    if (f instanceof Bi) return f.call(args, this);
    throw new TypeFault("call of " + show(f));
  }

  cast(e: Extract<Expr, { k: "as" }>, env: Env): Val {
    // T2.4: a radix constant tree takes a 64-bit cast target as its width (ruling 4.2); an `i32`
    // target reads a wide tree at i64 before its range check, below.
    const wide = e.mode !== "as%" && e.ty.k === "name" && (e.ty.name === "i64" || e.ty.name === "f64");
    let v = this.eval(e.e, env, wide && ((isConstTree(e.e) && treeHas(e.e, "radix")) || (!isConstTree(e.e) && constLike(e.e))) ? e.ty : null);
    const t = this.resolve(e.ty, env);
    if (t.k !== "name" || !NUMERIC.has(t.name) || (typeof v !== "boolean" && !(v instanceof Lit) && !numKind(v))) {
      // E8.6: a cast whose operand is a union selects a member.
      const ok = this.fits(v, t, env);
      if (ok) return v instanceof Lit ? this.deliver(v, t, env, "cast") : v;
      return this.castFail(e, "not a member");
    }
    const k = t.name;
    // E8.4: `as%` wraps between integer widths; a float on either side is refused.
    if (e.mode === "as%" && (k === "f64" || k === "f32")) throw new TypeFault("as% to a float");
    // T1.1/T1.3: `u8` is the one narrow width with a value domain; the others are storage only.
    if (k === "u16" || k === "u32" || k === "i8" || k === "i16") throw new TypeFault(`\`${k}\` is not a value type`);
    if (typeof v === "boolean") v = v ? 1 : 0; // E8.5
    // A literal join tree is no constant: it takes its type before the cast converts it.
    if (v instanceof Lit && v.join && v.derived && v.i !== null) v = litDefault(v);
    // T2.4: a constant operand takes the cast's target as its context, so `0xFFFFFFFF as i64`
    // is 4294967295; one the target cannot hold is a failed cast.
    if (v instanceof Lit && v.radix && v.lone && (k === "f64" || k === "f32")) return radixFloat(v.i!, k === "f64" ? 64 : 32, true);
    if (v instanceof Lit && v.radix && !v.lone && k === "f32") throw new Unsupported("spec gap: a radix constant tree at f32");
    // a radix tree as wide as i64 (a pattern over 32 bits, or a decimal leaf outside i32) is read
    // at i64 before an integer cast checks its range
    if (v instanceof Lit && v.radix && (v.radix === 64 || v.wideDec) && k !== "f64" && k !== "f32" && e.mode !== "as%") v = litTo(v, "i64");
    // 4.1 / D1890: `as f32` / `as f64` rounds an integer constant to the nearest float, once.
    if (v instanceof Lit && v.i !== null && !v.radix && (k === "f32" || k === "f64")) return k === "f64" ? new Flt(Number(v.i), 64) : new Flt(bigToF32(v.i), 32);
    if (v instanceof Lit && e.mode !== "as%") {
      let r: Val;
      // E8.2: a cast of a constant that can never succeed is refused.
      // A join of constants is no constant: its miss is the cast's own failure.
      const never = (why: string): Val => {
        if ((v as Lit).join) return this.castFail(e, "not exact");
        throw new TypeFault(`a constant cast that never succeeds: ${why}`);
      };
      try { r = litTo(v, k === "u8" ? "i32" : k); } catch (x) { if (!(x instanceof LitFault)) throw x; return never(x.message); }
      // E8.3: `as u8` checks the 0..255 domain; a radix constant is its 32-bit pattern there.
      if (k === "u8" && ((r as number) < 0 || (r as number) > 255)) return never(`${String(r)} as u8`);
      return r;
    }
    // D3053 ruling (A): under `as% i64` a radix literal, or a chain of negations over one, is the
    // constant its digits spell; another radix tree there has no ruling (D16494).
    if (v instanceof Lit && v.radix && e.mode === "as%" && k === "i64") {
      if (v.lone || negatedRadix(e.e)) return wrap64(v.i!);
      if (v.radix !== 64 && !v.wideDec) throw new Unsupported("spec gap: a radix constant tree under `as% i64` (D16494)");
    }
    if (v instanceof Lit) v = litDefault(v);
    const src = numKind(v);
    if (!src) throw new TypeFault("cast of " + show(v));
    const asBig = (x: Val): bigint | null => {
      if (typeof x === "number") return BigInt(x);
      if (typeof x === "bigint") return x;
      const f = (x as Flt).v;
      return Number.isInteger(f) ? BigInt(f) : null;
    };
    if (e.mode === "as%") {
      if (src === "f64" || src === "f32") throw new TypeFault("as% on a float");
      const x = asBig(v)!;
      if (k === "i32") return wrap32(x);
      if (k === "i64") return wrap64(x);
      if (k === "u8") return Number(BigInt.asUintN(8, x));
      if (k === "u16") return Number(BigInt.asUintN(16, x));
      throw new Unsupported("as% to " + k);
    }
    if (k === "f64") return new Flt(v instanceof Flt ? v.v : Number(v), 64);
    if (k === "f32") return new Flt(Math.fround(v instanceof Flt ? v.v : Number(v)), 32);
    const x = asBig(v);
    const range: Record<string, [bigint, bigint]> = {
      i32: [BigInt(I32_MIN), BigInt(I32_MAX)], i64: [I64_MIN, I64_MAX], u8: [0n, 255n], u16: [0n, 65535n],
      i8: [-128n, 127n], i16: [-32768n, 32767n], u32: [0n, 0xffffffffn],
    };
    const [lo, hi] = range[k];
    if (x === null || x < lo || x > hi) return this.castFail(e, "not exact");
    return k === "i64" ? x : Number(x);
  }
  castFail(e: Extract<Expr, { k: "as" }>, why: string): Val {
    if (e.mode === "as?") return null;
    if (e.mode === "as!") throw new Trap(`as! ${showTy(e.ty)}: ${why}`);
    throw new NullOut();
  }

  match(e: Extract<Expr, { k: "match" }>, env: Env, exp: Ty | null): Val {
    const v = this.eval(e.e, env, null);
    for (const arm of e.arms) {
      const hit = arm.pats.some((p) => {
        if (p === "_") return true;
        if ("k" in p && ["int", "str", "bool", "null", "un", "float"].includes(p.k)) return equal(v, this.eval(p as Expr, env, null));
        if ("k" in p && p.k === "name" && env.lookup(p.name) && !env.lookupTy(p.name)) return equal(v, env.lookup(p.name)!.v); // S7.6
        return this.isTest(v, p as Ty, env);
      });
      if (hit) return Array.isArray(arm.body) ? this.execBlock(arm.body, new Env(env)) : this.eval(arm.body, env, exp);
    }
    throw new TypeFault("no match arm fits " + show(v));
  }
}

// ── builtins and the std subset ────────────────────────────────────────────────────

const STD_METHOD = new Set(["reverse", "concat", "insert", "indexOf", "includes", "lastIndexOf", "toString", "filled"]);

function mentionsParam(t: Ty, env: Env): boolean {
  switch (t.k) {
    case "name": return env.lookupTy(t.name) === "param" || t.args.some((a) => mentionsParam(a, env));
    case "list": return mentionsParam(t.el, env);
    case "map": return mentionsParam(t.key, env) || mentionsParam(t.val, env);
    case "union": return t.arms.some((a) => mentionsParam(a, env));
    case "rec": return t.fields.some((f) => mentionsParam(f.ty, env));
    case "fn": return t.params.some((a) => mentionsParam(a, env)) || mentionsParam(t.ret, env);
    default: return false;
  }
}

function isNumLit(e: Expr): boolean {
  return e.k === "int" || e.k === "float" || (e.k === "un" && e.op === "-" && isNumLit(e.e));
}

// Whether the type `t` names `name` anywhere in it.
function mentions(t: Ty, name: string): boolean {
  switch (t.k) {
    case "name": return (t.name === name && t.args.length === 0) || t.args.some((a) => mentions(a, name));
    case "list": return mentions(t.el, name);
    case "map": return mentions(t.key, name) || mentions(t.val, name);
    case "union": return t.arms.some((a) => mentions(a, name));
    case "rec": return t.fields.some((f) => mentions(f.ty, name));
    case "fn": return t.params.some((a) => mentions(a, name)) || mentions(t.ret, name);
    case "lit": case "null": return false;
  }
}

function subst(t: Ty, m: Map<string, Ty>): Ty {
  switch (t.k) {
    case "name": return t.args.length === 0 && m.has(t.name) ? m.get(t.name)! : { k: "name", name: t.name, args: t.args.map((a) => subst(a, m)) };
    case "list": return { k: "list", el: subst(t.el, m) };
    case "map": return { k: "map", key: subst(t.key, m), val: subst(t.val, m) };
    case "union": return { k: "union", arms: t.arms.map((a) => subst(a, m)) };
    case "rec": return { k: "rec", fields: t.fields.map((f) => ({ ...f, ty: subst(f.ty, m) })) };
    case "fn": return { k: "fn", params: t.params.map((a) => subst(a, m)), ret: subst(t.ret, m) };
    default: return t;
  }
}

function num(v: Val): Val { return v instanceof Lit ? litDefault(v) : v; }

function installBuiltins(env: Env) {
  const def = (name: string, f: (a: Val[], c: Interp) => Val) => env.vars.set(name, { v: new Bi(name, f), ty: null, mut: false });
  def("print", (a, c) => {
    if (a.length !== 1) throw new TypeFault("print takes one argument");
    c.out.push(c.render(a[0]));
    return VOID;
  });
  def("__trap__", () => { throw new Trap("__trap__"); });
  def("__array_new__", (a, c) => {
    const n = c.asI32(a[0], "__array_new__ count");
    if (n < 0) throw new Trap("__array_new__: negative count");
    return new Array(n).fill(num(a[1]));
  });
  def("Map", () => new VMap());
  def("Set", () => new VSet());
  const fl = (g: (x: number) => number) => (a: Val[]) => {
    const v = num(a[0]);
    if (!(v instanceof Flt)) throw new TypeFault("float intrinsic on " + show(v));
    return new Flt(v.w === 32 ? Math.fround(g(v.v)) : g(v.v), v.w);
  };
  def("trunc", fl(Math.trunc));
  def("floor", fl(Math.floor));
  def("ceil", fl(Math.ceil));
  def("sqrt", fl(Math.sqrt));
  def("nearest", fl((x) => {
    const r = Math.round(x);
    return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : (Object.is(x, -0) ? -0 : r); // ties to even
  }));
  def("abs", (a) => {
    const v = num(a[0]);
    if (typeof v === "number") return v < 0 ? (-v | 0) : v; // E2.7: abs(MIN) wraps to MIN
    if (typeof v === "bigint") return v < 0n ? wrap64(-v) : v;
    if (v instanceof Flt) return new Flt(Math.abs(v.v), v.w);
    throw new TypeFault("abs of " + show(v));
  });
  const mm = (pick: (c: boolean) => boolean) => (a: Val[]) => {
    if (a.length !== 2) throw new TypeFault("min/max take two arguments");

    const k = a[0] instanceof Lit ? (a[1] instanceof Lit ? numKind(litDefault(a[0])) : numKind(a[1])) : a[1] instanceof Lit ? numKind(a[0]) : wider(numKind(a[0])!, numKind(a[1])!);
    const x = toKind(a[0], k!), y = toKind(a[1], k!);
    if (x instanceof Flt) {
      const p = x.v, q = (y as Flt).v;
      if (Number.isNaN(p) || Number.isNaN(q)) return new Flt(NaN, x.w);
      return pick(compare("<", x, y)) ? x : y;
    }
    return pick(compare("<", x, y)) ? x : y;
  };
  def("min", mm((lt) => lt));
  def("max", mm((lt) => !lt));
}

const STD: Record<string, Record<string, (a: Val[], c: Interp) => Val>> = {
  "std:array": {
    reverse: (a) => [...(a[0] as Val[])].reverse(),
    concat: (a) => [...(a[0] as Val[]), ...(a[1] as Val[])],
    insert: (a, c) => {
      const xs = a[0] as Val[];
      const i = c.asI32(a[1], "insert index");
      if (i < 0 || i > xs.length) throw new Trap("insert index out of range");
      const k = xs.length ? numKind(xs[0]) : null;
      xs.splice(i, 0, a[2] instanceof Lit ? (k ? litTo(a[2], k) : litDefault(a[2])) : a[2]);
      return VOID;
    },
    indexOf: (a) => (a[0] as Val[]).findIndex((x) => equal(x, a[1])),
    lastIndexOf: (a) => { const xs = a[0] as Val[]; for (let i = xs.length - 1; i >= 0; i--) if (equal(xs[i], a[1])) return i; return -1; },
    includes: (a) => (a[0] as Val[]).some((x) => equal(x, a[1])),
    filled: (a, c) => {
      const n = c.asI32(a[0], "filled count");
      if (n < 0) throw new Trap("filled: negative count");
      return new Array(n).fill(num(a[1]));
    },
  },
  "std:fmt": {
    toString: (a: Val[], c: Interp) => {
      const v = num(a[0]);
      if (!(typeof v === "number" || typeof v === "bigint" || typeof v === "boolean" || (v instanceof Flt && v.w === 64))) {
        throw new TypeFault("toString of " + show(v));
      }
      return c.render(v);
    },
  },
};
