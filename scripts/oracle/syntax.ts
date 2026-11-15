// The oracle's own lexer and parser for the VL subset it interprets. Written from
// docs/spec/lexical.md and docs/spec/expressions.md, not from compiler/parser.vl, so a
// parser defect in the compiler cannot be shared. Anything outside the subset throws
// `Unsupported`, which the runner reports as "not in the oracle subset", never a verdict.

export class Unsupported extends Error {}

export type Tok = { k: string; v: string; nl: boolean; line: number; parts?: (string | Tok[])[] };

const PUNCT = [
  ">>>=", "<<=", ">>=", "...", "===", ">>>", "as%", "&&", "||", "??", "?.", "==", "!=", "<=", ">=",
  "<<", ">>", "=>", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "++", "--",
  "+", "-", "*", "/", "%", "<", ">", "=", "!", "&", "|", "^", "~", "(", ")", "[", "]", "{",
  "}", ",", ":", ";", ".", "?", "@",
];

export function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0, line = 1, nl = true;
  const push = (k: string, v: string, extra?: Partial<Tok>) => {
    out.push({ k, v, nl, line, ...extra });
    nl = false;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { nl = true; line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") throw new Unsupported("block comment");
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      if (src.slice(i, j) === "as" && src[j] === "%") { push("p", "as%"); i = j + 1; continue; }
      push("id", src.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      if (c === "0" && /[xXbBoO]/.test(src[i + 1] ?? "")) {
        j += 2;
        while (j < src.length && /[0-9A-Fa-f_]/.test(src[j])) j++;
        push("int", src.slice(i, j).replace(/_/g, ""), { parts: ["radix"] });
      } else {
        while (j < src.length && /[0-9_]/.test(src[j])) j++;
        let isFloat = false;
        if (src[j] === "." && /[0-9]/.test(src[j + 1] ?? "")) {
          isFloat = true;
          j++;
          while (j < src.length && /[0-9_]/.test(src[j])) j++;
        }
        if (/[eE]/.test(src[j] ?? "") && /[-+0-9]/.test(src[j + 1] ?? "")) {
          isFloat = true;
          j += 2;
          while (j < src.length && /[0-9]/.test(src[j])) j++;
        }
        push(isFloat ? "float" : "int", src.slice(i, j).replace(/_/g, ""));
      }
      i = j;
      continue;
    }
    if (c === '"') {
      const parts: (string | Tok[])[] = [];
      let buf = "";
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\n") throw new Unsupported("multi-line string");
        if (src[i] === "\\") {
          const e = src[i + 1];
          if (e === "{") {
            let depth = 1, j = i + 2;
            while (j < src.length && depth > 0) {
              if (src[j] === "{") depth++;
              else if (src[j] === "}") depth--;
              j++;
            }
            parts.push(buf);
            buf = "";
            parts.push(lex(src.slice(i + 2, j - 1)));
            i = j;
            continue;
          }
          const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "0": "\0" };
          if (e in simple) { buf += simple[e]; i += 2; continue; }
          if (e === "u" && src[i + 2] === "{") {
            const j = src.indexOf("}", i);
            buf += String.fromCodePoint(parseInt(src.slice(i + 3, j), 16));
            i = j + 1;
            continue;
          }
          throw new Unsupported("string escape \\" + e);
        }
        buf += src[i++];
      }
      i++;
      parts.push(buf);
      push("str", parts.length === 1 ? buf : "", parts.length === 1 ? {} : { parts });
      continue;
    }
    if (c === "'" || c === "`") throw new Unsupported("quote " + c);
    const p = PUNCT.find((p) => src.startsWith(p, i));
    if (!p) throw new Unsupported("character " + JSON.stringify(c));
    push("p", p);
    i += p.length;
  }
  out.push({ k: "eof", v: "", nl: true, line });
  return out;
}

// ── AST ────────────────────────────────────────────────────────────────────────────

export type Ty =
  | { k: "name"; name: string; args: Ty[] }
  | { k: "list"; el: Ty }
  | { k: "map"; key: Ty; val: Ty }
  | { k: "union"; arms: Ty[] }
  | { k: "rec"; fields: { name: string; ty: Ty; opt: boolean }[] }
  | { k: "fn"; params: Ty[]; ret: Ty }
  | { k: "lit"; v: string | bigint | boolean }
  | { k: "null" };

export type Param = { name: string; ty: Ty | null; def: Expr | null; opt: boolean; rest: boolean };
export type FnDecl = { name: string; tparams: string[]; params: Param[]; ret: Ty | null; body: Stmt[] | Expr; line: number };

export type Expr =
  | { k: "int"; v: bigint; radix: boolean }
  | { k: "float"; v: number; raw: string }
  | { k: "str"; v: string }
  | { k: "interp"; parts: (string | Expr)[] }
  | { k: "bool"; v: boolean }
  | { k: "null" }
  | { k: "id"; name: string; line: number }
  | { k: "list"; items: Expr[] } // items may hold spread
  | { k: "spread"; e: Expr }
  | { k: "val"; v: unknown } // an already-evaluated operand (the interpreter's own, never parsed)
  | { k: "obj"; fields: { name: string; e: Expr }[] }
  | { k: "un"; op: string; e: Expr }
  | { k: "bin"; op: string; l: Expr; r: Expr }
  | { k: "assign"; op: string; target: Expr; e: Expr }
  | { k: "incdec"; op: string; prefix: boolean; target: Expr }
  | { k: "call"; f: Expr; args: { name: string | null; e: Expr }[]; line: number }
  | { k: "member"; e: Expr; name: string; opt: boolean }
  | { k: "index"; e: Expr; i: Expr }
  | { k: "as"; e: Expr; mode: string; ty: Ty; line: number }
  | { k: "is"; e: Expr; ty: Ty; neg: boolean }
  | { k: "lambda"; fn: FnDecl }
  | { k: "if"; c: Expr; t: Stmt[]; f: Stmt[] | null }
  | { k: "block"; body: Stmt[] }
  | { k: "match"; e: Expr; arms: { pats: (Expr | Ty | "_")[]; body: Expr | Stmt[] }[] };

export type Stmt =
  | { k: "let"; kind: "let" | "const"; name: string; ty: Ty | null; e: Expr | null }
  | { k: "fn"; fn: FnDecl }
  | { k: "type"; name: string; params: string[]; ty: Ty }
  | { k: "expr"; e: Expr }
  | { k: "return"; e: Expr | null }
  | { k: "break"; label: string | null }
  | { k: "continue"; label: string | null }
  | { k: "while"; c: Expr; body: Stmt[]; label: string | null }
  | { k: "forIn"; v: string; v2: string | null; e: Expr; body: Stmt[]; label: string | null }
  | { k: "forRange"; v: string; a: Expr; b: Expr; incl: boolean; step: Expr | null; body: Stmt[]; label: string | null }
  | { k: "import"; names: { name: string; as: string }[]; from: string };

// ── parser ─────────────────────────────────────────────────────────────────────────

const BIN: string[][] = [
  ["??", "||"], ["&&"], ["|"], ["^"], ["&"], ["==", "!="], ["<", "<=", ">", ">="], ["<<", ">>", ">>>"],
  ["+", "-"], ["*", "/", "%"],
];

export class Parser {
  i = 0;
  noBrace = 0; // >0 while parsing an `if`/`while`/`for` head: `{` opens the body
  constructor(public t: Tok[]) {}
  peek(o = 0): Tok { return this.t[Math.min(this.i + o, this.t.length - 1)]; }
  at(v: string, o = 0): boolean { const t = this.peek(o); return (t.k === "p" || t.k === "id") && t.v === v; }
  eat(v: string): boolean { if (this.at(v)) { this.i++; return true; } return false; }
  want(v: string): Tok {
    if (!this.at(v)) throw new Unsupported(`parse: want ${v}, got ${this.peek().v || this.peek().k} at line ${this.peek().line}`);
    return this.t[this.i++];
  }
  ident(): string {
    const t = this.peek();
    if (t.k !== "id") throw new Unsupported(`parse: want identifier, got ${t.v || t.k} at line ${t.line}`);
    this.i++;
    return t.v;
  }

  program(): Stmt[] {
    const out: Stmt[] = [];
    while (this.peek().k !== "eof") { if (!this.eat(";")) out.push(this.stmt()); }
    return out;
  }

  block(): Stmt[] {
    this.want("{");
    const saved = this.noBrace;
    this.noBrace = 0;
    const out: Stmt[] = [];
    while (!this.at("}")) { if (!this.eat(";")) out.push(this.stmt()); }
    this.want("}");
    this.noBrace = saved;
    return out;
  }

  stmt(): Stmt {
    let label: string | null = null;
    if (this.at("@") && this.peek(1).k === "id") {
      this.i++;
      label = this.ident();
    }
    if (this.at("export")) this.i++;
    const t = this.peek();
    if (t.k === "id") {
      switch (t.v) {
        case "import": return this.importStmt();
        case "const": case "let": {
          this.i++;
          const name = this.ident();
          const ty = this.eat(":") ? this.ty() : null;
          const e = this.eat("=") ? this.expr() : null;
          return { k: "let", kind: t.v as "let" | "const", name, ty, e };
        }
        case "function": {
          this.i++;
          // an operator function is named by its operator in quotes: function "+"(self: V, o: V)
          const nt = this.peek();
          if (nt.k === "str") { this.i++; return { k: "fn", fn: this.fnDecl(nt.v) }; }
          return { k: "fn", fn: this.fnDecl(this.ident()) };
        }
        case "type": {
          if (this.peek(1).k !== "id") break;
          this.i++;
          const name = this.ident();
          const params = this.tparams();
          this.want("=");
          // T10.2: a nominal type is erased, so at run time it is its representation.
          this.eat("new");
          return { k: "type", name, params, ty: this.ty() };
        }
        case "flat": case "class": case "interface": case "enum": case "async": case "try": case "throw":
          throw new Unsupported(t.v);
        case "return": {
          this.i++;
          const n = this.peek();
          if (n.nl || n.k === "eof" || this.at("}") || this.at(";")) return { k: "return", e: null };
          return { k: "return", e: this.expr() };
        }
        case "break": case "continue": {
          this.i++;
          let lab: string | null = null;
          if (this.at("@") && !this.peek().nl) { this.i++; lab = this.ident(); }
          if (!this.peek().nl && !this.at("}") && !this.at(";") && this.peek().k !== "eof") throw new Unsupported("break with value");
          return { k: t.v as "break", label: lab };
        }
        case "while": {
          this.i++;
          this.noBrace++;
          const c = this.expr();
          this.noBrace--;
          return { k: "while", c, body: this.block(), label };
        }
        case "for": {
          this.i++;
          const v = this.ident();
          const v2 = this.eat(",") ? this.ident() : null;
          this.want("in");
          this.noBrace++;
          const a = this.expr();
          if (this.at("to") || this.at("until")) {
            const incl = this.peek().v === "to";
            this.i++;
            const b = this.expr();
            const step = this.eat("step") ? this.expr() : null;
            this.noBrace--;
            return { k: "forRange", v, a, b, incl, step, body: this.block(), label };
          }
          this.noBrace--;
          return { k: "forIn", v, v2, e: a, body: this.block(), label };
        }
      }
    }
    if (label && this.at("{")) throw new Unsupported("labelled block");
    if (this.at("{") && !this.objAhead()) return { k: "expr", e: { k: "block", body: this.block() } };
    return { k: "expr", e: this.expr() };
  }

  // S3.5: braces whose first token is a name followed by `:` or `,` hold an object.
  objAhead(): boolean {
    const a = this.peek(1), b = this.peek(2);
    if (a.k === "p" && a.v === "}") return false;
    return (a.k === "id" || a.k === "str") && b.k === "p" && (b.v === ":" || b.v === ",");
  }

  importStmt(): Stmt {
    this.want("import");
    this.want("{");
    const names: { name: string; as: string }[] = [];
    while (!this.eat("}")) {
      const name = this.ident();
      const as = this.eat("as") ? this.ident() : name;
      names.push({ name, as });
      this.eat(",");
    }
    this.want("from");
    const t = this.peek();
    if (t.k !== "str") throw new Unsupported("import source");
    this.i++;
    return { k: "import", names, from: t.v };
  }

  tparams(): string[] {
    const ps: string[] = [];
    if (this.eat("<")) {
      while (!this.eat(">")) {
        ps.push(this.ident());
        if (this.eat(":")) this.ty();
        this.eat(",");
      }
    }
    return ps;
  }

  fnDecl(name: string): FnDecl {
    const line = this.peek().line;
    const tparams = this.tparams();
    const params = this.params();
    const ret = this.eat(":") ? this.ty() : null;
    if (this.eat("=>")) return { name, tparams, params, ret, body: this.expr(), line };
    return { name, tparams, params, ret, body: this.block(), line };
  }

  params(): Param[] {
    this.want("(");
    const ps: Param[] = [];
    while (!this.eat(")")) {
      const rest = this.eat("...");
      const name = this.ident();
      const opt = this.eat("?");
      const ty = this.eat(":") ? this.ty() : null;
      const def = this.eat("=") ? this.expr() : null;
      ps.push({ name, ty, def, opt, rest });
      this.eat(",");
    }
    return ps;
  }

  // ── types ──
  ty(): Ty {
    this.eat("|");
    const arms = [this.tyPostfix()];
    while (this.eat("|")) arms.push(this.tyPostfix());
    if (this.at("&")) throw new Unsupported("intersection type");
    return arms.length === 1 ? arms[0] : { k: "union", arms };
  }
  tyPostfix(): Ty {
    let t = this.tyAtom();
    while (this.at("[") && this.at("]", 1) && !this.peek().nl) { this.i += 2; t = { k: "list", el: t }; }
    return t;
  }
  tyAtom(): Ty {
    const t = this.peek();
    if (t.k === "str") { this.i++; return { k: "lit", v: t.v }; }
    if (t.k === "int") { this.i++; return { k: "lit", v: BigInt(t.v) }; }
    if (t.k === "float") { this.i++; return { k: "lit", v: "\u0000float:" + t.v }; }
    if (t.k === "p" && t.v === "-" && this.peek(1).k === "int") { this.i += 2; return { k: "lit", v: -BigInt(this.peek(-1).v) }; }
    if (this.eat("(")) {
      // a parenthesised type or a function type
      const save = this.i;
      let depth = 1, j = this.i;
      while (depth > 0) {
        const v = this.t[j].v;
        if (this.t[j].k === "p" && (v === "(")) depth++;
        if (this.t[j].k === "p" && (v === ")")) depth--;
        j++;
      }
      if (this.t[j]?.v === "=>") {
        this.i = save - 1;
        const ps = this.params();
        this.want("=>");
        return { k: "fn", params: ps.map((p) => p.ty ?? { k: "name", name: "any", args: [] }), ret: this.ty() };
      }
      const inner = this.ty();
      this.want(")");
      return inner;
    }
    if (this.eat("{")) {
      if (this.eat("[")) {
        if (this.peek().k === "id" && this.at(":", 1)) this.i += 2;
        const key = this.ty();
        this.want("]");
        this.want(":");
        const val = this.ty();
        this.eat(",");
        this.want("}");
        return { k: "map", key, val };
      }
      const fields: { name: string; ty: Ty; opt: boolean }[] = [];
      while (!this.eat("}")) {
        this.eat("readonly");
        const name = this.ident();
        const opt = this.eat("?");
        this.want(":");
        fields.push({ name, ty: this.ty(), opt });
        if (!this.eat(",")) this.eat(";");
      }
      return { k: "rec", fields };
    }
    const name = this.ident();
    if (name === "null") return { k: "null" };
    if (name === "true" || name === "false") return { k: "lit", v: name === "true" };
    if (name === "readonly") return this.tyPostfix();
    const args: Ty[] = [];
    if (this.at("<") && !this.peek().nl) {
      this.i++;
      while (!this.eat(">")) {
        if (this.at(">>")) { this.t[this.i] = { ...this.peek(), v: ">" }; this.t.splice(this.i, 0, { ...this.peek() }); }
        args.push(this.ty());
        this.eat(",");
      }
    }
    if (name === "Map" && args.length === 2) return { k: "map", key: args[0], val: args[1] };
    return { k: "name", name, args };
  }

  // ── expressions ──
  expr(): Expr {
    const l = this.binary(0);
    for (const op of ["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=", ">>>="]) {
      if (this.at(op) && this.peek().k === "p") {
        this.i++;
        return { k: "assign", op, target: l, e: this.expr() };
      }
    }
    return l;
  }

  binary(level: number): Expr {
    if (level === BIN.length) return this.castChain();
    let l = this.binary(level + 1);
    for (;;) {
      const t = this.peek();
      if (t.k !== "p" || !BIN[level].includes(t.v)) return l;
      this.i++;
      l = { k: "bin", op: t.v, l, r: this.binary(level + 1) };
    }
  }

  castChain(): Expr {
    let e = this.unary();
    for (;;) {
      if (this.at("as") && !this.peek().nl) {
        const line = this.peek().line;
        this.i++;
        let mode = "as";
        if (this.at("?") || this.at("!")) { mode = "as" + this.peek().v; this.i++; }
        e = { k: "as", e, mode, ty: this.tyPostfix(), line };
        continue;
      }
      if (this.at("as%")) {
        const line = this.peek().line;
        this.i++;
        e = { k: "as", e, mode: "as%", ty: this.tyPostfix(), line };
        continue;
      }
      if ((this.at("is") || (this.at("!") && this.at("is", 1))) && !this.peek().nl) {
        const neg = this.at("!");
        this.i += neg ? 2 : 1;
        e = { k: "is", e, ty: this.ty(), neg };
        continue;
      }
      if (this.at("!is")) throw new Unsupported("!is");
      return e;
    }
  }

  unary(): Expr {
    const t = this.peek();
    if (t.k === "p" && ["-", "!", "~", "+"].includes(t.v)) {
      this.i++;
      return { k: "un", op: t.v, e: t.v === "!" ? this.castChain() : this.unary() }; // E1.4: `!x is T` is `!(x is T)`
    }
    if (t.k === "p" && (t.v === "++" || t.v === "--")) {
      this.i++;
      return { k: "incdec", op: t.v, prefix: true, target: this.unary() };
    }
    return this.postfix(this.primary());
  }

  postfix(e: Expr): Expr {
    for (;;) {
      const t = this.peek();
      if (t.k !== "p") return e;
      if (t.v === "." || t.v === "?.") {
        this.i++;
        const nt = this.peek();
        if (nt.k === "int") throw new Unsupported("numeric member");
        e = { k: "member", e, name: this.ident(), opt: t.v === "?." };
        continue;
      }
      if (t.nl) return e;
      if (t.v === "(") {
        this.i++;
        const args: { name: string | null; e: Expr }[] = [];
        while (!this.eat(")")) {
          let name: string | null = null;
          if (this.peek().k === "id" && this.at(":", 1)) { name = this.ident(); this.i++; }
          if (this.eat("...")) args.push({ name, e: { k: "spread", e: this.expr() } });
          else args.push({ name, e: this.expr() });
          this.eat(",");
        }
        e = { k: "call", f: e, args, line: t.line };
        continue;
      }
      if (t.v === "[") {
        this.i++;
        const i = this.expr();
        this.want("]");
        e = { k: "index", e, i };
        continue;
      }
      if (t.v === "++" || t.v === "--") {
        this.i++;
        e = { k: "incdec", op: t.v, prefix: false, target: e };
        continue;
      }
      if (t.v === "<" && e.k === "id" && this.looksLikeTypeArgs()) {
        // explicit type arguments on a call: f<i32>(x) — erased
        this.i++;
        while (!this.eat(">")) { this.ty(); this.eat(","); }
        continue;
      }
      return e;
    }
  }

  looksLikeTypeArgs(): boolean {
    let j = this.i + 1, depth = 1;
    while (j < this.t.length && depth > 0) {
      const t = this.t[j];
      if (t.k === "p" && t.v === "<") depth++;
      else if (t.k === "p" && t.v === ">") depth--;
      else if (t.k === "p" && !["[", "]", "|", ",", "{", "}", ":"].includes(t.v)) return false;
      j++;
    }
    return this.t[j]?.v === "(";
  }

  isLambdaAhead(): boolean {
    // at `(`: find the matching `)`, then `=>` or `: T =>`
    let j = this.i, depth = 0;
    for (; j < this.t.length; j++) {
      const t = this.t[j];
      if (t.k === "p" && (t.v === "(" || t.v === "[" || t.v === "{")) depth++;
      if (t.k === "p" && (t.v === ")" || t.v === "]" || t.v === "}")) { depth--; if (depth === 0) break; }
    }
    const n = this.t[j + 1];
    if (!n) return false;
    if (n.v === "=>") return true;
    if (n.v !== ":") return false;
    for (let k = j + 2; k < this.t.length && k < j + 40; k++) {
      if (this.t[k].v === "=>") return true;
      if (this.t[k].nl) return false;
    }
    return false;
  }

  primary(): Expr {
    const t = this.peek();
    if (t.k === "int") { this.i++; return { k: "int", v: BigInt(t.v), radix: !!t.parts }; }
    if (t.k === "float") { this.i++; return { k: "float", v: Number(t.v), raw: t.v }; }
    if (t.k === "str") {
      this.i++;
      if (!t.parts) return { k: "str", v: t.v };
      return {
        k: "interp",
        parts: t.parts.map((p) => typeof p === "string" ? p : new Parser([...p, { k: "eof", v: "", nl: true, line: t.line }]).expr()),
      };
    }
    if (t.k === "p") {
      if (t.v === "(") {
        if (this.isLambdaAhead()) {
          const line = t.line;
          const params = this.params();
          const ret = this.eat(":") ? this.ty() : null;
          this.want("=>");
          const saved = this.noBrace;
          this.noBrace = 0;
          const body = this.at("{") && !this.objAhead() ? this.block() : this.expr();
          this.noBrace = saved;
          return { k: "lambda", fn: { name: "<lambda>", tparams: [], params, ret, body, line } };
        }
        this.i++;
        const saved = this.noBrace;
        this.noBrace = 0;
        const e = this.expr();
        this.noBrace = saved;
        this.want(")");
        return e;
      }
      if (t.v === "[") {
        this.i++;
        const items: Expr[] = [];
        while (!this.eat("]")) {
          if (this.eat("...")) items.push({ k: "spread", e: this.expr() });
          else items.push(this.expr());
          this.eat(",");
        }
        return { k: "list", items };
      }
      if (t.v === "{" && this.noBrace === 0) {
        this.i++;
        const fields: { name: string; e: Expr }[] = [];
        while (!this.eat("}")) {
          const nt = this.peek();
          const name = nt.k === "str" ? (this.i++, nt.v) : this.ident();
          if (this.eat(":")) fields.push({ name, e: this.expr() });
          else fields.push({ name, e: { k: "id", name, line: nt.line } });
          this.eat(",");
        }
        return { k: "obj", fields };
      }
      if (t.v === "@") throw new Unsupported("labelled block expression");
    }
    if (t.k === "id") {
      switch (t.v) {
        case "true": case "false": this.i++; return { k: "bool", v: t.v === "true" };
        case "null": this.i++; return { k: "null" };
        case "if": {
          this.i++;
          this.noBrace++;
          const c = this.expr();
          this.noBrace--;
          const tb = this.block();
          let fb: Stmt[] | null = null;
          if (this.at("else")) {
            this.i++;
            if (this.at("if")) fb = [{ k: "expr", e: this.primary() }];
            else fb = this.block();
          }
          return { k: "if", c, t: tb, f: fb };
        }
        case "match": {
          this.i++;
          this.noBrace++;
          const e = this.expr();
          this.noBrace--;
          this.want("{");
          const arms: { pats: (Expr | Ty | "_")[]; body: Expr | Stmt[] }[] = [];
          while (!this.eat("}")) {
            const pats: (Expr | Ty | "_")[] = [];
            do {
              if (this.eat("_")) pats.push("_");
              else if (this.peek().k === "id" && !["null", "true", "false"].includes(this.peek().v)) pats.push(this.tyPostfix());
              else pats.push(this.unary());
            } while (this.eat("|"));
            if (this.at("if")) throw new Unsupported("match guard");
            this.want("=>");
            const body = this.at("{") && !this.objAhead() ? this.block() : this.expr();
            arms.push({ pats, body });
            this.eat(",");
          }
          return { k: "match", e, arms };
        }
        case "function": {
          this.i++;
          const name = this.peek().k === "id" ? this.ident() : "<fn>";
          return { k: "lambda", fn: this.fnDecl(name) };
        }
        case "await": case "new": case "this": case "typeof": case "yield":
          throw new Unsupported(t.v);
      }
      if (this.at("=>", 1)) {
        // x => body
        const name = this.ident();
        this.i++;
        const body = this.at("{") && !this.objAhead() ? this.block() : this.expr();
        return { k: "lambda", fn: { name: "<lambda>", tparams: [], params: [{ name, ty: null, def: null, opt: false, rest: false }], ret: null, body, line: t.line } };
      }
      this.i++;
      return { k: "id", name: t.v, line: t.line };
    }
    throw new Unsupported(`parse: unexpected ${t.v || t.k} at line ${t.line}`);
  }
}

export function parse(src: string): Stmt[] {
  return new Parser(lex(src)).program();
}
