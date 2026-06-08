// AST-driven source formatter for VL (roadmap D4).
//
// `format(source)` parses the source to the typed AST (via `checkOnly`), then
// walks that AST and *generates* canonical VL source from it — it does NOT
// reformat the token stream. This is the approach the token-reformatter spike
// (PR #51) could not take: it relies on the per-node source spans, the flat
// comment list with placement/kind, and the `compoundOperator`/`annotated`
// reprint-fidelity fields the parser now records (Track G / PR #53).
//
// Guarantees (asserted over the corpus in tests/format_test.ts):
//   - Idempotent:   format(format(s)) === format(s).
//   - Round-trip:   the AST of format(s) is structurally equivalent to the AST
//                   of s (comparing the shape the printer reads, ignoring spans
//                   and the typechecker's resolved type decorations).
//   - Comment-preserving: every comment survives, re-emitted own-line above vs
//                   trailing the same line, with `///` vs `//` preserved.
//
// Faithfulness vs the type system: the typechecker fully *resolves* every type
// it records (`i32` becomes a giant structural Object; a `type` alias body is
// discarded, leaving only an empty marker Block). Reconstructing source from
// those resolved `VLType`s is hopeless. So wherever the surface syntax is a
// TYPE or a PARAMETER LIST — variable/parameter/return annotations, `is`/`!is`
// check types, and whole `type` alias declarations — the printer recovers the
// exact source text by slicing it back out via spans + a small bracket-aware
// token scan, rather than re-synthesizing it. Everything else (expressions,
// control flow, statements) is generated structurally, with line reflow.

import type {
  Context,
  Position,
  VLArgumentNode,
  VLArrayLiteralNode,
  VLBinaryOperationNode,
  VLBlockNode,
  VLCallNode,
  VLExpression,
  VLForInNode,
  VLForNode,
  VLFunctionCallNode,
  VLFunctionDeclarationNode,
  VLIfNode,
  VLIsNode,
  VLNullCoalesceNode,
  VLObjectLiteralNode,
  VLPropertyAccessNode,
  VLReturnNode,
  VLStatement,
  VLUnaryOperationNode,
  VLVariableDeclarationNode,
  VLWhileNode,
} from "./ast.ts";
import { spanOf } from "./ast.ts";
import type { NodeSpans } from "./ast.ts";
import type { Comment, Token } from "./lexer.ts";
import { tokenize } from "./lexer.ts";
import { checkOnly } from "./compile.ts";

const INDENT = "  ";
const DEFAULT_WIDTH = 80;

/** Format VL source into canonical form. Pure: parses internally. */
export const format = (source: string, width = DEFAULT_WIDTH): string => {
  const { ast, comments, spans } = checkOnly(source);
  const { tokens } = tokenize(source);
  const printer = new Printer(source, tokens, comments, spans, width);
  return printer.run(ast.statements);
};

// ---- source position helpers ---------------------------------------------

/** Precomputed offset of the first character of each 1-based line. */
const lineOffsets = (source: string): number[] => {
  const offsets = [0, 0]; // index 0 unused; line 1 starts at offset 0
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
};

class Printer {
  private readonly starts: number[];
  /** Comments not yet emitted, by source order; consumed as we pass them. */
  private readonly pending: Comment[];
  private out: string[] = [];

  constructor(
    private readonly source: string,
    private readonly tokens: Token[],
    comments: Comment[],
    private readonly spanMap: NodeSpans,
    private readonly width: number,
  ) {
    this.starts = lineOffsets(source);
    this.pending = [...comments];
  }

  // -- low-level source access --------------------------------------------

  private offset(p: Position): number {
    return (this.starts[p.line] ?? this.source.length) + p.column;
  }

  /** Verbatim source text covered by `ctx`. */
  private slice(ctx: Context): string {
    return this.source.slice(this.offset(ctx.start), this.offset(ctx.stop));
  }

  private span(node: object): Context | undefined {
    return spanOf(this.spanMap, node);
  }

  // -- token scanning over a node's source window -------------------------

  /** Real (non-NEWLINE) tokens whose start offset lies in [from, to). */
  private tokensIn(from: number, to: number): Token[] {
    const result: Token[] = [];
    for (const t of this.tokens) {
      if (t.kind === "NEWLINE" || t.kind === "EOF") continue;
      const o = this.offset(t.start);
      if (o >= from && o < to) result.push(t);
    }
    return result;
  }

  // ===================================================================
  //  entry
  // ===================================================================

  run(statements: VLStatement[]): string {
    return this.formatProgram(statements);
  }

  private formatProgram(statements: VLStatement[]): string {
    this.emitStatements(statements, 0);
    // Any comments after the last statement (trailing file comments).
    this.flushRemaining(0);
    let text = this.out.join("");
    // Normalize: collapse 3+ blank lines to 1, ensure single trailing newline,
    // strip trailing whitespace on each line.
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    text = text.replace(/^\n+/, "").replace(/\n*$/, "\n");
    if (text === "\n") text = "";
    return text;
  }

  // ===================================================================
  //  output buffer
  // ===================================================================

  private push(s: string): void {
    this.out.push(s);
  }

  private line(indent: number, text: string): void {
    this.push(INDENT.repeat(indent) + text + "\n");
  }

  // ===================================================================
  //  comments
  // ===================================================================

  /** Comments that start strictly before source line `line`. */
  private commentsBefore(line: number): Comment[] {
    const taken: Comment[] = [];
    while (this.pending.length && this.pending[0].start.line < line) {
      taken.push(this.pending.shift()!);
    }
    return taken;
  }

  /** A trailing comment on exactly `line` (consumed if present). */
  private trailingOn(line: number): Comment | undefined {
    const c = this.pending[0];
    if (c && c.placement === "trailing" && c.start.line === line) {
      return this.pending.shift();
    }
    return undefined;
  }

  /** Emit any own-line comments that precede source `line`, at `indent`. */
  private emitLeadingComments(indent: number, line: number): void {
    for (const c of this.commentsBefore(line)) {
      this.line(indent, c.text);
    }
  }

  /** Drain every remaining comment as own-line text at `indent`. */
  private flushRemaining(indent: number): void {
    for (const c of this.pending.splice(0)) this.line(indent, c.text);
  }

  // ===================================================================
  //  statements
  // ===================================================================

  private emitStatements(
    statements: VLStatement[],
    indent: number,
  ): void {
    let prevLine = 0;
    for (const stmt of statements) {
      const ctx = this.span(stmt);
      const startLine = ctx?.start.line ?? this.fallbackStartLine(stmt) ??
        prevLine + 1;
      // Preserve a single blank line the user left between statements.
      const leading = this.peekLeadingCount(startLine);
      if (prevLine > 0 && startLine - prevLine > 1 + leading && this.out.length) {
        this.push("\n");
      }
      this.emitLeadingComments(indent, startLine);
      this.emitStatement(stmt, indent);
      prevLine = ctx?.stop.line ?? startLine;
    }
  }

  /**
   * Source start line for a statement that carries no span. Today only `type`
   * alias declarations lack a span (they desugar to an empty marker Block); peek
   * the token stream (without consuming) for the matching `type Name` so its
   * leading comments and blank lines are ordered correctly.
   */
  private fallbackStartLine(stmt: VLStatement): number | undefined {
    if (stmt.type === "Block" && stmt.label?.startsWith("__type_")) {
      const name = stmt.label.slice("__type_".length, -"__".length);
      for (let i = this.typeCursor; i < this.tokens.length - 1; i++) {
        if (this.tokens[i].kind !== "TYPE") continue;
        const id = this.tokens[i + 1];
        if (id.kind === "ID" && id.text === name) {
          return this.tokens[i].start.line;
        }
      }
    }
    return undefined;
  }

  /** How many pending comments precede `line` (peek without consuming). */
  private peekLeadingCount(line: number): number {
    let n = 0;
    while (n < this.pending.length && this.pending[n].start.line < line) n++;
    return n;
  }

  /** Whether a pending comment falls strictly inside `ctx` (own-line interior). */
  private hasInteriorComment(ctx: Context): boolean {
    for (const c of this.pending) {
      if (c.start.line < ctx.start.line) continue;
      if (c.start.line > ctx.stop.line) break;
      // A comment between the first and last line of the construct, or an
      // own-line comment on the start line before code, is interior.
      if (c.start.line > ctx.start.line && c.start.line <= ctx.stop.line) {
        return true;
      }
    }
    return false;
  }

  /**
   * Drop pending comments that lie *inside* `ctx` (they survive within the
   * verbatim slice). A trailing comment on the stop line sits AFTER the slice's
   * end, so it is NOT dropped — the caller re-attaches it via `trailingOn`.
   */
  private consumeInterior(ctx: Context): void {
    while (this.pending.length) {
      const c = this.pending[0];
      if (c.start.line < ctx.start.line || c.start.line > ctx.stop.line) break;
      if (c.start.line === ctx.stop.line && c.placement === "trailing") break;
      this.pending.shift();
    }
  }

  private emitStatement(stmt: VLStatement, indent: number): void {
    const ctx = this.span(stmt);
    const trailLine = ctx?.stop.line ?? ctx?.start.line ?? 0;

    // A "leaf" statement (declaration / return / expression) whose source spans
    // multiple lines AND encloses own-line comments cannot be re-laid-out
    // without displacing those comments — collapsing it to one line would orphan
    // them. Preserve faithfulness by re-emitting the original source verbatim.
    // Verbatim fallback: a leaf statement with interior comments (can't be
    // re-laid-out without orphaning them), OR a statement whose subtree contains
    // a desugared construct the AST can't faithfully reprint (operator-named or
    // method-shorthand functions, operator/index-method call desugars). Reproduce
    // the original source for that statement, preserving comments and grouping.
    if (ctx && (containsHard(stmt) || this.hasInteriorComment(ctx)) && isLeafStatement(stmt)) {
      this.consumeInterior(ctx);
      const verbatim = this.slice(ctx).replace(/[ \t]+\n/g, "\n");
      const lines = verbatim.split("\n");
      const trailer = this.trailingOn(trailLine);
      const suffix = trailer ? ` ${trailer.text}` : "";
      // First line at the target indent; continuation lines keep their source
      // indentation verbatim (the construct is reproduced as written). A trailing
      // comment on the last line is re-attached after the slice.
      lines.forEach((l, i) => {
        const tail = i === lines.length - 1 ? suffix : "";
        if (i === 0) this.line(indent, l.trimStart() + tail);
        else this.push(l.replace(/\s+$/, "") + tail + "\n");
      });
      return;
    }

    switch (stmt.type) {
      case "VariableDeclaration":
        return this.emitVarDecl(stmt, indent, trailLine);
      case "Return":
        return this.emitReturn(stmt, indent, trailLine);
      case "While":
        return this.emitWhile(stmt, indent);
      case "For":
        return this.emitFor(stmt, indent);
      case "ForIn":
        return this.emitForIn(stmt, indent);
      case "Break":
        return this.emitBreakContinue("break", stmt.label, indent, trailLine);
      case "Continue":
        return this.emitBreakContinue(
          "continue",
          stmt.label,
          indent,
          trailLine,
        );
      case "Block":
        return this.emitBlockStatement(stmt, indent);
      case "If":
        return this.emitIf(stmt, indent);
      case "FunctionDeclaration":
        return this.emitFunction(stmt, indent);
      default:
        return this.emitExpressionStatement(stmt as VLExpression, indent);
    }
  }

  private emitExpressionStatement(expr: VLExpression, indent: number): void {
    const ctx = this.span(expr);
    const line = ctx?.stop.line ?? 0;
    const rendered = this.expr(expr, indent);
    this.emitMultiline(rendered, indent, line);
  }

  /** Emit a possibly-multiline rendering, attaching a trailing comment. */
  private emitMultiline(rendered: string, indent: number, line: number): void {
    const c = this.trailingOn(line);
    const suffix = c ? ` ${c.text}` : "";
    const lines = rendered.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const last = i === lines.length - 1;
      this.push(
        INDENT.repeat(indent) + lines[i] + (last ? suffix : "") + "\n",
      );
    }
  }

  private emitVarDecl(
    node: VLVariableDeclarationNode,
    indent: number,
    line: number,
  ): void {
    // `mutable` is true for `let` (reassignable), false for `const` (immutable
    // binding) — JS/TS semantics (parser: let => mutable).
    const kw = node.mutable ? "let" : "const";
    let head = `${node.exported ? "export " : ""}${kw} ${node.name}`;
    if (node.annotated) {
      const annotation = this.recoverVarAnnotation(node);
      if (annotation !== undefined) head += `: ${annotation}`;
    }
    if (node.value !== undefined) {
      const valueText = this.expr(node.value, indent, head.length + 3);
      this.emitMultiline(`${head} = ${valueText}`, indent, line);
    } else {
      this.emitMultiline(head, indent, line);
    }
  }

  /** Recover the `: T` annotation source for a variable declaration. */
  private recoverVarAnnotation(
    node: VLVariableDeclarationNode,
  ): string | undefined {
    const ctx = this.span(node);
    if (!ctx) return undefined;
    const from = this.offset(ctx.start);
    const to = this.offset(ctx.stop);
    const toks = this.tokensIn(from, to);
    // Find `name` then the following `:`; the annotation runs to the matching
    // `=` (value start) or the node end, at bracket depth 0.
    let i = 0;
    while (i < toks.length && toks[i].text !== node.name) i++;
    if (i + 1 >= toks.length || toks[i + 1].kind !== "COLON") return undefined;
    const startTok = toks[i + 2];
    if (!startTok) return undefined;
    let depth = 0;
    let endOffset = to;
    for (let j = i + 2; j < toks.length; j++) {
      const k = toks[j].kind;
      if (k === "LPAREN" || k === "LBRACK" || k === "LBRACE") depth++;
      else if (k === "RPAREN" || k === "RBRACK" || k === "RBRACE") depth--;
      else if (depth === 0 && k === "EQUAL") {
        endOffset = this.offset(toks[j].start);
        break;
      }
    }
    return this.source.slice(this.offset(startTok.start), endOffset)
      .trim()
      .replace(/\s+/g, " ");
  }

  private emitReturn(
    node: VLReturnNode,
    indent: number,
    line: number,
  ): void {
    if (node.value === undefined) {
      this.emitMultiline("return", indent, line);
      return;
    }
    const valueText = this.expr(node.value, indent, "return ".length);
    this.emitMultiline(`return ${valueText}`, indent, line);
  }

  private emitBreakContinue(
    kw: string,
    label: string | undefined,
    indent: number,
    line: number,
  ): void {
    this.emitMultiline(label ? `${kw} ${label}` : kw, indent, line);
  }

  private emitBlockStatement(node: VLBlockNode, indent: number): void {
    // A `type` alias desugars to an empty Block tagged `__type_<name>__`; its
    // body and span are discarded by the parser, so recover the whole `type …`
    // declaration verbatim from source.
    if (node.label && node.label.startsWith("__type_")) {
      const result = this.takeTypeAlias(node.label);
      if (result !== undefined) {
        const { text, stopLine } = result;
        const parts = text.split("\n");
        // Attach a trailing comment on the alias's last source line to the final
        // emitted line (it would otherwise be displaced onto its own line).
        const trailer = this.trailingOn(stopLine);
        const suffix = trailer ? ` ${trailer.text}` : "";
        parts.forEach((part, i) => {
          const last = i === parts.length - 1;
          this.line(indent, part + (last ? suffix : ""));
        });
        return;
      }
    }
    // A free-standing block `{ … }`.
    this.line(indent, node.label ? `${node.label}: {` : "{");
    this.emitStatements(node.statements, indent + 1);
    this.line(indent, "}");
  }

  /**
   * Recover a `type Name … = …` declaration's source. The parser discards both
   * the body and the span, so scan the token stream for the matching `type`
   * statement (by name, in source order) and slice from `type` to the end of
   * its body. Type aliases are consumed in order so repeated names still match.
   */
  private typeCursor = 0;
  private takeTypeAlias(label: string): { text: string; stopLine: number } | undefined {
    const name = label.slice("__type_".length, -"__".length);
    for (let i = this.typeCursor; i < this.tokens.length - 1; i++) {
      if (this.tokens[i].kind !== "TYPE") continue;
      const id = this.tokens[i + 1];
      if (id.kind !== "ID" || id.text !== name) continue;
      this.typeCursor = i + 1;
      return this.sliceTypeAlias(i);
    }
    return undefined;
  }

  /** Slice from the `type` token at index `ti` to the end of the alias body. */
  private sliceTypeAlias(ti: number): { text: string; stopLine: number } {
    const start = this.offset(this.tokens[ti].start);
    let depth = 0; // `<`/`{`/`[`/`(` nesting (so a body brace/newline is kept)
    let end = this.offset(this.tokens[ti].stop);
    let stopLine = this.tokens[ti].start.line; // line of the last content token
    for (let j = ti + 1; j < this.tokens.length; j++) {
      const t = this.tokens[j];
      if (t.kind === "EOF") {
        end = this.offset(t.start);
        break;
      }
      if (t.kind === "NEWLINE") {
        // A depth-0 newline ends the declaration once the body (if any) has
        // begun. A bodyless `type Foo` ends at the first depth-0 newline; an
        // `= …` body ends at the first depth-0 newline after the `=`.
        if (depth === 0) break;
        continue;
      }
      if (
        t.kind === "LPAREN" || t.kind === "LBRACK" || t.kind === "LBRACE" ||
        t.kind === "LESS_THAN"
      ) depth++;
      else if (
        t.kind === "RPAREN" || t.kind === "RBRACK" || t.kind === "RBRACE" ||
        t.kind === "GREATER_THAN"
      ) depth--;
      end = this.offset(t.stop);
      stopLine = t.start.line;
    }
    return {
      text: this.source.slice(start, end).replace(/[ \t]+\n/g, "\n").trimEnd(),
      stopLine,
    };
  }

  // ===================================================================
  //  control flow
  // ===================================================================

  /** Whether a statement is a real `{ … }` block (not a type-alias marker). */
  private isBlock(stmt: VLStatement): stmt is VLBlockNode {
    return stmt.type === "Block" && !stmt.label?.startsWith("__type_");
  }

  /** Emit the statements inside a braced block body. */
  private emitBlockBody(stmt: VLBlockNode, indent: number): void {
    this.emitStatements(stmt.statements, indent + 1);
  }

  // A loop / `if` body is rendered either as a brace block (when the source
  // wrote one) or as an indented bare statement on the following line (the
  // block-less form) — preserving the AST shape exactly (a brace block parses
  // to a `Block` node; a bare body does not).

  private emitWhile(node: VLWhileNode, indent: number): void {
    const label = node.label ? `${node.label}: ` : "";
    const cond = this.expr(node.condition, indent);
    if (this.isBlock(node.statement)) {
      this.line(indent, `${label}while ${cond} {`);
      this.emitBlockBody(node.statement, indent);
      this.line(indent, "}");
    } else {
      // Consume any trailing comment on the header line so it stays attached
      // to the `while …` line rather than being displaced to after the enclosing
      // construct by `flushRemaining`.
      const headerLine = this.span(node)?.start.line ?? 0;
      const trailer = this.trailingOn(headerLine);
      this.line(indent, `${label}while ${cond}${trailer ? ` ${trailer.text}` : ""}`);
      this.emitStatement(node.statement, indent + 1);
    }
  }

  private emitFor(node: VLForNode, indent: number): void {
    const label = node.label ? `${node.label}: ` : "";
    const from = this.expr(node.from, indent);
    const to = this.expr(node.to, indent);
    let head = `${label}for ${node.variable} in ${from} to ${to}`;
    if (node.step !== undefined) head += ` step ${this.expr(node.step, indent)}`;
    const headerLine = this.span(node)?.start.line ?? 0;
    this.emitLoopBody(head, node.statement, indent, headerLine);
  }

  private emitForIn(node: VLForInNode, indent: number): void {
    const label = node.label ? `${node.label}: ` : "";
    const iter = this.expr(node.iterable, indent);
    const headerLine = this.span(node)?.start.line ?? 0;
    this.emitLoopBody(
      `${label}for ${node.variable} in ${iter}`,
      node.statement,
      indent,
      headerLine,
    );
  }

  private emitLoopBody(
    head: string,
    body: VLStatement,
    indent: number,
    headerLine = 0,
  ): void {
    if (this.isBlock(body)) {
      this.line(indent, `${head} {`);
      this.emitBlockBody(body, indent);
      this.line(indent, "}");
    } else {
      // Consume any trailing comment on the header line so it stays attached
      // to the loop-header line rather than being displaced to after the
      // enclosing construct by `flushRemaining`.
      const trailer = headerLine ? this.trailingOn(headerLine) : undefined;
      this.line(indent, `${head}${trailer ? ` ${trailer.text}` : ""}`);
      this.emitStatement(body, indent + 1);
    }
  }

  private emitIf(node: VLIfNode, indent: number): void {
    // An `if … else if … [else]` chain (an `else` branch that is itself an
    // `If`) whose every branch is a brace block renders as a sequence of
    // clauses: one line when the whole chain fits, otherwise one clause per
    // line broken at each `else` / `else if` boundary — keeping each clause's
    // `{ … }` body inline when it is short. (The plain `if`/`if … else` block
    // form falls through to the per-line layout below.)
    if (this.emitIfChain(node, indent)) return;
    // Block form when every branch is a brace block; otherwise the inline
    // `then`/`else` form (preserving the bare-statement AST shape).
    const allBlocks = node.conditionals.every((c) => this.isBlock(c.statement)) &&
      (node.else === undefined || this.isBlock(node.else));
    if (allBlocks) {
      // One-line collapse (D4): a plain single `if cond { stmt }` or
      // `if cond { a } else { b }` renders on one line when it fits the width
      // and each brace body inlines (a single simple leaf statement with no
      // overlapping comment). Only the single-conditional form is collapsed;
      // multi-`elseif` chains keep their `} elseif … {` layout. When the
      // collapse does not apply the code falls through to the byte-identical
      // multi-line layout below — never reflowing existing multi-line blocks.
      if (node.conditionals.length === 1) {
        const oneLine = this.collapseSingleIf(node, indent);
        if (oneLine !== undefined) {
          this.line(indent, oneLine);
          return;
        }
      }
      node.conditionals.forEach((c, i) => {
        const cond = this.expr(c.condition, indent);
        this.line(indent, i === 0 ? `if ${cond} {` : `} elseif ${cond} {`);
        this.emitBlockBody(c.statement as VLBlockNode, indent);
      });
      if (node.else !== undefined) {
        this.line(indent, "} else {");
        this.emitBlockBody(node.else as VLBlockNode, indent);
      }
      this.line(indent, "}");
      return;
    }
    // Inline form: each conditional `if/elseif cond then <stmt>`, branches that
    // are themselves blocks still print as blocks on their own lines.
    node.conditionals.forEach((c, i) => {
      const cond = this.expr(c.condition, indent);
      const kw = i === 0 ? "if" : "elseif";
      if (this.isBlock(c.statement)) {
        this.line(indent, `${kw} ${cond} {`);
        this.emitBlockBody(c.statement, indent);
        this.line(indent, "}");
      } else {
        const body = this.statementInline(c.statement, indent);
        this.line(indent, `${kw} ${cond} then ${body}`);
      }
    });
    if (node.else !== undefined) {
      if (this.isBlock(node.else)) {
        this.line(indent, "else {");
        this.emitBlockBody(node.else, indent);
        this.line(indent, "}");
      } else {
        this.line(indent, `else ${this.statementInline(node.else, indent)}`);
      }
    }
  }

  /**
   * One-line rendering of a plain single-conditional `if` whose every brace
   * body is inlinable — `if cond { stmt }` or `if cond { a } else { b }` —
   * when the whole line fits the width. Returns `undefined` when the body (or
   * else body) cannot inline (multi-statement, compound, or an overlapping
   * comment that would be orphaned) or the line is too wide, so the caller
   * keeps the existing multi-line block layout byte-for-byte. The node is
   * known to have exactly one conditional with a block body and, if present,
   * a block `else`.
   */
  private collapseSingleIf(node: VLIfNode, indent: number): string | undefined {
    const cond = this.expr(node.conditionals[0].condition, indent);
    const thenBody = this.inlineBlockBody(
      node.conditionals[0].statement as VLBlockNode,
      indent,
    );
    if (thenBody === undefined) return undefined;
    let line = `if ${cond} ${thenBody}`;
    if (node.else !== undefined) {
      const elseBody = this.inlineBlockBody(node.else as VLBlockNode, indent);
      if (elseBody === undefined) return undefined;
      line += ` else ${elseBody}`;
    }
    if (indent * INDENT.length + line.length > this.width) return undefined;
    return line;
  }

  // A clause of an `if … else if … else` chain: a condition (absent for the
  // trailing `else`) and a brace-block body.
  private flattenIfChain(
    node: VLIfNode,
  ): { cond: VLExpression | null; body: VLBlockNode }[] {
    const clauses: { cond: VLExpression | null; body: VLBlockNode }[] = [];
    let cur: VLIfNode | undefined = node;
    while (cur) {
      for (const c of cur.conditionals) {
        clauses.push({ cond: c.condition, body: c.statement as VLBlockNode });
      }
      const tail: VLStatement | undefined = cur.else;
      if (tail === undefined) return clauses;
      if (tail.type === "If") {
        cur = tail; // `else if` — keep walking the chain.
        continue;
      }
      clauses.push({ cond: null, body: tail as VLBlockNode });
      return clauses;
    }
    return clauses;
  }

  /**
   * Render an `if … else if … [else]` chain (an `else` branch that is itself an
   * `If`) whose every branch is a brace block. Returns `false` when the node is
   * not such a chain (no `else if`, or some branch is not a block), leaving it
   * to the caller's plain block / inline forms.
   *
   * Layout: collapse the whole chain to one line when it fits; otherwise break
   * at each `else` / `else if` boundary onto its own line, keeping each clause's
   * `{ … }` body inline when it is short and block-broken when it is not. The
   * AST is unchanged either way — `else if` re-parses to a nested `If` and the
   * inline brace block re-parses to the same single-statement `Block`.
   */
  private emitIfChain(node: VLIfNode, indent: number): boolean {
    if (node.else === undefined || node.else.type !== "If") return false;
    const clauses = this.flattenIfChain(node);
    if (!clauses.every((cl) => this.isBlock(cl.body))) return false;

    const head = (cond: VLExpression | null, first: boolean): string => {
      if (cond === null) return "else";
      const kw = first ? "if" : "else if";
      return `${kw} ${this.expr(cond, indent)}`;
    };

    // Try the inline body for every clause; a `null` from any clause (an
    // interior comment, or a body that is not a single simple statement) means
    // the chain cannot collapse and that clause must block-break when wrapped.
    const inlineBodies = clauses.map((cl) => this.inlineBlockBody(cl.body, indent));

    // One line when every body inlines and the whole chain fits the width.
    if (inlineBodies.every((b) => b !== undefined)) {
      const oneLine = clauses
        .map((cl, i) => `${head(cl.cond, i === 0)} ${inlineBodies[i]}`)
        .join(" ");
      if (indent * INDENT.length + oneLine.length <= this.width) {
        this.line(indent, oneLine);
        return true;
      }
    }

    // Wrapped: one clause per line, aligned under the `if`.
    clauses.forEach((cl, i) => {
      const h = head(cl.cond, i === 0);
      const inline = inlineBodies[i];
      if (inline !== undefined &&
        indent * INDENT.length + h.length + 1 + inline.length <= this.width
      ) {
        this.line(indent, `${h} ${inline}`);
      } else {
        this.line(indent, `${h} {`);
        this.emitBlockBody(cl.body, indent);
        this.line(indent, "}");
      }
    });
    return true;
  }

  /**
   * Render a brace block with a single simple statement as inline `{ stmt }`,
   * or `{}` when empty. Returns `undefined` when the body cannot be kept inline:
   * it holds more than one statement, a compound statement (a nested block /
   * control-flow), or an own-line comment that would be orphaned by collapsing.
   */
  private inlineBlockBody(
    block: VLBlockNode,
    indent: number,
  ): string | undefined {
    const ctx = this.span(block);
    // Any pending comment that overlaps the block (interior own-line, or a
    // trailing comment on a single-line body) would be orphaned or relocated by
    // collapsing — keep the body block-broken so it is emitted in place.
    if (ctx && this.commentInSpan(ctx)) return undefined;
    if (block.statements.length === 0) return "{}";
    if (block.statements.length !== 1) return undefined;
    const stmt = block.statements[0];
    // Only simple leaf statements collapse cleanly to one line.
    if (!isLeafStatement(stmt)) return undefined;
    const inner = this.statementInline(stmt, indent);
    if (inner.includes("\n")) return undefined;
    return `{ ${inner} }`;
  }

  /** Whether any pending comment starts on a line covered by `ctx`. */
  private commentInSpan(ctx: Context): boolean {
    for (const c of this.pending) {
      if (c.start.line < ctx.start.line) continue;
      if (c.start.line > ctx.stop.line) break;
      return true;
    }
    return false;
  }

  // ===================================================================
  //  function declarations
  // ===================================================================

  private emitFunction(node: VLFunctionDeclarationNode, indent: number): void {
    const ctx = this.span(node);
    // Operator-named or otherwise un-faithful function: reproduce verbatim.
    // Also verbatim when the body is a single expression (not a Block) that spans
    // multiple lines and contains an own-line comment — re-laying it out would
    // displace the comment to after the closing brace.
    const bodyIsExpr = ctx && !this.isBlock(node.body) &&
      this.hasInteriorComment(ctx);
    if (ctx && (node.name === undefined || !isIdentifier(node.name) || bodyIsExpr)) {
      this.consumeInterior(ctx);
      const lines = this.slice(ctx).replace(/[ \t]+\n/g, "\n").split("\n");
      lines.forEach((l, i) =>
        i === 0
          ? this.line(indent, l.trimStart())
          : this.push(l.replace(/\s+$/, "") + "\n")
      );
      return;
    }
    const header = (node.exported ? "export " : "") + this.functionHeader(node);
    const body = node.body;
    if (this.isBlock(body)) {
      // An empty body renders inline as `{}` (a void function) — keeping it on
      // one line is also format-idempotent: re-parsing `{}` yields the same
      // empty Block, whereas `{\n}` would round-trip back to `{}`.
      if (body.statements.length === 0) {
        this.line(indent, `${header} {}`);
        return;
      }
      this.line(indent, `${header} {`);
      this.emitStatements(body.statements, indent + 1);
      this.line(indent, "}");
    } else {
      // Single-expression / single-statement body.
      const rendered = this.statementInline(body, indent);
      this.line(indent, `${header} ${rendered}`);
    }
  }

  /** Render a one-line function body (expression or simple statement). */
  private statementInline(stmt: VLStatement, indent: number): string {
    switch (stmt.type) {
      case "Return":
        return stmt.value === undefined
          ? "return"
          : `return ${this.expr(stmt.value, indent)}`;
      case "Break":
        return stmt.label ? `break ${stmt.label}` : "break";
      case "Continue":
        return stmt.label ? `continue ${stmt.label}` : "continue";
      case "VariableDeclaration":
      case "While":
      case "For":
      case "ForIn":
      case "Block":
      case "If": {
        // Fall back to a block wrapper for compound single-statement bodies.
        const ctx = this.span(stmt);
        return ctx ? this.slice(ctx) : "";
      }
      default:
        return this.expr(stmt as VLExpression, indent);
    }
  }

  /**
   * Recover the function signature verbatim from source: `function name(params):
   * Ret`. Parameter types and the return type are TYPE syntax (lossy in the
   * AST), so they are sliced from source, not synthesized. Parameters are split
   * on top-level commas so a long list can still be reflowed.
   */
  private functionHeader(node: VLFunctionDeclarationNode): string {
    const ctx = this.span(node);
    const name = node.name ? `function ${node.name}` : "function";
    if (!ctx) return `${name}()`;
    const from = this.offset(ctx.start);
    // Bound the header at the body start so the return-type scan never swallows
    // the body. The body may be a Block or a bare expression — both carry spans.
    const bodyCtx = this.span(node.body);
    const to = bodyCtx ? this.offset(bodyCtx.start) : this.offset(ctx.stop);
    const toks = this.tokensIn(from, to);
    // Locate the parameter parens: the first LPAREN after the name/type-params.
    let i = 0;
    // Skip `function`, the name (id or operator symbol), optional `<…>`.
    if (toks[i] && toks[i].kind === "FUNCTION") i++;
    // skip name token if present
    if (
      node.name && toks[i] &&
      (toks[i].text === node.name || toks[i].kind === "ID")
    ) i++;
    // skip type params `< … >`
    if (toks[i] && toks[i].kind === "LESS_THAN") {
      let d = 0;
      for (; i < toks.length; i++) {
        if (toks[i].kind === "LESS_THAN") d++;
        else if (toks[i].kind === "GREATER_THAN") {
          d--;
          if (d === 0) {
            i++;
            break;
          }
        }
      }
    }
    while (i < toks.length && toks[i].kind !== "LPAREN") i++;
    if (i >= toks.length) return `${name}()`;
    const lparen = i;
    let depth = 0;
    let rparen = lparen;
    for (let j = lparen; j < toks.length; j++) {
      if (toks[j].kind === "LPAREN") depth++;
      else if (toks[j].kind === "RPAREN") {
        depth--;
        if (depth === 0) {
          rparen = j;
          break;
        }
      }
    }
    // Split params on top-level commas between the parens.
    const params: string[] = [];
    let cur: Token[] = [];
    let d = 0;
    for (let j = lparen + 1; j < rparen; j++) {
      const t = toks[j];
      if (t.kind === "LPAREN" || t.kind === "LBRACK" || t.kind === "LBRACE") {
        d++;
      } else if (
        t.kind === "RPAREN" || t.kind === "RBRACK" || t.kind === "RBRACE"
      ) d--;
      if (d === 0 && t.kind === "COMMA") {
        params.push(this.joinTokens(cur));
        cur = [];
      } else cur.push(t);
    }
    if (cur.length) params.push(this.joinTokens(cur));
    // Type params + name prefix, sliced verbatim (covers `<T>` faithfully).
    const prefix = this.source.slice(from, this.offset(toks[lparen].start))
      .trim().replace(/\s+/g, " ");
    // Return annotation: tokens after rparen, if a leading COLON.
    let ret = "";
    if (toks[rparen + 1] && toks[rparen + 1].kind === "COLON") {
      const retToks = toks.slice(rparen + 2);
      ret = `: ${this.joinTokens(retToks)}`;
    }
    const paramList = this.wrapList("(", params, ")", 0, prefix.length + ret.length);
    return `${prefix}${paramList}${ret}`;
  }

  /** Reassemble token texts with canonical spacing for a type/param slice. */
  private joinTokens(toks: Token[]): string {
    if (toks.length === 0) return "";
    const from = this.offset(toks[0].start);
    const to = this.offset(toks[toks.length - 1].stop);
    return this.source.slice(from, to).trim().replace(/\s+/g, " ");
  }

  // ===================================================================
  //  expressions
  // ===================================================================

  /**
   * Render an expression. `column` is the visual column the expression starts
   * at (its indent already applied by the caller for the first line), used to
   * decide reflow. Returns possibly-multiline text (continuation lines already
   * indented relative to `indent`).
   */
  private expr(node: VLExpression, indent: number, column = 0): string {
    return this.exprInner(node, indent, column);
  }

  private exprInner(
    node: VLExpression,
    indent: number,
    column: number,
  ): string {
    switch (node.type) {
      case "Name":
        return node.name;
      case "IntegerLiteral":
      case "RealLiteral":
      case "StringLiteral":
      case "BooleanLiteral":
      case "NullLiteral":
        return this.literal(node);
      case "BinaryOperation":
        return this.binary(node, indent, column);
      case "UnaryOperation":
        return this.unary(node, indent, column);
      case "NullCoalesce":
        return this.nullCoalesce(node, indent, column);
      case "Is":
        return this.isExpr(node, indent, column);
      case "PropertyAccess":
      case "OptionalAccess":
        return this.access(node, indent, column);
      case "IndexAccess":
        return `${this.primary(node.array, indent, column)}[${
          this.expr(node.index, indent, column)
        }]`;
      case "FunctionCall":
        return this.functionCall(node, indent, column);
      case "Call":
        return this.call(node, indent, column);
      case "ObjectLiteral":
        return this.objectLiteral(node, indent, column);
      case "ArrayLiteral":
        return this.arrayLiteral(node, indent, column);
      case "FunctionDeclaration":
        return this.functionExpr(node, indent);
      case "If":
        return this.ifExpr(node, indent);
      case "Block":
        return this.blockExpr(node, indent);
      default: {
        // Unknown / unsupported shape: fall back to a faithful source slice.
        const ctx = this.span(node);
        return ctx ? this.slice(ctx).replace(/\s+/g, " ") : "";
      }
    }
  }

  private literal(node: VLExpression): string {
    // Prefer the verbatim source lexeme (preserves number base, string escapes,
    // and char literals' original spelling) via the node span.
    const ctx = this.span(node);
    if (ctx) {
      const raw = this.slice(ctx).trim();
      if (raw.length) return raw;
    }
    // Synthesized literals (no span): render structurally.
    switch (node.type) {
      case "IntegerLiteral":
        return node.text;
      case "RealLiteral":
        return Number.isInteger(node.value)
          ? `${node.value}.0`
          : String(node.value);
      case "StringLiteral":
        return JSON.stringify(node.value);
      case "BooleanLiteral":
        return String(node.value);
      case "NullLiteral":
        return "null";
      default:
        return "";
    }
  }

  private binary(
    node: VLBinaryOperationNode,
    indent: number,
    column: number,
  ): string {
    // Assignment (`=`, and compound `+=` etc.) prints with the surface operator.
    if (node.operator === "=") {
      const op = node.compoundOperator ? `${node.compoundOperator}=` : "=";
      const left = this.expr(node.left, indent, column);
      // For a compound assignment the AST's `right` is the desugared `a + b`;
      // print only the addend (its right operand) after the compound operator.
      const rhs = node.compoundOperator &&
          node.right.type === "BinaryOperation"
        ? node.right.right
        : node.right;
      const right = this.expr(rhs, indent, column + left.length + op.length + 2);
      return `${left} ${op} ${right}`;
    }
    return this.binaryChain(node, indent, column);
  }

  /** Render an n-ary chain of same/compatible operators, reflowing if long. */
  private binaryChain(
    node: VLBinaryOperationNode,
    indent: number,
    column: number,
  ): string {
    const prec = binPrec(node.operator);
    const parts: { op: string | null; text: string; node: VLExpression }[] = [];
    const flatten = (n: VLExpression, leading: string | null) => {
      if (
        n.type === "BinaryOperation" && n.operator !== "=" &&
        binPrec(n.operator) === prec && leftAssoc(n.operator)
      ) {
        flatten(n.left, leading);
        flatten(n.right, n.operator);
      } else {
        const r = this.expr(n, indent, column);
        const wrapped = this.parenForChain(n, r, prec);
        parts.push({ op: leading, text: wrapped, node: n });
      }
    };
    flatten(node.left, null);
    flatten(node.right, node.operator);

    const oneLine = parts
      .map((p) => (p.op ? `${p.op} ` : "") + p.text)
      .join(" ");
    if (column + oneLine.length <= this.width && !oneLine.includes("\n")) {
      return oneLine;
    }
    // Reflow. VL newlines are significant, so a chain can only break with the
    // operator at the END of the previous line (the parser skips newlines after
    // consuming an infix operator, not before). Each operand after the first
    // starts a continuation line indented one level deeper.
    const cont = INDENT;
    let result = `${parts[0].text} ${parts[1].op}`;
    for (let i = 1; i < parts.length; i++) {
      const tail = i + 1 < parts.length ? ` ${parts[i + 1].op}` : "";
      result += `\n${cont}${parts[i].text}${tail}`;
    }
    return result;
  }

  private parenForChain(
    child: VLExpression,
    rendered: string,
    parentPrec: number,
  ): string {
    if (child.type === "BinaryOperation" && child.operator !== "=") {
      if (binPrec(child.operator) < parentPrec) return `(${rendered})`;
    }
    if (child.type === "NullCoalesce" && parentPrec > 0) return `(${rendered})`;
    return rendered;
  }

  private unary(
    node: VLUnaryOperationNode,
    indent: number,
    column: number,
  ): string {
    let operand = this.expr(node.operand, indent, column);
    // `!` / prefix ops bind tighter than any binary/coalesce/is operand, so a
    // composite operand needs parentheses to preserve grouping (`!(a > b)`).
    const o = node.operand.type;
    if (
      node.operator === "!" &&
      (o === "BinaryOperation" || o === "NullCoalesce" || o === "Is")
    ) {
      operand = `(${operand})`;
    }
    if (node.prefix) return `${node.operator}${operand}`;
    return `${operand}${node.operator}`;
  }

  private nullCoalesce(
    node: VLNullCoalesceNode,
    indent: number,
    column: number,
  ): string {
    const left = this.expr(node.left, indent, column);
    const right = this.expr(node.right, indent, column + left.length + 4);
    return `${left} ?? ${right}`;
  }

  private isExpr(node: VLIsNode, indent: number, column: number): string {
    const value = this.expr(node.value, indent, column);
    const op = node.negated ? "!is" : "is";
    const type = this.recoverIsType(node);
    return `${value} ${op} ${type}`;
  }

  /** Recover the check-type source of an `is`/`!is` from the node's span. */
  private recoverIsType(node: VLIsNode): string {
    const ctx = this.span(node);
    if (!ctx) return "";
    const toks = this.tokensIn(this.offset(ctx.start), this.offset(ctx.stop));
    // Find the `is` (optionally preceded by `!`); the type is everything after.
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].kind === "IS") {
        return this.joinTokens(toks.slice(i + 1));
      }
    }
    return "";
  }

  private access(
    node: VLPropertyAccessNode | VLExpression,
    indent: number,
    column: number,
  ): string {
    if (node.type === "PropertyAccess") {
      // A `[]`/operator-method desugar carries a non-identifier property; fall
      // back to a source slice so it reprints as written (`o[k]`, `a + b`).
      if (!isIdentifier(node.property)) {
        const ctx = this.span(node);
        if (ctx) return this.slice(ctx).replace(/\s+/g, " ");
      }
      return `${this.primary(node.object, indent, column)}.${node.property}`;
    }
    if (node.type === "OptionalAccess") {
      return `${this.primary(node.object, indent, column)}?.${node.property}`;
    }
    return "";
  }

  /**
   * Render an expression in a postfix-operand position (the receiver of `.`,
   * `?.`, `[…]`, or a `Call`). A composite operand (binary, unary, coalesce,
   * `is`, `if`-expression) must be parenthesized so the postfix binds to the
   * whole value, preserving the AST grouping (`(a + b).length`).
   */
  private primary(node: VLExpression, indent: number, column: number): string {
    const rendered = this.expr(node, indent, column);
    switch (node.type) {
      case "BinaryOperation":
      case "UnaryOperation":
      case "NullCoalesce":
      case "Is":
      case "If":
        return `(${rendered})`;
      default:
        return rendered;
    }
  }

  private functionCall(
    node: VLFunctionCallNode,
    indent: number,
    column: number,
  ): string {
    // A `self`-method / operator desugar can surface here with the receiver as
    // the first argument; reprint from source when the callee name is not a
    // plain identifier (an operator like `+`).
    if (!isIdentifier(node.function)) {
      const ctx = this.span(node);
      if (ctx) return this.slice(ctx).replace(/\s+/g, " ");
    }
    const args = node.arguments.map((a) => this.argument(a, indent, column));
    return `${node.function}${this.wrapList("(", args, ")", indent, column + node.function.length)}`;
  }

  private call(node: VLCallNode, indent: number, column: number): string {
    const callee = this.expr(node.callee, indent, column);
    if (node.callee.type === "PropertyAccess" && !isIdentifier(node.callee.property)) {
      const ctx = this.span(node);
      if (ctx) return this.slice(ctx).replace(/\s+/g, " ");
    }
    const args = node.arguments.map((a) => this.argument(a, indent, column));
    return `${callee}${this.wrapList("(", args, ")", indent, column + callee.length)}`;
  }

  private argument(
    arg: VLArgumentNode,
    indent: number,
    column: number,
  ): string {
    const value = this.expr(arg.value, indent, column);
    return arg.name ? `${arg.name}: ${value}` : value;
  }

  private objectLiteral(
    node: VLObjectLiteralNode,
    indent: number,
    column: number,
  ): string {
    if (node.properties.length === 0) return "{}";
    const items = node.properties.map((p) => {
      const value = this.expr(p.value, indent, column);
      if (p.name.type === "Name") return `${p.name.name}: ${value}`;
      if (p.name.type === "StringLiteral") {
        const ctx = this.span(p.name);
        const key = ctx ? this.slice(ctx) : JSON.stringify(p.name.value);
        return `${key}: ${value}`;
      }
      // Computed key `[expr]: value`.
      const key = this.expr(p.name as VLExpression, indent, column);
      return `[${key}]: ${value}`;
    });
    return this.wrapList("{ ", items, " }", indent, column);
  }

  private arrayLiteral(
    node: VLArrayLiteralNode,
    indent: number,
    column: number,
  ): string {
    if (node.values.length === 0) return "[]";
    const items = node.values.map((v) => this.expr(v, indent, column));
    return this.wrapList("[", items, "]", indent, column);
  }

  private functionExpr(
    node: VLFunctionDeclarationNode,
    indent: number,
  ): string {
    const header = this.functionHeader(node);
    const body = node.body;
    if (body.type === "Block" && !body.label?.startsWith("__type_")) {
      const lines: string[] = [`${header} {`];
      const saved = this.out;
      this.out = [];
      this.emitStatements(body.statements, indent + 1);
      const inner = this.out.join("");
      this.out = saved;
      for (const l of inner.replace(/\n$/, "").split("\n")) lines.push(l);
      lines.push(`${INDENT.repeat(indent)}}`);
      // Strip the leading indent of the first line (caller positions it).
      return lines
        .map((l, i) => i === 0 ? l : l)
        .join("\n");
    }
    return `${header} ${this.statementInline(body, indent)}`;
  }

  private ifExpr(node: VLIfNode, indent: number): string {
    // An `if` used as an expression value. Single-line when every branch is a
    // simple expression; otherwise fall back to the source slice.
    const simple = (s: VLStatement): boolean =>
      s.type !== "Block" && s.type !== "If" && s.type !== "While" &&
      s.type !== "For" && s.type !== "ForIn";
    const allSimple = node.conditionals.every((c) => simple(c.statement)) &&
      (node.else === undefined || simple(node.else));
    if (allSimple) {
      let parts = "";
      node.conditionals.forEach((c, i) => {
        const cond = this.expr(c.condition, indent);
        const body = this.expr(c.statement as VLExpression, indent);
        parts += i === 0
          ? `if ${cond} then ${body}`
          : ` elseif ${cond} then ${body}`;
      });
      if (node.else !== undefined) {
        parts += ` else ${this.expr(node.else as VLExpression, indent)}`;
      }
      return parts;
    }
    const ctx = this.span(node);
    return ctx ? this.slice(ctx) : "";
  }

  private blockExpr(node: VLBlockNode, indent: number): string {
    if (node.label?.startsWith("__type_")) {
      const result = this.takeTypeAlias(node.label);
      return result?.text ?? "";
    }
    const lines: string[] = ["{"];
    const saved = this.out;
    this.out = [];
    this.emitStatements(node.statements, indent + 1);
    const inner = this.out.join("");
    this.out = saved;
    for (const l of inner.replace(/\n$/, "").split("\n")) lines.push(l);
    lines.push(`${INDENT.repeat(indent)}}`);
    return lines.join("\n");
  }

  // ===================================================================
  //  list wrapping (calls / arrays / objects / params)
  // ===================================================================

  /**
   * Render `open item, item, … close`, collapsing to one line when it fits in
   * `width` from `column`, otherwise breaking one item per continuation line.
   *
   * Trailing comma policy: the SINGLE-LINE (collapsed) form never carries a
   * trailing comma, but the MULTI-LINE (wrapped) form emits one after the last
   * element — before the closing delimiter on its own line — for cleaner diffs.
   * The parser now accepts a trailing comma in every list it produces (call
   * arguments, array / object literals, parameter lists), so this is faithful
   * and idempotent: re-formatting wrapped output re-parses to the same list and
   * re-emits the same trailing comma.
   */
  private wrapList(
    open: string,
    items: string[],
    close: string,
    indent: number,
    column: number,
  ): string {
    if (items.length === 0) return `${open.trim()}${close.trim()}`;
    const oneLine = `${open}${items.join(", ")}${close}`;
    if (column + oneLine.length <= this.width && !oneLine.includes("\n")) {
      return oneLine;
    }
    // Multi-line: each item on its own line, one indent level deeper, with a
    // comma trailing EVERY item — including the last, before the close on its
    // own line. Nested multi-line items keep their own internal line breaks.
    const pad = INDENT.repeat(indent + 1);
    const closePad = INDENT.repeat(indent);
    const openTok = open.trimEnd();
    const closeTok = close.trimStart();
    const body = items
      .map((it) => `${pad}${it},`)
      .join("\n");
    return `${openTok}\n${body}\n${closePad}${closeTok}`;
  }
}

// ---- precedence helpers ----------------------------------------------------

// Mirrors the parser's `infixBp` ordering (C/JS precedence) so the formatter
// inserts the minimal parentheses needed to preserve meaning. Bitwise `| ^ &`
// sit below equality/relational; shifts `<< >> >>>` between relational and
// additive. All binary operators are left-associative.
const PRECEDENCE: Record<string, number> = {
  "||": 4,
  "&&": 6,
  "|": 7,
  "^": 8,
  "&": 9,
  "==": 10,
  "!=": 10,
  "<": 12,
  "<=": 12,
  ">": 12,
  ">=": 12,
  "<<": 13,
  ">>": 13,
  ">>>": 13,
  "+": 14,
  "-": 14,
  "*": 16,
  "/": 16,
  "%": 16,
};

const binPrec = (op: string): number => PRECEDENCE[op] ?? 0;

const leftAssoc = (_op: string): boolean => true;

const isIdentifier = (s: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);

// Whether a subtree contains a construct the AST can't faithfully reprint, so
// the enclosing statement must be sliced verbatim from source. These are all
// desugarings that lose surface syntax: an operator-named function name, an
// anonymous (method-shorthand) function value, a call whose callee/function is
// an operator symbol or `[]`/`[]=` index method, or a PropertyAccess to such a
// non-identifier property (the operator/index-trap desugar).
const containsHard = (node: unknown): boolean => {
  if (!node || typeof node !== "object") return false;
  const n = node as Record<string, unknown> & { type?: string };
  switch (n.type) {
    case "FunctionDeclaration": {
      const name = n.name as string | undefined;
      // Operator-named (`function +`) or anonymous (method-shorthand /
      // function-valued field): both lose surface form in the AST.
      if (name === undefined || !isIdentifier(name)) return true;
      break;
    }
    case "FunctionCall": {
      if (!isIdentifier(n.function as string)) return true;
      break;
    }
    case "PropertyAccess":
    case "OptionalAccess": {
      if (!isIdentifier(n.property as string)) return true;
      break;
    }
  }
  for (const k of Object.keys(n)) {
    if (k === "functionType" || k === "checkType") continue;
    const v = n[k];
    if (Array.isArray(v)) {
      for (const e of v) if (containsHard(e)) return true;
    } else if (v && typeof v === "object" && "type" in (v as object)) {
      if (containsHard(v)) return true;
    }
  }
  return false;
};

// A "leaf" statement holds no nested statement list of its own — collapsing it
// to a single line is the only re-layout option, so interior comments force a
// verbatim slice. Control-flow / blocks recurse and place comments per-child.
const isLeafStatement = (stmt: VLStatement): boolean => {
  switch (stmt.type) {
    case "While":
    case "For":
    case "ForIn":
    case "If":
    case "Block":
    case "FunctionDeclaration":
      return false;
    default:
      return true;
  }
};
