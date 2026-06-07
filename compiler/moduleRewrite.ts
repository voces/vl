// Scope-aware AST name rewriter for the module merge (phase 1).
//
// The multi-file driver (`compiler/modules.ts`) mangles each module's top-level
// value/type names to whole-program-unique names so two modules' same-named
// privates (the self-host `Tok`/`advance` collision) don't clash in the single
// merged wasm module, and so an `import { x }` reference is rewritten to point at
// the *exporting* module's mangled `x`. This file performs that rewrite over a
// module's AST.
//
// SHADOWING (the reason this is scope-aware, not a blind find/replace): a top-
// level name may be SHADOWED by a function parameter, a loop variable, a block-
// local `let`, or a function declaration's own params. A reference to such a
// local must NOT be rewritten. So the walk tracks a stack of "names shadowed in
// the current scope" and skips renaming any reference whose name is currently
// shadowed. The rename map only ever contains the module's TOP-LEVEL names (and
// imported locals), so locals introduced anywhere below the top level simply mask
// the rename for their extent.
//
// Pure AST surgery, no type/codegen dependency — runtime-agnostic like the rest
// of the front end.

import type { VLExpression, VLProgramNode, VLStatement } from "./ast.ts";

/**
 * Rewrite every reference to a top-level name in `program` according to
 * `rename` (local name → mangled name), in place. Declarations of those names
 * (the top-level `function`/`let`/`const` themselves) are renamed too, so the
 * declaration and its uses stay consistent. Locals that shadow a renamed name
 * are left untouched for their lexical extent.
 */
export const rewriteNames = (
  program: VLProgramNode,
  rename: Map<string, string>,
): void => {
  if (rename.size === 0) return;
  const r = (name: string, shadowed: Set<string>): string =>
    shadowed.has(name) ? name : (rename.get(name) ?? name);

  // The set of names locally shadowing a top-level rename, for the current
  // lexical scope. A child scope clones the parent's set and adds its own.
  const topLevelShadow = new Set<string>(); // nothing shadowed at module top

  const stmt = (s: VLStatement, shadowed: Set<string>): void => {
    switch (s.type) {
      case "VariableDeclaration": {
        // The initializer is evaluated in the ENCLOSING scope; rename it before
        // the name itself is (re)bound. At the top level the declaration name is
        // a renamed binding; in a nested block it shadows the rename.
        if (s.value) expr(s.value, shadowed);
        if (rename.has(s.name) && !shadowed.has(s.name)) {
          s.name = rename.get(s.name)!;
        }
        return;
      }
      case "Return":
        if (s.value) expr(s.value, shadowed);
        return;
      case "While":
        expr(s.condition, shadowed);
        stmt(s.statement, shadowed);
        return;
      case "For": {
        expr(s.from, shadowed);
        expr(s.to, shadowed);
        if (s.step) expr(s.step, shadowed);
        // The loop variable is a fresh local shadowing any top-level same-name.
        stmt(s.statement, withShadow(shadowed, s.variable));
        return;
      }
      case "ForIn": {
        expr(s.iterable, shadowed);
        stmt(s.statement, withShadow(shadowed, s.variable));
        return;
      }
      case "Break":
      case "Continue":
      case "Import":
        return;
      default:
        expr(s, shadowed);
    }
  };

  const expr = (e: VLExpression, shadowed: Set<string>): void => {
    switch (e.type) {
      case "Name":
        e.name = r(e.name, shadowed);
        return;
      case "FunctionCall":
        // The called name resolves to a top-level function / imported binding;
        // rename it. Arguments are ordinary expressions.
        e.function = r(e.function, shadowed);
        for (const a of e.arguments) expr(a.value, shadowed);
        return;
      case "Call":
        expr(e.callee, shadowed);
        for (const a of e.arguments) expr(a.value, shadowed);
        return;
      case "FunctionDeclaration": {
        // Rename the declaration's own name (a top-level function), unless a
        // local shadows it. The body sees the parameters as locals shadowing any
        // top-level same-name binding.
        if (e.name && rename.has(e.name) && !shadowed.has(e.name)) {
          e.name = rename.get(e.name)!;
        }
        let bodyShadow = shadowed;
        for (const p of e.parameters) {
          bodyShadow = withShadow(bodyShadow, p.name);
        }
        stmt(e.body, bodyShadow);
        return;
      }
      case "Block": {
        // A block introduces its own scope: a `let`/`const` declared anywhere in
        // it shadows a same-named top-level binding for the WHOLE block (VL `let`
        // is block-scoped and visible across the block — see symbols.ts), so
        // pre-collect the block's local declaration names into the shadow set
        // before processing any statement. A nested function-declaration name is
        // also a block-local binding and shadows likewise.
        let blockShadow = shadowed;
        for (const s of e.statements) {
          if (s.type === "VariableDeclaration") {
            blockShadow = withShadow(blockShadow, s.name);
          } else if (s.type === "FunctionDeclaration" && s.name) {
            blockShadow = withShadow(blockShadow, s.name);
          }
        }
        for (const s of e.statements) stmt(s, blockShadow);
        return;
      }
      case "BinaryOperation":
        expr(e.left, shadowed);
        expr(e.right, shadowed);
        return;
      case "UnaryOperation":
        expr(e.operand, shadowed);
        return;
      case "PropertyAccess":
      case "OptionalAccess":
        // The property name is a field, never a top-level binding — leave it.
        expr(e.object, shadowed);
        return;
      case "IndexAccess":
        expr(e.array, shadowed);
        expr(e.index, shadowed);
        return;
      case "NullCoalesce":
        expr(e.left, shadowed);
        expr(e.right, shadowed);
        return;
      case "Is":
        expr(e.value, shadowed);
        return;
      case "If":
        for (const c of e.conditionals) {
          expr(c.condition, shadowed);
          stmt(c.statement, shadowed);
        }
        if (e.else) stmt(e.else, shadowed);
        return;
      case "ObjectLiteral":
        for (const p of e.properties) {
          // A computed key `[expr]:` is an expression; a `Name` key is a field
          // label (not a binding), so only rewrite a computed/general key.
          if (p.name.type !== "Name" && p.name.type !== "StringLiteral") {
            expr(p.name, shadowed);
          }
          expr(p.value, shadowed);
        }
        return;
      case "ArrayLiteral":
        for (const v of e.values) expr(v, shadowed);
        return;
      // Leaf literals carry no names.
      case "StringLiteral":
      case "IntegerLiteral":
      case "RealLiteral":
      case "BooleanLiteral":
      case "NullLiteral":
        return;
    }
  };

  for (const s of program.statements) {
    stmt(s, topLevelShadow);
    // A top-level `let`/`const`/function declaration name is RENAMED (not
    // shadowed); subsequent top-level statements still see it via the rename map,
    // so nothing to add to the shadow set here.
  }
};

/** A fresh shadow set = parent ∪ {name}. Cheap; modules are small. */
const withShadow = (parent: Set<string>, name: string): Set<string> => {
  if (parent.has(name)) return parent;
  const next = new Set(parent);
  next.add(name);
  return next;
};
