// The VL type algebra: implicit-type inference, softening, structural
// subtyping / coercion checks (`ensureType`/`validateType`), and the
// expression/statement type derivations. Operates on the AST + shared state.
import type {
  Context,
  VLArgumentNode,
  VLExpression,
  VLParameterNode,
  VLStatement,
  VLStringLiteralNode,
  VLType,
  VLTypeType,
} from "./ast.ts";
import {
  errors,
  flow,
  guards,
  narrowedPaths,
  scopes,
  withScope,
} from "./state.ts";

// The canonical narrowing key for a "place" — a bare name (`x`) or a property
// path rooted at one (`o.v`, `o.v.w`) — or null for anything else (a call,
// index, literal: not a stable place to narrow). Names can't contain `.`, so
// the path string is unambiguous.
export const placeKey = (expr: VLExpression): string | null => {
  if (expr.type === "Name") return expr.name;
  // `x?.y` keys the same place as `x.y`, so narrowing a guard written with `?.`
  // (`if x?.y is i32`) refines the regular `x.y` reads in the branch body.
  if (expr.type === "PropertyAccess" || expr.type === "OptionalAccess") {
    const base = placeKey(expr.object);
    return base === null ? null : `${base}.${expr.property}`;
  }
  return null;
};

// Binary operators that yield a boolean (comparisons + logical), used when the
// operand is still an inference hole and we infer the result without the method.
const BOOLEAN_OPS = new Set(["<", ">", "<=", ">=", "==", "!=", "&&", "||"]);

// Stable per-object ids + the set of object pairs currently mid-comparison, for
// coinductive structural subtyping of *recursive* types (A11): re-entering a
// pair already on the stack assumes it holds (the standard equirecursive rule),
// so comparing two mutually-recursive shapes terminates instead of looping. The
// id map is a WeakMap so it doesn't retain types.
let _typeIdCounter = 0;
const _typeIds = new WeakMap<object, number>();
const typeId = (t: object): number => {
  let id = _typeIds.get(t);
  if (id === undefined) _typeIds.set(t, id = ++_typeIdCounter);
  return id;
};
const comparingPairs = new Set<string>();

// Whether a value can be compared with the *default* structural `==` — every
// component must itself be value-comparable. A function-valued field makes an
// object non-equatable (closures can't be soundly value-compared); such a type
// needs an explicit `==` operator instead.
export const isEquatable = (
  type: VLType,
  seen = new Set<VLType>(),
): boolean => {
  let t = softenImplicitType(type);
  if (t.type === "Infer") t = t.subType;
  switch (t.type) {
    case "IntegerLiteral":
    case "RealLiteral":
    case "BooleanLiteral":
    case "StringLiteral":
      return true;
    // Functions compare by reference (same function + same captured env), not by
    // value — so a function-valued field doesn't make its object non-equatable.
    case "Function":
      return true;
    case "Object":
      if (
        t.name === "i32" || t.name === "i64" || t.name === "f32" ||
        t.name === "f64" || t.name === "boolean" || t.name === "string"
      ) return true;
      // An array (i32-index-sig object) is equatable iff its element type is —
      // `==` compares length + elements (`arrayEqFn`).
      if (arrayElementType(t)) return isEquatable(arrayElementType(t)!, seen);
      if (seen.has(t)) return true; // cycle guard
      seen.add(t);
      return t.properties.every((p) => isEquatable(p.type, seen));
    default:
      return false;
  }
};

// Whether an `if`'s conditionals exhaust their discriminated place — i.e. they
// all narrow the *same* place and, subtracting each condition's case in turn,
// leave `Never`. Then an `else`-less `if` has no reachable fall-through (no
// `null`). Only the simple single-place case (`if x == a … else if x == b …` /
// `is`); a compound condition (`&&`/`||`, or a different place) is conservatively
// non-exhaustive. Uses the same else-narrowings the runtime branches do.
const conditionsExhaust = (
  conditionals: { condition: VLExpression }[],
  ctx: Context,
): boolean => {
  let key: string | null = null;
  let residual: VLType | null = null;
  for (const c of conditionals) {
    const facts = elseNarrowings(c.condition);
    if (facts.length !== 1) return false;
    const fk = placeKey(facts[0].place);
    if (fk === null) return false;
    if (key === null) {
      key = fk;
      // Read the place from scope (not the memoized node type, which the
      // `==`-operand soften path may have collapsed to the base scalar).
      const cur = placeCurrentType(facts[0].place, ctx);
      if (cur === undefined) return false;
      residual = cur;
    } else if (fk !== key) {
      return false;
    }
    residual = facts[0].apply(residual!);
  }
  return residual !== null && residual.type === "Never";
};

export const _typeFromExpression = (
  expr: VLExpression,
  ctx: Context,
): VLType => {
  switch (expr.type) {
    case "BinaryOperation": {
      const op = expr.operator;
      let leftType = typeFromExpression(expr.left, ctx);
      // Short-circuit narrowing (A5): `B` in `A && B` is only evaluated when `A`
      // holds, so derive its type with `A`'s then-narrowings applied (`A || B`
      // with `A`'s else-narrowings). This is what lets `x != null && x.y` resolve
      // `x.y` — the right operand sees `x` already narrowed.
      const rightType = op === "&&" || op === "||"
        ? withNarrowings(
          op === "&&" ? thenNarrowings(expr.left) : elseNarrowings(expr.left),
          ctx,
          () => typeFromExpression(expr.right, ctx),
        )
        : typeFromExpression(expr.right, ctx);
      // Operators live on the numeric object types (i32/f64/...), not on the
      // literal types, so a bare literal operand (e.g. `2` in `2 + 3`) has no
      // operator methods. Default an unconstrained numeric literal to its soft
      // type (IntegerLiteral -> i32, RealLiteral -> f64) and re-memoize the
      // operand so both type-checking and codegen see the concrete type.
      // TODO: when there's a concrete flow.desiredType, prefer it over the default
      // (so `f64 x = 2 + 3` makes the literals f64) with range checking.
      if (
        leftType.type === "IntegerLiteral" || leftType.type === "RealLiteral" ||
        leftType.type === "StringLiteral"
      ) {
        leftType = softenImplicitType(leftType);
        setNodeType(expr.left, leftType);
      }
      // `x == null` / `x != null`: a nullness test, allowed when either operand
      // is `null` or a nullable type. Yields boolean (handled in codegen as
      // `ref.is_null`).
      if (op === "==" || op === "!=") {
        const isNullish = (t: VLType) =>
          t.type === "Nullable" || (t.type === "Alias" && t.name === "null");
        if (isNullish(leftType) || isNullish(rightType)) {
          return { type: "Alias", name: "boolean" };
        }
      }
      const missingOpFunc = (variant: string): VLType => {
        errors.push({
          type: "Type",
          left: {
            type: "Object",
            properties: [{
              name: { type: "StringLiteral", value: op },
              type: {
                type: "Function",
                paramaters: [{
                  type: "Parameter",
                  name: "right",
                  paramaterType: rightType,
                }],
                return: flow.desiredType ?? { type: "Unknown" },
              },
            }],
          },
          right: leftType,
          ctx,
          code: `binary-op-${variant}`,
        });
        return { type: "Never" };
      };
      // Operator on an inference hole (e.g. `self.x + b.x` in a fully-inferred
      // structural function): don't error — the operand is concretized per call
      // site (monomorphization), and codegen reads the concrete type from the
      // instance scope. Comparisons/logical ops yield boolean; arithmetic yields
      // the operand's (to-be-resolved) type.
      if (leftType.type === "Infer" || leftType.type === "Unknown") {
        return BOOLEAN_OPS.has(op)
          ? { type: "Alias", name: "boolean" }
          : leftType;
      }
      // Function values compare by reference: `f == g` / `f != g` -> boolean.
      if (leftType.type === "Function") {
        if (op === "==" || op === "!=") {
          ensureType(leftType, rightType, ctx);
          return { type: "Alias", name: "boolean" };
        }
        return missingOpFunc("left-not-object");
      }
      // `==` / `!=` on a union or nullable (incl. a literal union like
      // `"expense" | "reimbursement"` or `0 | 1 | 2`): value equality yielding
      // boolean, allowed when the operands are comparable (one assignable to the
      // other — e.g. discriminating `s == "expense"`). Codegen lowers it through
      // the softened base type's equality (numeric / string / struct), and the
      // literal narrowing (`atomFact`) refines the place in the branch.
      if (
        (op === "==" || op === "!=") &&
        (leftType.type === "Union" || leftType.type === "Nullable") &&
        (validateType(leftType, rightType) || validateType(rightType, leftType))
      ) {
        return { type: "Alias", name: "boolean" };
      }
      // A numeric-literal union (`0 | 1 | 2`) softens to its base scalar, so it
      // behaves like the underlying numeric for arithmetic and ordered
      // comparison (`n + 1`, `n < 2`). (`==`/`!=` above keep the union for
      // narrowing; this covers the other operators.)
      if (leftType.type === "Union" || leftType.type === "Nullable") {
        const soft = softenImplicitType(leftType);
        if (soft.type === "Object" && SCALARS.includes(soft.name ?? "")) {
          leftType = soft;
        }
      }
      if (leftType.type !== "Object") return missingOpFunc("left-not-object");
      // List concat `a + b`: a *new* `T[]` (collections-design §VL.4). A `T[]` is
      // anonymous and carries no `+` operator field, so it is typed here — the
      // right operand must be a list assignable to the left, the result is the
      // left list type. (`==`/`!=` on lists are handled by the structural branch
      // above via `isEquatable`.) `string +` still flows through `opFunc` below.
      if (op === "+" && isListType(leftType)) {
        if (!ensureType(leftType, rightType, ctx)) return { type: "Never" };
        return leftType;
      }
      const opFunc = leftType.properties.find((p) =>
        validateType(p.name, { type: "StringLiteral", value: op })
      )?.type;
      if (!opFunc || opFunc.type !== "Function") {
        // `==` / `!=` default to *structural* equality on a plain data object
        // (no custom operator). Sound only when every field is itself equatable
        // — an object with a function-valued field needs an explicit `==`, since
        // closures can't be value-compared.
        if ((op === "==" || op === "!=") && leftType.name === undefined) {
          if (isEquatable(leftType)) {
            ensureType(leftType, rightType, ctx);
            return { type: "Alias", name: "boolean" };
          }
          errors.push({
            type: "Syntax",
            message:
              `This type isn't equatable (a field is a function or otherwise not value-comparable) — define a \`==\` operator for it`,
            ctx,
            code: 0,
          });
          return { type: "Never" };
        }
        return missingOpFunc("no-operator-function");
      }
      const param = opFunc.paramaters[0]?.paramaterType;
      if (!param) return missingOpFunc("bad-operator-function");
      if (!ensureType(param, rightType, ctx)) return { type: "Never" };
      return opFunc.return;
    }
    case "UnaryOperation": {
      const operandType = typeFromExpression(expr.operand, ctx);
      // Logical not (`!`): boolean → boolean.
      if (expr.operator === "!") {
        ensureType(
          { type: "Nullable", subType: { type: "Alias", name: "boolean" } },
          operandType,
          ctx,
        );
        return { type: "Alias", name: "boolean" };
      }
      // `++` / `--`: in/decrement a numeric, yielding the same (softened) type.
      ensureType({ type: "Alias", name: "i32" }, operandType, ctx);
      return softenImplicitType(operandType);
    }
    case "Block":
      // Prefer the value type cached during the walk (the last statement's type,
      // resolved while the block scope was live); fall back to re-deriving.
      if (expr.valueType) return expr.valueType;
      if (!expr.statements.length) return { type: "Alias", name: "null" };
      return typeFromStatement(
        expr.statements[expr.statements.length - 1],
        ctx,
      );
    case "FunctionDeclaration":
      return {
        type: "Function",
        paramaters: expr.parameters,
        return: expr.returnType,
      };
    case "IndexAccess": {
      let objType = typeFromExpression(expr.array, ctx);
      // A directly-used string literal (`"ab"[0]`) keeps its `StringLiteral`
      // type; soften it to the nominal `string` array Object so indexing yields
      // an i32 char code like a bound `string`.
      if (objType.type === "StringLiteral") objType = softenImplicitType(objType);
      if (objType.type !== "Object") return { type: "Never" };
      // `Map[k]` is the deliberate exception to sequence indexing: a missing key
      // is NORMAL ABSENCE, so it yields `V | null` (not a trap). `List[i]`/string
      // indexing keep their trap-on-OOB `T` result below.
      const kv = mapKeyValueType(objType);
      if (kv) return { type: "Nullable", subType: kv.value };
      const propType = typeFromExpression(expr.index, ctx);
      const property = objType.properties.find((p) =>
        validateType(p.name, propType)
      );
      if (!property) return { type: "Never" };
      return property.type;
    }
    case "Name":
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (Object.hasOwn(scopes[i], expr.name)) return scopes[i][expr.name];
      }
      return { type: "Never" };
    case "IntegerLiteral":
      return { type: "IntegerLiteral", value: expr.value, text: expr.text };
    case "RealLiteral":
      return { type: "RealLiteral", value: expr.value };
    case "StringLiteral":
      return { type: "StringLiteral", value: expr.value };
    case "ObjectLiteral":
      return {
        type: "Object",
        properties: expr.properties
          .map((p) => ({
            name: p.name.type === "Name"
              ? { type: "StringLiteral", value: p.name.name }
              : typeFromExpression(p.name, ctx),
            type: typeFromExpression(p.value, ctx),
            readonly: false,
          })),
      };
    case "ArrayLiteral":
      // An array is an `i32`-indexed collection (→ a WasmGC array). `length` is
      // NOT a structural member here (that would break `{[i32]: T}` subtyping —
      // a literal would no longer match an index-sig param); it's an *intrinsic*
      // of any array type, resolved specially at property access (→ array.len).
      return {
        type: "Object",
        properties: [{
          name: { type: "Alias", name: "i32" },
          type: {
            type: "Union",
            subTypes: expr.values.map((v) => typeFromExpression(v, ctx)),
          },
        }],
      };
    case "PropertyAccess": {
      // A flow-narrowed property path (`if o.v is i32 { … }`) overrides the
      // stored field type within the branch.
      const key = placeKey(expr);
      if (key !== null && key in narrowedPaths) return narrowedPaths[key];
      let objType = typeFromExpression(expr.object, ctx);
      if (objType.type === "Infer") objType = objType.subType;
      // A directly-used string literal (`"a".length`) keeps its `StringLiteral`
      // type; soften it to the nominal `string` array Object so its intrinsic
      // members resolve like a bound `string` (see `getChildType`).
      if (objType.type === "StringLiteral") objType = softenImplicitType(objType);
      if (objType.type !== "Object") return { type: "Never" };
      // `array.length` is an intrinsic i32 (not a structural member).
      if (expr.property === "length" && arrayElementType(objType)) {
        return { type: "Alias", name: "i32" };
      }
      // Intrinsic list members (`.capacity`, `.get`, …).
      if (isListType(objType)) {
        const member = listMemberType(arrayElementType(objType)!)[expr.property];
        if (member) return member;
      }
      // Intrinsic map/set members. A `Set<T>` (boolean-valued `{[T]:boolean}`)
      // routes to its OWN surface (`setMemberType`), a `Map<K,V>` to `mapMemberType`.
      {
        const kv = mapKeyValueType(objType);
        if (kv) {
          const setEl = setElementType(objType);
          const member = setEl !== null
            ? setMemberType(setEl)[expr.property]
            : mapMemberType(kv.key, kv.value)[expr.property];
          if (member) return member;
        }
      }
      const propType: VLStringLiteralNode = {
        type: "StringLiteral",
        value: expr.property,
      };
      const property = objType.properties.find((p) =>
        validateType(p.name, propType)
      );
      if (!property) return { type: "Never" };
      return property.type;
    }
    case "OptionalAccess": {
      // `x?.y`: look up `y` on the *non-null* part of `x`; the result is
      // `(member) | null` — null when `x` is null, else the member's type.
      const objType = nonNullable(typeFromExpression(expr.object, ctx));
      if (objType.type !== "Object") return { type: "Never" };
      const property = objType.properties.find((p) =>
        validateType(p.name, { type: "StringLiteral", value: expr.property })
      );
      const member: VLType = property ? property.type : { type: "Never" };
      return flattenType({
        type: "Union",
        subTypes: [member, { type: "Alias", name: "null" }],
      });
    }
    case "NullCoalesce": {
      // `x ?? y`: `x`'s non-null part unioned with `y`'s type.
      const leftType = nonNullable(typeFromExpression(expr.left, ctx));
      const rightType = typeFromExpression(expr.right, ctx);
      return flattenType({ type: "Union", subTypes: [leftType, rightType] });
    }
    case "BooleanLiteral":
      return { type: "BooleanLiteral", value: expr.value };
    case "NullLiteral":
      // We can assume this is meant as a nullable value, though that's slightly different than a complex inference
      return { type: "Alias", name: "null" };
    case "Is": {
      // `x is T` — a type guard yielding boolean (and narrowing in an `if`).
      const valueType = typeFromExpression(expr.value, ctx);
      const checksNull = expr.checkType.type === "Alias" &&
        expr.checkType.name === "null";
      // A check type must be `null` or a variant of the value's union/nullable
      // type. Reject one that can never hold (e.g. `(boolean | i32) is f64`),
      // which would otherwise read as a meaningless tag compare and mislead.
      const testable = valueType.type === "Nullable" ||
        valueType.type === "Union";
      if (
        !checksNull && testable &&
        !validateType(nonNullable(valueType), expr.checkType)
      ) {
        errors.push({
          type: "Syntax",
          message:
            `\`is\` check type is not a variant of the value's type (testable variants are \`null\` and the union's members)`,
          ctx,
          code: 0,
        });
      }
      return { type: "Alias", name: "boolean" };
    }
    case "FunctionCall":
      // `Map()` / `Set()` builtin constructors (B6a): construction takes its type
      // from context (the binding annotation), exactly like an empty `[]`. Return
      // a FRESH inference hole so the surrounding `ensureType(annotation, …)` pins
      // it to the concrete `{[K]:V}` map type (the swap at ensureType's head makes
      // an `Infer` actual the inference target). Codegen reads the resolved type
      // back off the call's `functionType.return` (or the desired type).
      if (expr.function === "Map" || expr.function === "Set") {
        const hole: VLType = {
          type: "Infer",
          subType: { type: "Unknown" },
          mapCtor: expr.function,
        };
        if (expr.functionType) expr.functionType.return = hole;
        return hole;
      }
      // Prefer the per-call instantiated signature (its return is resolved to a
      // concrete type for this call's arguments); the shared scope entry's
      // return may still hold an inference hole pinned by another call site.
      if (expr.functionType) return expr.functionType.return;
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (Object.hasOwn(scopes[i], expr.function)) {
          const funcType = scopes[i][expr.function];
          if (funcType.type === "Function") return funcType.return;
          return { type: "Never" };
        }
      }
      return { type: "Never" };
    case "Call": {
      if (expr.functionType) return expr.functionType.return;
      // An intrinsic map/set method call (`m.has(k)`, `m.get(k)`, …) parses as a
      // `Call` with no `functionType` (a `Map` is anonymous, so it isn't a scope
      // method). Resolve its return from the map member here so `let b = m.has(k)`
      // infers a concrete type rather than `Never`. Codegen lowers it by name.
      if (expr.callee.type === "PropertyAccess") {
        let obj = typeFromExpression(expr.callee.object, ctx);
        if (obj.type === "Infer") obj = obj.subType;
        const kv = mapKeyValueType(obj);
        if (kv) {
          const setEl = setElementType(obj);
          const member = setEl !== null
            ? setMemberType(setEl)[expr.callee.property]
            : mapMemberType(kv.key, kv.value)[expr.callee.property];
          if (member?.type === "Function") return member.return;
        }
      }
      return { type: "Never" };
    }
    case "If": {
      // Flatten the else-if chain — `else if` parses as a nested `if` in the
      // `else`, so follow those too — into the full condition + branch lists and
      // the final (real) `else`, if any.
      const conditions: VLExpression[] = [];
      const branchStmts: VLStatement[] = [];
      let node: typeof expr | undefined = expr;
      let finalElse: VLStatement | undefined;
      while (node) {
        for (const c of node.conditionals) {
          conditions.push(c.condition);
          branchStmts.push(c.statement);
        }
        if (node.else && node.else.type === "If") {
          node = node.else;
        } else {
          finalElse = node.else;
          node = undefined;
        }
      }
      if (finalElse) branchStmts.push(finalElse);
      const branches: VLType = {
        type: "Union",
        subTypes: branchStmts.map((s) => typeFromStatement(s, ctx)),
      };
      // With a real `else`, every path is covered. Without one, the chain falls
      // through to `null` — *unless* the conditions are exhaustive (they subtract
      // the discriminated place to `Never`), so the fall-through is unreachable.
      // Lets a fully-covered literal-union discrimination (`if s == "a" … else if
      // s == "b" …` over `"a" | "b"`) type without a spurious `| null`.
      if (finalElse) return branches;
      if (conditionsExhaust(conditions.map((c) => ({ condition: c })), ctx)) {
        return branches;
      }
      return { type: "Nullable", subType: branches };
    }
    default: {
      const exhaustive: never = expr;
      throw new Error(
        `Unhandled AST error for directly inference: ${exhaustive}`,
      );
    }
  }
};

export const typeFromExpressionMemory = new WeakMap<VLExpression, VLType>();
export const typeFromExpression = (
  expr: VLExpression,
  ctx: Context,
): VLType => {
  const memoized = typeFromExpressionMemory.get(expr);
  if (memoized) return memoized;
  let type = _typeFromExpression(expr, ctx);
  // This is wrong... the scope chain should be derived from the type itself
  // Resolve a named alias to its definition, unwrapping a `Type` alias to its
  // underlying type (a recursive `type X` resolves to `T<…X…>`; the value is the
  // `…X…`, not the wrapper). The seen-set guards a self-referential alias from
  // looping forever (A11/A14).
  const seen = new Set<string>();
  while (type.type === "Alias" || type.type === "Type") {
    if (type.type === "Type") {
      type = type.subType;
      continue;
    }
    const name = type.name;
    if (seen.has(name)) break;
    seen.add(name);
    let resolved: VLType | undefined;
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (Object.hasOwn(scopes[i], name)) {
        resolved = scopes[i][name];
        break;
      }
    }
    if (!resolved) break;
    type = resolved;
  }
  typeFromExpressionMemory.set(expr, type);
  return type;
};
export const vlType = (expr: VLExpression) => {
  const memoized = typeFromExpressionMemory.get(expr);
  if (memoized) return memoized;
  console.log(expr);
  throw new Error("Expected expression's type to have been memoized");
};
export const setNodeType = (node: VLExpression, type: VLType) => {
  typeFromExpressionMemory.set(node, type);
  return node;
};

// Integer type ranges: i32 is [-2^31, 2^31-1]; i64 is [-2^63, 2^63-1].
const I32_MIN = -2147483648n;
const I32_MAX = 2147483647n;
const I64_MIN = -9223372036854775808n;
const I64_MAX = 9223372036854775807n;

// The default numeric type of an un-annotated integer literal: the narrowest
// integer type that represents it *exactly* — i32 if it fits, otherwise i64.
// Returns undefined when the literal exceeds the i64 range (no integer type can
// hold it; the caller reports a diagnostic). Defaulting an out-of-i32-range
// literal to i32 would silently wrap, so we widen instead.
export const defaultIntegerType = (
  text: string,
  value: number,
): "i32" | "i64" | undefined => {
  let v: bigint;
  try {
    v = BigInt(text);
  } catch {
    // Non-decimal source text (e.g. exponent form): fall back to the parsed
    // value, which is exact for any literal small enough to matter here.
    v = BigInt(Math.trunc(value));
  }
  if (v >= I32_MIN && v <= I32_MAX) return "i32";
  if (v >= I64_MIN && v <= I64_MAX) return "i64";
  return undefined;
};

export const _softenImplicitType = (type: VLType): VLType => {
  if (type.type === "IntegerLiteral") {
    return {
      type: "Alias",
      name: defaultIntegerType(type.text, type.value) ?? "i64",
    };
  }
  if (type.type === "RealLiteral") return { type: "Alias", name: "f64" };
  if (type.type === "StringLiteral") return { type: "Alias", name: "string" };
  if (type.type === "BooleanLiteral") return { type: "Alias", name: "boolean" };
  if (type.type === "Nullable") {
    // Soften the payload WITHOUT expanding a nested alias (`_softenImplicitType`,
    // not the `getConcreteType`-wrapped `softenImplicitType`): a recursive type's
    // self-reference (`Tree | null` → `Nullable<Alias "Tree">`) must keep its
    // `Alias` leaf so the structure stays finite (A11). A top-level alias is still
    // expanded by the outer `softenImplicitType` wrapper when one is wanted.
    const subType = _softenImplicitType(type.subType);
    if (subType === type.subType) return type;
    return { type: "Nullable", subType };
  }
  if (
    type.type === "Alias" || type.type === "Function" ||
    type.type === "Never" || type.type === "Type" || type.type === "Unknown" ||
    type.type === "Custom"
  ) return type;
  if (type.type === "Object") {
    let softenedProperty = false;
    const properties = type.properties.map((p) => {
      // `_softenImplicitType`, not the alias-expanding `softenImplicitType`, so a
      // recursive field's self-reference keeps its `Alias` leaf (A11). Literals
      // nested in the field still soften (it recurses); only a top-level alias is
      // left lazy, which is exactly the recursion barrier we want.
      const next = _softenImplicitType(p.type);
      if (p.type !== next) softenedProperty = true;
      return next;
    });
    if (softenedProperty) {
      return {
        type: "Object",
        // Preserve the nominal `name` (e.g. `string`) — softening a property
        // (here the `[i32]` index sig) must not turn a named builtin into an
        // anonymous structural object.
        name: type.name,
        properties: type.properties.map((p, i) => ({
          ...p,
          type: properties[i],
        })),
      };
    }
    return type;
  }
  if (type.type === "Union") {
    const hasSubUnions = type.subTypes.some((s) => s.type === "Union");
    if (hasSubUnions) {
      return softenImplicitType({
        type: "Union",
        subTypes: type.subTypes.flatMap((s) =>
          s.type === "Union" ? s.subTypes : s
        ),
      });
    }
    if (type.subTypes.length === 1) return softenImplicitType(type.subTypes[0]);
    let softenedSubType = false;
    const softenedSubTypes = type.subTypes.map((t) => {
      const next = softenImplicitType(t);
      if (next !== t) softenedSubType = true;
      return next;
    });
    const subTypes: VLType[] = [softenedSubTypes[0]];
    outer: for (let i = 1; i < softenedSubTypes.length; i++) {
      for (let n = 0; n < subTypes.length; n++) {
        // Distinct scalars (`i32` vs `f64`) are separate union variants — the
        // one-directional numeric coercion must not collapse them.
        if (distinctScalars(subTypes[n], softenedSubTypes[i])) continue;
        if (validateType(subTypes[n], softenedSubTypes[i])) continue outer;
        if (validateType(softenedSubTypes[i], subTypes[n])) {
          subTypes.splice(n, 1, softenedSubTypes[i]);
          continue outer;
        }
      }
      subTypes.push(softenedSubTypes[i]);
    }
    if (subTypes.length !== type.subTypes.length || softenedSubType) {
      // if (subTypes.length === 0) Unknown? Never? Never breaks array...
      if (subTypes.length === 1) return subTypes[0];
      return { type: "Union", subTypes: subTypes };
    }
    return type;
  }
  if (type.type === "Infer") {
    const subType = softenImplicitType(type.subType);
    if (subType === type.subType) return type;
    return { type: "Infer", subType };
  }
  // Refinement types (A3/A4) are produced already-simplified by
  // `intersectType` / `subtractType`; nothing further to soften.
  if (type.type === "Intersection" || type.type === "Negation") return type;
  const exhaustive: never = type;
  throw new Error(`Unhandled soften type: ${exhaustive}`);
};

export const softenImplicitType = (type: VLType): VLType =>
  getConcreteType(_softenImplicitType(type), undefined);

// If `type` is an array — a structural object carrying an `i32`-keyed index
// signature (`{[i32]: T}`) — return its element type `T`, else null. This is
// what marks a value as an array (→ WasmGC array) rather than a struct, shared
// by the type checker (here) and codegen (`toWasm.ts`).
export const arrayElementType = (type: VLType): VLType | null => {
  if (type.type !== "Object") return null;
  const prop = type.properties.find((p) => {
    const name = softenImplicitType(p.name);
    return name.type === "Object" && name.name === "i32";
  });
  return prop ? prop.type : null;
};

// Is `type` a *list* (the growable `T[]` rep), not a raw i32-array `string`?
// Both match `arrayElementType` (a `string` is an Object named "string" carrying
// `[i32]:i32`); the discriminator is the absence of a nominal `name`. Mirrors the
// codegen-side `isListType` in `toWasm.ts`.
export const isListType = (type: VLType): boolean =>
  type.type === "Object" && type.name === undefined &&
  arrayElementType(type) !== null;

// A `Map<K,V>` is a separate hash type (DECISIONS B6a), spelled with a *non-i32*
// index signature `{[K]: V}` — an i32-key `{[i32]:T}` stays the native list/array
// path, so a map's key is `string` (the supported hash-key type) for now. Returns
// `{ key, value }` or null. The discriminator is an anonymous (no `name`) object
// whose sole index-signature key is a non-i32 type.
export const mapKeyValueType = (
  type: VLType,
): { key: VLType; value: VLType } | null => {
  if (type.type !== "Object" || type.name !== undefined) return null;
  const prop = type.properties.find((p) => {
    // An index-signature key is a *type* node (`{type:"Alias",name:"string"}` /
    // the `string` Object), NOT a `StringLiteral` (which is a named struct
    // field). Only soften an already-type-shaped name, so a field literally named
    // `"string"` never reads as a string-keyed index signature.
    if (p.name.type === "StringLiteral") return false;
    const name = softenImplicitType(p.name);
    return name.type === "Object" && name.name === "string";
  });
  if (!prop) return null;
  return { key: softenImplicitType(prop.name), value: prop.type };
};

export const isMapType = (type: VLType): boolean =>
  mapKeyValueType(type) !== null;

// A `Set<T>` is internally a boolean-valued hash map `{[T]: boolean}` (the
// representation is unchanged — the boolean carries membership), but per the C2
// design it is its OWN type with its OWN surface: `Set` does NOT share the `Map`
// member surface. The discriminator is still the boolean value type, but a set
// routes to `setMemberType` (NOT `mapMemberType`) so it never leaks `.set`/`.get`/
// `.keys()`/`.values(): boolean[]`. The set's element type is the *key* type of
// the underlying `{[T]: boolean}`.
export const isSetType = (type: VLType): boolean => {
  const kv = mapKeyValueType(type);
  if (!kv) return false;
  const v = softenImplicitType(kv.value);
  return v.type === "Object" && v.name === "boolean";
};

// The element type of a `Set<T>` — the *key* of the underlying `{[T]: boolean}`.
export const setElementType = (type: VLType): VLType | null => {
  const kv = mapKeyValueType(type);
  if (!kv) return null;
  const v = softenImplicitType(kv.value);
  return v.type === "Object" && v.name === "boolean" ? kv.key : null;
};

// The intrinsic `Map<K,V>` members (`.length` / `.get` / `.has` / `.set` /
// `.delete` / `.keys()` / `.values()`). A `Map` is an anonymous structural
// `{[K]:V}` object, so — like list members — these are special-cased here rather
// than declared on a scope object. `m[k]` (index access) yields `V | null`
// (normal absence) and `m[k] = v` sets; those are handled at the index-access
// sites.
//
// C2 judgment-call note: under the C2 model `.get`/`.has`/`.length`/`.keys`/
// `.values` plus index read/write are the INTERFACE-level surface (they live on
// the bare `{[K]:V}` "Mapping" capability), while `.set`/`.delete` are
// representation-MUTATING ops that belong on the concrete `Map<K,V>` subtype. A
// fully sound split would require carrying a distinct concrete-vs-interface marker
// on the value's type so the result of `Map()` is a different type than a bare
// `{[K]:V}` annotation — an invasive change to the type representation and the
// bootstrap-critical inference path. We keep `.set`/`.delete` on this shared
// surface for now (the SAFE SUBSET); see the rework notes. The interface ops
// below — including index write `m[k]=v` — remain available regardless.
export const mapMemberType = (
  key: VLType,
  value: VLType,
): Record<string, VLType> => {
  return {
  // O(1) live entry count (property syntax, read-only). Unified on `.length`
  // across List/Map/Set (C2.3, DECISIONS B6 uniform-access member).
  length: { type: "Alias", name: "i32" },
  // Lookup: `V | null` (null on a missing key — normal absence, not a trap).
  get: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "key", paramaterType: key }],
    return: { type: "Nullable", subType: value },
  },
  // Membership test.
  has: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "key", paramaterType: key }],
    return: { type: "Alias", name: "boolean" },
  },
  // Insert or overwrite; returns null.
  set: {
    type: "Function",
    paramaters: [
      { type: "Parameter", name: "key", paramaterType: key },
      { type: "Parameter", name: "value", paramaterType: value },
    ],
    return: { type: "Alias", name: "null" },
  },
  // Remove a key; returns whether it was present.
  delete: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "key", paramaterType: key }],
    return: { type: "Alias", name: "boolean" },
  },
  // Insertion-ordered snapshot lists — the iteration surface (`for k in
  // m.keys()`), since the parser's `for…in` only admits i32-keyed arrays/lists.
  keys: {
    type: "Function",
    paramaters: [],
    return: listOf(key),
  },
  values: {
    type: "Function",
    paramaters: [],
    return: listOf(value),
  },
  };
};

// The intrinsic *list* members (`T[]`'s `.capacity` / `.get` / `.push` / `.pop`
// / `.clear`), special-cased here because a `T[]` is an anonymous structural
// type — it has no nominal `name` to hang these on in `defaultScope` the way
// `string` does. Codegen lowers each by name. `.length` stays handled at its
// existing sites (shared with strings).
// Build a list (`T[]`) type from an element type — an anonymous structural
// object carrying the `i32`-keyed index signature `{[i32]: T}` that
// `arrayElementType` / `isListType` recognise (no nominal `name`, so it reads as
// a list, not a `string`). The shape mirrors what `ArrayLiteral` produces.
const listOf = (element: VLType): VLType => ({
  type: "Object",
  properties: [{
    name: { type: "Alias", name: "i32" },
    type: element,
  }],
});

// The intrinsic `Set<T>` members — its OWN surface, distinct from `Map` (C2.2).
// A set exposes ONLY: `.add(x)`, `.has(x): boolean`, `.delete(x): boolean`,
// `.length` (O(1) read-only property), and `.values(): T[]` (the ELEMENTS, as
// `T[]` — NOT the membership booleans, and NOT `boolean[]`). It deliberately does
// NOT expose `.set`, `.get`, or `.keys()`. `element` is the set's element type
// (the key type of the underlying `{[T]: boolean}` representation).
export const setMemberType = (
  element: VLType,
): Record<string, VLType> => ({
  // Insert membership; returns null. (Concrete-subtype op, C2.1 — sets are always
  // constructed concretely via `Set()`.)
  add: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "value", paramaterType: element }],
    return: { type: "Alias", name: "null" },
  },
  // Membership test.
  has: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "value", paramaterType: element }],
    return: { type: "Alias", name: "boolean" },
  },
  // Remove membership; returns whether it was present.
  delete: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "value", paramaterType: element }],
    return: { type: "Alias", name: "boolean" },
  },
  // O(1) element count (property syntax, read-only). Unified on `.length` (C2.3).
  length: { type: "Alias", name: "i32" },
  // The elements as `T[]`, insertion-ordered — the iteration surface (`for x in
  // s.values()`). NOT `boolean[]`: a set's "values" are its elements.
  values: {
    type: "Function",
    paramaters: [],
    return: listOf(element),
  },
});

export const listMemberType = (
  element: VLType,
): Record<string, VLType> => {
  // `map`'s result element type `U` is the callback's return type. We pin it
  // with a single shared inference hole referenced in BOTH the callback's
  // `return` and the method's result `U[]`: `instantiateFunctionType` clones the
  // signature (`cloneTypeFresh` preserves the sharing, so the two stay one cell),
  // unifies the cloned callback param against the actual `f` argument — which
  // flows `f`'s concrete return into the hole (`ensureType`'s Function case
  // unifies returns) — then `makeExact` collapses the now-resolved `U[]`. The
  // callback param is named `"_"` so `ensureType`'s param-name check is waived
  // (a synthetic callback accepts a lambda/function whose param has any name).
  const mapResultElement: VLType = { type: "Infer", subType: { type: "Unknown" } };
  return {
  // O(1) sibling of `.length` (property syntax, read-only): allocated slots.
  capacity: { type: "Alias", name: "i32" },
  // Safe, checked accessor: `T | null` (null when `i` is out of range).
  get: {
    type: "Function",
    paramaters: [{
      type: "Parameter",
      name: "i",
      paramaterType: { type: "Alias", name: "i32" },
    }],
    return: { type: "Nullable", subType: element },
  },
  // Append (amortized O(1)); grows the backing 2× on full.
  push: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "x", paramaterType: element }],
    return: { type: "Alias", name: "null" },
  },
  // Remove+return the last element, or `null` on empty (normal absence).
  pop: {
    type: "Function",
    paramaters: [],
    return: { type: "Nullable", subType: element },
  },
  // Reset to empty, retaining capacity (`len = 0`, no realloc).
  clear: {
    type: "Function",
    paramaters: [],
    return: { type: "Alias", name: "null" },
  },
  // `map(f)` — build a NEW `U[]` of the same length, `out[i] = f(xs[i])`. `U` is
  // the callback's return type, inferred via the shared `mapResultElement` hole
  // (see above). The callback param is `(_: T)`; its return is the `U` hole.
  map: {
    type: "Function",
    paramaters: [{
      type: "Parameter",
      name: "f",
      paramaterType: {
        type: "Function",
        paramaters: [{ type: "Parameter", name: "_", paramaterType: element }],
        return: mapResultElement,
      },
    }],
    return: listOf(mapResultElement),
  },
  // `filter(f)` — build a NEW `T[]` of the elements where `f(xs[i])` is true.
  // The callback is `(_: T) -> boolean`; the result element type is just `T`.
  filter: {
    type: "Function",
    paramaters: [{
      type: "Parameter",
      name: "f",
      paramaterType: {
        type: "Function",
        paramaters: [{ type: "Parameter", name: "_", paramaterType: element }],
        return: { type: "Alias", name: "boolean" },
      },
    }],
    return: listOf(element),
  },
  };
};

// A literal `true` loop condition (`while true`) — the loop never exits by
// failing its test, so it only leaves via `break` or `return`.
const isConstTrue = (cond: VLExpression): boolean =>
  cond.type === "BooleanLiteral" && cond.value === true;

// Does a `break` escape the loop with the given label? An unlabelled `break` at
// this loop's level escapes it; a `break <label>` escapes it from anywhere
// (even inside a nested loop). An unlabelled break inside a *nested* loop
// targets that loop, not this one.
const hasEscapingBreak = (
  stmt: VLStatement,
  label: string | undefined,
  nested = false,
): boolean => {
  switch (stmt.type) {
    case "Break":
      return stmt.label !== undefined ? stmt.label === label : !nested;
    case "While":
    case "For":
    case "ForIn":
      return hasEscapingBreak(stmt.statement, label, true);
    case "Block":
      return stmt.statements.some((s) => hasEscapingBreak(s, label, nested));
    case "If":
      return stmt.conditionals.some((c) =>
        hasEscapingBreak(c.statement, label, nested)
      ) || (stmt.else ? hasEscapingBreak(stmt.else, label, nested) : false);
    default:
      return false;
  }
};

export const typeFromStatement = (
  stmt: VLStatement,
  ctx: Context,
): VLType => {
  switch (stmt.type) {
    case "Return":
      return stmt.value
        ? typeFromExpression(stmt.value, ctx)
        : { type: "Alias", name: "null" };
    case "VariableDeclaration": {
      // A `Map()` / `Set()` with no annotation to pin its type: the constructor
      // hole was never run through `ensureType`, so it stays an unresolved
      // `Infer<Unknown>` carrying its `mapCtor` tag. Report a clear error (it
      // would otherwise die in codegen as a bare `Unknown` type). Clearing the
      // tag makes this fire exactly once even if the statement is re-typed.
      const vt = stmt.variableType;
      if (
        vt.type === "Infer" && vt.mapCtor && vt.subType.type === "Unknown"
      ) {
        errors.push({
          type: "Syntax",
          message:
            `${vt.mapCtor}() needs a map type annotation ` +
            "(e.g. `let m: {[string]: i32} = Map()`)",
          ctx,
          code: 0,
        });
        vt.mapCtor = undefined;
      }
      return stmt.variableType;
    }
    case "While":
      // A `while true` with no `break` escaping it diverges: it never fails its
      // test, and `return` leaves the whole function — so it never falls through
      // to a value. Typing it `Never` (not `Nullable<body>`) lets a function
      // whose tail is such a loop return purely via its inner `return`s, without
      // a spurious `… | null`.
      if (
        isConstTrue(stmt.condition) &&
        !hasEscapingBreak(stmt.statement, stmt.label)
      ) {
        return { type: "Never" };
      }
      return {
        type: "Nullable",
        subType: typeFromStatement(stmt.statement, ctx),
      };
    case "For":
    case "ForIn":
      return {
        type: "Nullable",
        subType: typeFromStatement(stmt.statement, ctx),
      };
    case "Break":
    case "Continue":
      return { type: "Never" };
    default:
      return typeFromExpression(stmt, ctx);
  }
};

export const _flattenType = (type: VLType): VLType[] => {
  if (type.type === "Union") return type.subTypes.flatMap(_flattenType);
  if (type.type === "Nullable") {
    let flattened = _flattenType(type.subType);
    if (!Array.isArray(flattened)) flattened = [flattened];
    return [{ type: "Alias", name: "null" }, ...flattened];
  }
  return [type];
};

// The builtin scalar name a type resolves to (`i32`/`f64`/`boolean`/…), or
// undefined for a non-scalar.
const SCALARS = ["i32", "i64", "f32", "f64", "boolean"];
const scalarName = (type: VLType): string | undefined => {
  let t = softenImplicitType(type);
  while (t.type === "Infer") t = softenImplicitType(t.subType);
  const n = (t.type === "Object" || t.type === "Alias" || t.type === "Custom")
    ? t.name
    : undefined;
  return n && SCALARS.includes(n) ? n : undefined;
};
// Two *different* builtin scalars (`i32` vs `f64`). Numeric coercion makes one
// assignable to a wider one (`i32` ⊑ `f64`), but in a union they are distinct
// runtime variants — they must not collapse into each other.
export const distinctScalars = (a: VLType, b: VLType): boolean => {
  const na = scalarName(a);
  const nb = scalarName(b);
  return na !== undefined && nb !== undefined && na !== nb;
};

export const flattenType = (type: VLType): VLType => {
  const flattened = _flattenType(type);
  if (flattened.length === 1 && flattened[0] === type) return type;

  const deduped: VLType[] = [flattened[0]];
  outer: for (let i = 1; i < flattened.length; i++) {
    for (let n = 0; n < deduped.length; n++) {
      // Distinct scalars never subsume one another — keep both as variants.
      if (distinctScalars(deduped[n], flattened[i])) continue;
      if (validateType(deduped[n], flattened[i])) continue outer;
      if (validateType(flattened[i], deduped[n])) {
        deduped.splice(n, 1, flattened[i]);
        continue outer;
      }
    }
    deduped.push(flattened[i]);
  }

  if (deduped.length === 1) return deduped[0];

  let nullable = false;
  for (let i = 0; i < deduped.length; i++) {
    const t = deduped[i];
    if (t.type === "Alias" && t.name === "null") {
      nullable = true;
      deduped.splice(i, 1);
      break;
    }
  }

  if (nullable) {
    return {
      type: "Nullable",
      subType: deduped.length === 1
        ? deduped[0]
        : { type: "Union", subTypes: deduped },
    };
  }

  return { type: "Union", subTypes: deduped };
};

export const getConcreteType = (
  type: VLType,
  ctx: Context | undefined,
  seen: Set<string> = new Set(),
): VLType => {
  if (type.type !== "Alias") return type; // TODO: Should handle recursiveness (objects, params, etc)
  if (type.name === "null") return type;

  // A self-referential alias chain (e.g. the bodyless `type Point`, whose grammar
  // alt `TYPE ID` aliases the name to itself) would otherwise recurse forever and
  // stack-overflow. Opaque/recursive type aliases aren't supported yet (A14):
  // report it cleanly and bail instead of crashing.
  if (seen.has(type.name)) {
    if (ctx) {
      errors.push({
        type: "Syntax",
        message:
          `Type \`${type.name}\` refers to itself; opaque/recursive type aliases are not yet supported`,
        ctx,
        code: 1,
      });
    }
    return { type: "Never" };
  }
  seen.add(type.name);

  for (let i = scopes.length - 1; i >= 0; i--) {
    if (Object.hasOwn(scopes[i], type.name)) {
      type = scopes[i][type.name];
      if (type.type === "Type") return getConcreteType(type.subType, ctx, seen);
      return getConcreteType(type, ctx, seen);
    }
  }

  if (ctx) errors.push({ type: "Undeclared", name: type.name, ctx, code: 1 });
  else {
    throw new Error(
      `Expected ctx to be defined or the alias ${type.name} to be resolveable`,
    );
  }

  return { type: "Never" };
};

export const makeExact = (type: VLType): VLType => {
  if (type.type === "Infer") return makeExact(type.subType);
  if (type.type === "Object") {
    let exacted = false;
    const props = type.properties.map((p) => {
      const n = makeExact(p.type);
      if (n !== p.type) exacted = true;
      return n;
    });
    if (exacted) {
      return {
        type: "Object",
        properties: type.properties.map((p, i) => ({ ...p, type: props[i] })),
      };
    }
  }
  return type;
};

// True if `type` reaches an inference hole — i.e. it is generic and must be
// instantiated (cloned with fresh holes) before being unified at a call site.
export const containsInfer = (
  type: VLType,
  seen = new Set<VLType>(),
): boolean => {
  if (seen.has(type)) return false;
  seen.add(type);
  switch (type.type) {
    case "Infer":
      return true;
    case "Function":
      return type.paramaters.some((p) =>
        containsInfer(p.paramaterType, seen)
      ) ||
        containsInfer(type.return, seen);
    case "Object":
      return type.properties.some((p) => containsInfer(p.type, seen));
    case "Union":
      return type.subTypes.some((s) => containsInfer(s, seen));
    case "Nullable":
      return containsInfer(type.subType, seen);
    default:
      return false;
  }
};

// Deep-copy a type, giving every inference hole a *fresh* cell while preserving
// internal sharing (a hole reachable by two paths maps to one fresh hole, so
// correlated params/return stay linked). This is monomorphization at the type
// level: a generic signature is cloned per call site so each unifies against
// its own arguments independently. Non-hole leaves are copied too, so the
// in-place unification (`updateType`) of one instance can't leak into another.
export const cloneTypeFresh = (
  type: VLType,
  map: Map<VLType, VLType> = new Map(),
): VLType => {
  const existing = map.get(type);
  if (existing) return existing;
  switch (type.type) {
    case "Infer": {
      const fresh: VLType = { type: "Infer", subType: type.subType };
      map.set(type, fresh);
      fresh.subType = cloneTypeFresh(type.subType, map);
      return fresh;
    }
    case "Function": {
      const fresh: VLType = { type: "Function", paramaters: [], return: type };
      map.set(type, fresh);
      fresh.paramaters = type.paramaters.map((p) => ({
        ...p,
        paramaterType: cloneTypeFresh(p.paramaterType, map),
      }));
      fresh.return = cloneTypeFresh(type.return, map);
      return fresh;
    }
    case "Object": {
      const fresh: VLType = { type: "Object", properties: [], name: type.name };
      map.set(type, fresh);
      fresh.properties = type.properties.map((p) => ({
        ...p,
        type: cloneTypeFresh(p.type, map),
      }));
      return fresh;
    }
    case "Union": {
      const fresh: VLType = { type: "Union", subTypes: [] };
      map.set(type, fresh);
      fresh.subTypes = type.subTypes.map((s) => cloneTypeFresh(s, map));
      return fresh;
    }
    case "Nullable": {
      const fresh: VLType = { type: "Nullable", subType: type.subType };
      map.set(type, fresh);
      fresh.subType = cloneTypeFresh(type.subType, map);
      return fresh;
    }
    default: {
      const fresh = { ...type };
      map.set(type, fresh);
      return fresh;
    }
  }
};

// Instantiate a (possibly generic) function type for a single call site: clone
// it with fresh holes, unify those holes against the call's arguments, then
// collapse each now-resolved hole to a concrete type so the call's argument and
// return types are checked *strictly* — closing the soundness gap where a bare
// `Infer` always widens-and-accepts. Non-generic functions are returned as-is.
export const instantiateFunctionType = (
  type: VLType,
  args: VLArgumentNode[],
  ctx: Context,
): VLType => {
  if (type.type !== "Function" || !containsInfer(type)) {
    if (type.type === "Function") ensureParameters(type.paramaters, args, ctx);
    return type;
  }
  const instance = cloneTypeFresh(type) as VLType & { type: "Function" };
  ensureParameters(instance.paramaters, args, ctx);
  return {
    type: "Function",
    paramaters: instance.paramaters.map((p) => ({
      ...p,
      paramaterType: makeExact(p.paramaterType),
    })),
    return: makeExact(instance.return),
  };
};

// Apply a generic `type` alias (`Box<i32>`) to concrete type arguments —
// application IS substitution. We clone the alias body with the clone map
// pre-seeded so each param hole maps *directly* to its argument: every `T`
// occurrence in the body becomes the argument itself, not a fresh hole linked to
// it. This matters when the argument is still an unresolved hole (`Box<T>` in
// `unwrap<T>(b: Box<T>): T`) — the body then references the *same* function hole
// as the return, so `cloneTypeFresh` of the enclosing signature keeps them
// correlated and inference flows from the call's argument (Stage 1/2 machinery).
// When the arguments are concrete the result is concrete with no leftover holes.
// The clone keeps each application independent (a `Box<i32>` and a sibling
// `Box<string>` get separate object structures). Arity is checked by the caller
// (the parser, which has the per-argument spans).
export const instantiateAlias = (
  entry: VLTypeType,
  args: VLType[],
): VLType => {
  const params = entry.params ?? [];
  const map = new Map<VLType, VLType>();
  for (let i = 0; i < params.length && i < args.length; i++) {
    map.set(params[i], args[i]);
  }
  return cloneTypeFresh(entry.subType, map);
};

export const getType = (name: string, ctx: Context): VLType => {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (Object.hasOwn(scopes[i], name)) return scopes[i][name];
  }
  errors.push({ type: "Undeclared", name, ctx, code: "undeclared-type" });
  return { type: "Unknown" };
};

export const getChildType = (
  object: VLType,
  property: VLType,
  objectCtx: Context,
  propertyCtx: Context,
): VLType | undefined => {
  let infer = false;
  if (object.type === "Infer") {
    infer = true;
    object = object.subType;
    if (object.type === "Unknown") {
      updateType(object, { type: "Object", properties: [] });
    }
  }
  // A directly-used (un-bound) string literal keeps its `StringLiteral` type
  // (e.g. `"a".length`); soften it to the nominal `string` Object — an
  // i32-indexed array — so a one-char string isn't mistaken for a char and its
  // intrinsic members (`.length`, indexing) resolve like a bound `string` does.
  // (A char literal `'a'` is an IntegerLiteral, never a StringLiteral, so it is
  // unaffected and correctly carries no members.)
  if (object.type === "StringLiteral") object = softenImplicitType(object);
  if (object.type !== "Object") {
    errors.push({
      type: "Type",
      left: {
        type: "Object",
        properties: [{ name: property, type: { type: "Unknown" } }],
      },
      right: object,
      ctx: objectCtx,
      code: 4,
    });
    return;
  }

  // `array.length` is an intrinsic i32 member of any array type.
  if (
    property.type === "StringLiteral" && property.value === "length" &&
    arrayElementType(object)
  ) {
    return { type: "Alias", name: "i32" };
  }

  // Intrinsic list members (`.capacity`, `.get`, …) — a `T[]` is anonymous, so
  // these are special-cased here rather than declared on a scope object.
  if (property.type === "StringLiteral" && isListType(object)) {
    const member = listMemberType(arrayElementType(object)!)[property.value];
    if (member) return member;
  }

  // Intrinsic map/set members. A `Set<T>` routes to its OWN surface
  // (`add`/`has`/`delete`/`length`/`values`), a `Map<K,V>` to the map surface;
  // a set must NOT expose `.set`/`.get`/`.keys()` (C2.2).
  if (property.type === "StringLiteral") {
    const kv = mapKeyValueType(object);
    if (kv) {
      const setEl = setElementType(object);
      const member = setEl !== null
        ? setMemberType(setEl)[property.value]
        : mapMemberType(kv.key, kv.value)[property.value];
      if (member) return member;
    }
  }

  let propertyType = object.properties.find((p) =>
    validateType(p.name, property)
  );
  if (!propertyType) {
    if (infer) {
      propertyType = {
        name: property,
        type: { type: "Infer", subType: { type: "Unknown" } },
      };
      object.properties.push(propertyType);
    } else {
      errors.push({ type: "Property", property, ctx: propertyCtx, code: 5 });
      return;
    }
  }

  return propertyType.type;
};

export const updateType = (oldType: VLType, newType: VLType) => {
  // deno-lint-ignore no-explicit-any
  for (const prop in oldType) delete (oldType as any)[prop];
  Object.assign(oldType, newType);
  // Object.assign(oldType, structuredClone(newType));
  return oldType;
};

export const nonNullable = (type: VLType): VLType => {
  if (type.type === "Alias" && type.name === "null") return { type: "Never" };
  if (type.type === "Nullable") return nonNullable(type.subType);
  if (type.type === "Union") {
    const subTypes = type.subTypes.map((s) => nonNullable(s));
    if (subTypes.some((s, i) => s !== type.subTypes[i])) {
      const filtered = subTypes.filter((v) => v.type !== "Never");
      if (!filtered.length) return { type: "Never" };
      return { type: "Union", subTypes: filtered };
    }
  }
  return type;
};

// Flow narrowing (A5): a fact extracted from an `if` condition — which *place*
// (a name `x` or a property path `o.v`) becomes which type in which branch.
// `name` is the place's canonical key; `place` is the expression itself (so the
// appliers can read its current type). Applied by both passes: toAST narrows the
// type scope / path overlay, toWasm its codegen overlay, around the branch.
export const conditionNarrowing = (
  cond: VLExpression,
): {
  name: string;
  place: VLExpression;
  nonNullOn: "then" | "else";
  thenType?: VLType;
} | null => {
  // `x is T` — narrows x to T in the then-branch (or, for `x is null`, leaves it
  // null there and non-null in the else). For a nullable, the non-null subtype
  // and `null` are the only variants, so this is a nullness narrowing. For a
  // (boxed) value union, `thenType` carries the concrete variant `T`, so the
  // then-branch sees `x: T` (not merely non-null) — codegen unboxes accordingly.
  if (cond.type === "Is") {
    const key = placeKey(cond.value);
    if (key === null) return null;
    const checksNull = cond.checkType.type === "Alias" &&
      cond.checkType.name === "null";
    // `!is` flips which branch sees the non-null/refined view (and a negated
    // guard has no single positive `thenType` to narrow to).
    const nonNullOn = checksNull ? "else" : "then";
    return {
      name: key,
      place: cond.value,
      nonNullOn: cond.negated
        ? (nonNullOn === "then" ? "else" : "then")
        : nonNullOn,
      thenType: checksNull || cond.negated ? undefined : cond.checkType,
    };
  }
  // A call to an inferred type-guard function (A6b): `if present(v) { … }`
  // narrows the argument the way the guard's body narrows its parameter.
  if (cond.type === "FunctionCall") {
    const guard = guards.get(cond.function);
    const arg = guard && cond.arguments[guard.paramIndex]?.value;
    const key = arg ? placeKey(arg) : null;
    if (guard && arg && key !== null) {
      return { name: key, place: arg, nonNullOn: guard.nonNullOn };
    }
    return null;
  }
  if (cond.type !== "BinaryOperation") return null;
  if (cond.operator !== "==" && cond.operator !== "!=") return null;
  const isNull = cond.left.type === "NullLiteral" ||
    cond.right.type === "NullLiteral";
  const place = cond.left.type === "NullLiteral" ? cond.right : cond.left;
  const key = placeKey(place);
  if (!isNull || key === null) return null;
  // `x != null` → x is non-null in the THEN branch; `x == null` → in the ELSE.
  return {
    name: key,
    place,
    nonNullOn: cond.operator === "!=" ? "then" : "else",
  };
};

// Two types denoting the same variant (mutually assignable) — used to remove a
// member from a union. Numeric coercion is one-directional (`i32` ⊑ `f64` but
// not the reverse), so this stays an equality test, not a subtyping one.
//
// Holes (`Unknown` / `Infer`) are never "the same variant" as a concrete type —
// and must be skipped *before* `validateType`, which has a hidden side effect:
// `ensureType`'s `Unknown` case greedily pins the hole to whatever it's compared
// against. Narrowing inspects holes (an un-annotated param flows through `is`
// guards), so an un-guarded compare here would permanently pin the parameter.
const isHole = (t: VLType): boolean =>
  t.type === "Unknown" || t.type === "Infer";
const sameVariant = (a: VLType, b: VLType): boolean =>
  !isHole(a) && !isHole(b) && validateType(a, b) && validateType(b, a);

// Does a type resolve (through alias chains, and through the members of a
// union/nullable) to a `Type` wrapper — the stored form of a user `type` alias,
// which for a *recursive* alias is the lazy self-referential leaf (A11)?
//
// Object literals are bare `Object`s, never `Type`-wrapped, so comparing an
// alias-typed expected field against a literal hits `ensureType`'s `Type` case,
// which conservatively rejects `Type` vs non-`Type` (it cannot peel the wrapper
// without risking infinite recursion on a self-reference). That rejection is a
// *false-negative*, not a real value mismatch — the structural relation may
// well hold. The object property loop relies on it to keep recursive aliases
// (`left: Tree | null`) terminating, so the loop must NOT promote such a
// rejection to an error. This predicate scopes the field-value error to cases
// where neither field type is an alias leaf, leaving the recursive path exactly
// as lenient as before while still catching concrete mismatches.
const resolvesToTypeWrapper = (t: VLType, depth = 0): boolean => {
  if (depth > 64) return false; // self-referential alias chain — treat as a leaf
  while (t.type === "Alias") {
    let next: VLType | undefined;
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (Object.hasOwn(scopes[i], t.name)) {
        next = scopes[i][t.name];
        break;
      }
    }
    if (next === undefined || next === t) return false;
    t = next;
  }
  // `Never` is a degenerate type left behind by an upstream error (e.g. an
  // undeclared alias resolves to `Never`). Treat it like an alias leaf so the
  // field-value loop stays lenient and does not pile a cascade mismatch on top
  // of the real diagnostic.
  if (t.type === "Type" || t.type === "Never") return true;
  if (t.type === "Nullable") return resolvesToTypeWrapper(t.subType, depth + 1);
  if (t.type === "Union") {
    return t.subTypes.some((s) => resolvesToTypeWrapper(s, depth + 1));
  }
  return false;
};

// Remove a variant from a union/nullable, returning the residual type (the other
// members, re-flattened). Backs else-branch narrowing: in `if x is A { … } else
// { … }`, `x` is `U − A` in the else branch. `Never` if nothing remains.
//
// `removed` may itself be a finite union (the `||`/De-Morgan case removes each
// arm). When `type` is *not* a finite union of the removed variant (an open
// type like `i32` minus the literal `1`), there's nothing concrete to drop, so
// the type is returned unchanged — open-world negation isn't tracked (A4 note).
export const subtractType = (type: VLType, removed: VLType): VLType => {
  const drop = _flattenType(removed);
  const kept = _flattenType(type).filter((v) =>
    !drop.some((d) => sameVariant(v, d))
  );
  if (kept.length === 0) return { type: "Never" };
  return flattenType({ type: "Union", subTypes: kept });
};

// The more specific of two overlapping types (the refinement `a & b`), or null
// if they're disjoint. `distinctScalars` first: `i32` and `f64` overlap under
// coercion (`i32 ⊑ f64`) but are distinct *variants*, so their meet is empty.
const meet = (a: VLType, b: VLType): VLType | null => {
  // A hole would be pinned by `validateType` (see `sameVariant`); refine toward
  // the concrete side instead of inspecting it.
  if (isHole(a)) return b;
  if (isHole(b)) return a;
  if (distinctScalars(a, b)) return null;
  if (validateType(b, a)) return a; // a ⊑ b → a is the refinement
  if (validateType(a, b)) return b; // b ⊑ a → b is the refinement
  return null;
};

// Intersection (A3): the type a value has when it is *both* `a` and `b` — the
// then-branch refinement of a guard (`if x is A` → `x & A`). Holes refine to the
// other side; a `Negation` becomes a subtraction; otherwise each member of `a`
// that overlaps `b` is refined to the meet, and disjoint members drop (so
// `(string | i32) & i32` is `i32`, and an impossible refinement is `Never`).
export const intersectType = (a: VLType, b: VLType): VLType => {
  if (a.type === "Unknown" || a.type === "Infer") return b;
  if (b.type === "Unknown" || b.type === "Infer") return a;
  if (a.type === "Never" || b.type === "Never") return { type: "Never" };
  if (b.type === "Negation") return subtractType(a, b.subType);
  if (a.type === "Negation") return subtractType(b, a.subType);
  const kept = _flattenType(a)
    .map((m) => meet(m, b))
    .filter((m): m is VLType => m !== null);
  if (kept.length === 0) return { type: "Never" };
  return flattenType({ type: "Union", subTypes: kept });
};

// A flow-narrowing fact applied to one place: `apply` maps the place's current
// type to its narrowed type in a given branch. The appliers iterate a *list* of
// these (a `&&` of guards narrows several places), reading each place's current
// (already-overlaid) type so the narrowings compose.
export type Narrowing = {
  name: string;
  place: VLExpression;
  apply: (current: VLType) => VLType;
};

// One atomic condition's effect on a single place, as a type transform per
// branch (`then` when truthy, `else` when falsy); either is null when that
// branch carries no useful refinement. Composite `&&`/`||` conditions combine
// these — see `thenNarrowings` / `elseNarrowings`.
type AtomFact = {
  name: string;
  place: VLExpression;
  then: ((cur: VLType) => VLType) | null;
  else: ((cur: VLType) => VLType) | null;
};

// A literal *expression* node doubles as a literal *type* (same shape), so an
// `x == <literal>` comparison can narrow `x` to that literal (A4 discriminant).
const literalType = (e: VLExpression): VLType | null =>
  e.type === "IntegerLiteral" || e.type === "RealLiteral" ||
    e.type === "StringLiteral" || e.type === "BooleanLiteral"
    ? e
    : null;

const atomFact = (cond: VLExpression): AtomFact | null => {
  // `x is T` — then-branch refines `x` to `x & T`, else-branch subtracts `T`.
  // For `x is null` the roles invert (then keeps null, else is the non-null).
  if (cond.type === "Is") {
    const key = placeKey(cond.value);
    if (key === null) return null;
    const checksNull = cond.checkType.type === "Alias" &&
      cond.checkType.name === "null";
    if (checksNull) {
      const f = { name: key, place: cond.value, then: null, else: nonNullable };
      return cond.negated ? { ...f, then: f.else, else: f.then } : f;
    }
    const checkType = cond.checkType;
    const intersect = (cur: VLType) => intersectType(cur, checkType);
    const subtract = (cur: VLType) => subtractType(cur, checkType);
    // `!is` swaps the branches: then-branch subtracts `T`, else intersects it.
    return {
      name: key,
      place: cond.value,
      then: cond.negated ? subtract : intersect,
      else: cond.negated ? intersect : subtract,
    };
  }
  // Inferred type-guard call (A6b): narrow the argument by the guard's fact.
  if (cond.type === "FunctionCall") {
    const guard = guards.get(cond.function);
    const arg = guard && cond.arguments[guard.paramIndex]?.value;
    const key = arg ? placeKey(arg) : null;
    if (!guard || !arg || key === null) return null;
    return {
      name: key,
      place: arg,
      then: guard.nonNullOn === "then" ? nonNullable : null,
      else: guard.nonNullOn === "else" ? nonNullable : null,
    };
  }
  if (cond.type !== "BinaryOperation") return null;
  if (cond.operator !== "==" && cond.operator !== "!=") return null;
  // The compared-against side is `null` or a literal; the other side is the
  // place. `x == null` / `x != null`, or `x == L` / `x != L`.
  const leftConst = cond.left.type === "NullLiteral" || literalType(cond.left);
  const place = leftConst ? cond.right : cond.left;
  const lit = literalType(cond.left) ?? literalType(cond.right);
  const isNull = cond.left.type === "NullLiteral" ||
    cond.right.type === "NullLiteral";
  const key = placeKey(place);
  if (key === null) return null;
  if (isNull) {
    // `x != null` → non-null when true; `x == null` → non-null when false.
    return cond.operator === "!="
      ? { name: key, place, then: nonNullable, else: null }
      : { name: key, place, then: null, else: nonNullable };
  }
  if (lit) {
    const eq = (cur: VLType) => intersectType(cur, lit);
    const ne = (cur: VLType) => subtractType(cur, lit);
    return cond.operator === "=="
      ? { name: key, place, then: eq, else: ne }
      : { name: key, place, then: ne, else: eq };
  }
  return null;
};

const factNarrowing = (f: AtomFact, dir: "then" | "else"): Narrowing[] => {
  const apply = f[dir];
  return apply ? [{ name: f.name, place: f.place, apply }] : [];
};

// Whether a place involves an optional `?.` hop, so its narrowing is guarded by
// the receiver being non-null (the else branch then can't narrow it soundly).
const isOptionalChain = (e: VLExpression): boolean =>
  e.type === "OptionalAccess" ||
  (e.type === "PropertyAccess" && isOptionalChain(e.object));

// For a guard on an optional chain (`x?.y is T`), the truthy branch also implies
// every `?.` receiver is non-null — emit those facts (innermost first, so each
// resolves against an already-narrowed receiver) so the body's regular `x.y`
// reads resolve. Only the THEN branch; the else may still be null.
const optionalChainThenFacts = (place: VLExpression): Narrowing[] => {
  if (place.type !== "OptionalAccess" && place.type !== "PropertyAccess") {
    return [];
  }
  const inner = optionalChainThenFacts(place.object);
  if (place.type === "OptionalAccess") {
    const key = placeKey(place.object);
    if (key !== null) {
      return [...inner, { name: key, place: place.object, apply: nonNullable }];
    }
  }
  return inner;
};

// Narrowings that hold in the THEN branch of `if <cond>`. A `&&` contributes
// *both* sides' then-facts (the conjunction holds), a `||` contributes none (a
// disjunction narrows nothing positively); an atom contributes its then-fact,
// plus (for an optional-chain guard) its receivers' non-null facts.
export const thenNarrowings = (cond: VLExpression): Narrowing[] => {
  if (cond.type === "BinaryOperation" && cond.operator === "&&") {
    return [...thenNarrowings(cond.left), ...thenNarrowings(cond.right)];
  }
  if (cond.type === "BinaryOperation" && cond.operator === "||") return [];
  const f = atomFact(cond);
  if (!f) return [];
  return [...optionalChainThenFacts(f.place), ...factNarrowing(f, "then")];
};

// Narrowings that hold in the ELSE branch — the De Morgan dual: `||` contributes
// both sides' else-facts (neither arm held), `&&` contributes none. An
// optional-chain guard contributes nothing here: the chain may be null, so its
// negation isn't a sound refinement of the path.
export const elseNarrowings = (cond: VLExpression): Narrowing[] => {
  if (cond.type === "BinaryOperation" && cond.operator === "||") {
    return [...elseNarrowings(cond.left), ...elseNarrowings(cond.right)];
  }
  if (cond.type === "BinaryOperation" && cond.operator === "&&") return [];
  const f = atomFact(cond);
  if (!f || isOptionalChain(f.place)) return [];
  return factNarrowing(f, "else");
};

// A place's current (possibly already-narrowed) type for a narrowing: a bare
// name from the scope stack, a path via `typeFromExpression` (which itself
// consults the `narrowedPaths` overlay).
const placeCurrentType = (
  place: VLExpression,
  ctx: Context,
): VLType | undefined => {
  if (place.type === "Name") {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (Object.hasOwn(scopes[i], place.name)) return scopes[i][place.name];
    }
    return undefined;
  }
  return typeFromExpression(place, ctx);
};

// Run `fn` with a list of narrowings overlaid — a name via the scope stack, a
// property path via `narrowedPaths` — each read against the current (already-
// overlaid) type so successive narrowings compose (`x is A && x is B` → `A & B`).
// A refinement to `Never` (a disjoint / dead branch) is skipped rather than
// overlaid, so member access doesn't spuriously resolve against `Never`. Used by
// the appliers and by short-circuit `&&`/`||` type derivation.
export const withNarrowings = <T>(
  ns: Narrowing[],
  ctx: Context,
  fn: () => T,
): T => {
  const go = (i: number): T => {
    if (i >= ns.length) return fn();
    const n = ns[i];
    const cur = placeCurrentType(n.place, ctx);
    const next = cur && n.apply(cur);
    if (!next || next.type === "Never") return go(i + 1);
    if (n.place.type === "Name") {
      return withScope({ [n.name]: next }, () => go(i + 1));
    }
    const had = n.name in narrowedPaths;
    const prev = narrowedPaths[n.name];
    narrowedPaths[n.name] = next;
    try {
      return go(i + 1);
    } finally {
      if (had) narrowedPaths[n.name] = prev;
      else delete narrowedPaths[n.name];
    }
  };
  return go(0);
};

// Whether a statement always diverges (never falls through to the next): a
// `return`/`break`/`continue`, a block ending in one, an `if` whose every branch
// (incl. an `else`) diverges, or a `while true` with no escaping break.
export const divergesStatement = (s: VLStatement): boolean => {
  switch (s.type) {
    case "Return":
    case "Break":
    case "Continue":
      return true;
    case "Block":
      return s.statements.length > 0 &&
        divergesStatement(s.statements[s.statements.length - 1]);
    case "If":
      return s.else !== undefined &&
        s.conditionals.every((c) => divergesStatement(c.statement)) &&
        divergesStatement(s.else);
    case "While":
      return isConstTrue(s.condition) &&
        !hasEscapingBreak(s.statement, s.label);
    default:
      return false;
  }
};

// Post-guard narrowing (A5): a guard clause `if x == null { return }` (a single
// conditional, no else, whose then-branch diverges) leaves `x` narrowed for the
// REST of the enclosing block. The fall-through *is* the condition's else side,
// so the narrowings are exactly its `elseNarrowings` — which generalizes to
// `||` guards (`if x == null || y == null { return }` narrows both x and y).
export const postGuardNarrowings = (stmt: VLStatement): Narrowing[] => {
  if (stmt.type !== "If") return [];
  if (stmt.conditionals.length !== 1 || stmt.else) return [];
  if (!divergesStatement(stmt.conditionals[0].statement)) return [];
  return elseNarrowings(stmt.conditionals[0].condition);
};

/** Registers diagnostics automatically */
export const ensureType = (
  left: VLType,
  right: VLType,
  ctx: Context,
): boolean => {
  if (right.type === "Infer" && left.type !== "Infer") {
    [right, left] = [left, right];
  }

  outer: while (left.type === "Alias") {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (Object.hasOwn(scopes[i], left.name)) {
        left = scopes[i][left.name];
        continue outer;
      }
    }
    break;
  }

  outer: while (right.type === "Alias") {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (Object.hasOwn(scopes[i], right.name)) {
        right = scopes[i][right.name];
        continue outer;
      }
    }
    break;
  }

  if (left === right) return true;

  const pushError = (code: number | string) => {
    errors.push({ type: "Type", left, right, ctx, code });
    return false;
  };

  if (left.type === "Never" || right.type === "Never") {
    // We can assume this has already been errored?
    return false;
  }

  if (right.type === "Union") {
    if (!right.subTypes.every((s) => validateType(left, s))) {
      return pushError("union");
    }
    return true;
  }

  switch (left.type) {
    // Unknown is inferrable
    case "Unknown": {
      // TODO: we should keep the literal type if it came from a non-literal node
      // We shouldn't do this at all here, since this is greedy and complex objects may fail later
      updateType(left, softenImplicitType(right));
      return true;
    }
    case "Alias":
      // TODO: this should be inverted for safety...
      if (left.name === "string") {
        if (right.type === "Alias") {
          if (right.name !== "string") return pushError(13);
        } else if (right.type !== "StringLiteral") return pushError(14);
      } else if (left.name === "null") {
        if (
          (right.type !== "Alias" || right.name !== "null") &&
          right === nonNullable(right)
        ) {
          return pushError(17);
        }
      } else {
        let type: VLType | undefined = undefined;
        for (let i = scopes.length - 1; i >= 0; i--) {
          if (Object.hasOwn(scopes[i], left.name)) {
            type = scopes[i][left.name];
            break;
          }
        }
        // We should be showing an error on the type itself
        if (!type) return false;
        if (type.type === "Type") return ensureType(type.subType, right, ctx);
        return ensureType(type, right, ctx);
      }
      return true;
    case "Function":
      if (right.type !== "Function") return pushError(18);
      if (!ensureType(left.return, right.return, ctx)) return false;
      // Could maybe allow right to have extra parameters so long as they are nullable
      if (left.paramaters.length !== right.paramaters.length) {
        return pushError("different-parameters-length");
      }
      for (let i = 0; i < left.paramaters.length; i++) {
        // TODO: eventually should support specifying a function's parameters
        // as position or positional+named, as it's annoying to have the name
        // be part of the signature. A `"_"` expected-param name is the
        // positional wildcard: it waives the name match, so a synthetic callback
        // type (e.g. `map`/`filter`'s `f`) accepts a lambda/function whose
        // parameter is named anything.
        if (
          left.paramaters[i].name !== "_" &&
          left.paramaters[i].name !== right.paramaters[i].name
        ) {
          return pushError("different-parameter-names");
        }
        if (
          !validateType(
            right.paramaters[i].paramaterType,
            left.paramaters[i].paramaterType,
          )
        ) {
          return pushError("different-typed-parameters");
        }
      }
      return true;
      // Technically we should an integer literal outside the i32 range as an exception, same as f32/f64
    case "IntegerLiteral":
      if (right.type !== "IntegerLiteral") return pushError(19);
      if (left.value !== right.value) return pushError(20);
      return true;
    case "RealLiteral":
      if (right.type !== "RealLiteral" && right.type !== "IntegerLiteral") {
        return pushError(19);
      }
      if (left.value !== right.value) return pushError(20);
      return true;
    case "StringLiteral":
      if (right.type !== "StringLiteral") return pushError(21);
      if (left.value !== right.value) return pushError(22);
      return true;
    case "BooleanLiteral":
      if (right.type !== "BooleanLiteral") return pushError(23);
      if (left.value !== right.value) return pushError(24);
      return true;
    case "Object": {
      const assignmentProp = left.properties.find((p) =>
        validateType(p.name, { type: "StringLiteral", value: "=" })
      )?.type;
      if (
        assignmentProp && assignmentProp.type === "Function" &&
        assignmentProp.paramaters.length > 0
      ) {
        return ensureType(
          assignmentProp.paramaters[0].paramaterType,
          right,
          ctx,
        );
      }

      if (right.type !== "Object") return pushError(25);
      // A `Map<K,V>` is a distinct hash type, not a plain object: an object
      // literal coerced to a map type (`let o: {[string]: i32} = {}`) is a
      // category error (and would hard-fail in codegen — the struct shapes
      // differ). Reject it with a clear message. Map-to-map assignment is fine
      // (both sides are map types), so only block a non-map object value flowing
      // into a map-typed slot.
      if (isMapType(left) && !isMapType(right)) {
        errors.push({
          type: "Syntax",
          message:
            "An object literal isn't a map value — construct a map with " +
            "`Map()` (or a set with `Set()`), e.g. " +
            "`let m: {[string]: i32} = Map()`",
          ctx,
          code: 0,
        });
        return false;
      }
      // Coinductive guard: while already comparing this exact pair (a recursive
      // type reached through its own fields), assume the relation holds so the
      // structural walk terminates (A11).
      const pairKey = `${typeId(left)}:${typeId(right)}`;
      if (comparingPairs.has(pairKey)) return true;
      comparingPairs.add(pairKey);
      try {
        const indexProperties = [];
        const rprops = new Set(right.properties);
        outer: for (const lprop of left.properties) {
          if (
            lprop.name.type === "StringLiteral" ||
            lprop.name.type === "IntegerLiteral"
          ) {
            for (const rprop of right.properties) {
              if (validateType(lprop.name, rprop.name)) {
                if (
                  (rprop.type.type === "Union" &&
                    rprop.type.subTypes.length === 0) ||
                  validateType(lprop.type, rprop.type)
                ) {
                  rprops.delete(rprop);
                  continue outer;
                }
                // The field values are incompatible. If either side resolves to
                // a user `type` alias leaf (the recursive-alias case, e.g.
                // `left: Tree | null` checked against a literal child object),
                // the failure may be the `Type`-vs-bare-`Object` false-negative
                // rather than a real mismatch — stay lenient (the prior
                // behavior) so A11 recursive traversal keeps working. Otherwise
                // it is a genuine concrete value mismatch (`value: i32` given
                // `"x"`); raise it so object-literal field types are checked.
                if (
                  resolvesToTypeWrapper(lprop.type) ||
                  resolvesToTypeWrapper(rprop.type)
                ) {
                  return false;
                }
                return pushError("prop-value-mismatch");
              }
            }
            return pushError("missing-prop");
          } else {
            indexProperties.push(lprop);
            continue;
          }
        }
        // Excess properties on the supplied object: if the expected type has
        // index signatures they must satisfy one; otherwise they are allowed
        // (permissive structural width subtyping — a wider object satisfies a
        // narrower shape, so `function f(o) o.x` accepts `{ x, y }`). Exact-by-
        // default for values is a later refinement (ROADMAP A8 variance).
        //
        // When BOTH sides carry an index signature on a compatible key (the
        // array shape `{[i32]: T}` is exactly this), unify their VALUE types so
        // a generic element hole gets pinned to the argument's element type
        // (A10 stage 2). For a left index value that is a plain inference hole
        // this flows `T` out of `first([1, 2, 3])`; otherwise it is the
        // ordinary structural element check. We recurse on the value only once
        // the keys validate, so non-array objects (the right side has no
        // matching index signature) are untouched and the permissive width
        // behavior above is preserved. An empty right value union (`[]`) is
        // skipped so an empty array literal leaves the element hole open.
        if (rprops.size && indexProperties.length) {
          outer: for (const rprop of rprops.values()) {
            for (const lprop of indexProperties) {
              if (validateType(lprop.name, rprop.name)) {
                const emptyRight = rprop.type.type === "Union" &&
                  rprop.type.subTypes.length === 0;
                if (!emptyRight && !ensureType(lprop.type, rprop.type, ctx)) {
                  return false;
                }
                continue outer;
              }
            }
            return pushError("extra-prop");
          }
        }
        return true;
      } finally {
        comparingPairs.delete(pairKey);
      }
    }
    case "Nullable": {
      const nonNullableLeft = nonNullable(left);
      const nonNullableRight = nonNullable(right);
      if (
        (nonNullableRight.type === "Alias" &&
          nonNullableRight.name === "null") ||
        nonNullableRight.type === "Never"
      ) return true;
      if (!validateType(nonNullableLeft, nonNullableRight)) {
        return pushError(27);
      }
      return true;
    }
    case "Union": {
      for (const subType of left.subTypes) {
        const valid = validateType(subType, right);
        if (valid) return true;
      }
      return pushError(28);
    }
    // Refinement types (A3/A4) appear as narrowed views, rarely as an assignment
    // target. `right` satisfies `A & B` iff it satisfies every conjunct; it
    // satisfies `not A` iff it is *not* assignable to `A` (a conservative,
    // structural check — open-world negation isn't fully tracked).
    case "Intersection": {
      if (!left.subTypes.every((s) => validateType(s, right))) {
        return pushError("intersection");
      }
      return true;
    }
    case "Negation":
      if (validateType(left.subType, right)) return pushError("negation");
      return true;
    // case "Never":
    //   if (right.type !== "Never") return pushError(29);
    //   return true;
    case "Type":
      if (right.type !== "Type") return pushError(30);
      // Compare the *underlying* types — re-calling with the `Type` wrappers
      // unchanged would loop forever on a recursive alias (A11). The structural
      // walk below is made cycle-safe by the coinductive guard in the `Object`
      // case.
      return ensureType(left.subType, right.subType, ctx);
    case "Infer": {
      // A `Map()` / `Set()` constructor hole being pinned by an annotation. The
      // annotation must be a (string-keyed) map type; otherwise the construction
      // is ill-formed and would only fail opaquely later (codegen / a missing
      // `.add` member). Report a clear diagnostic now (B6a).
      if (left.mapCtor && !isMapType(right)) {
        if (arrayElementType(right)) {
          // An i32-keyed `{[i32]: T}` is the native list/array path, not a hash
          // map — i32-key Map/Set support is a deliberate follow-up.
          errors.push({
            type: "Syntax",
            message:
              `An i32-keyed ${left.mapCtor} isn't supported yet — i32 keys use ` +
              "a list/array (`T[]`); `Map`/`Set` keys must be `string` for now",
            ctx,
            code: 0,
          });
        } else {
          errors.push({
            type: "Syntax",
            message:
              `${left.mapCtor}() needs a map type annotation ` +
              "(e.g. `let m: {[string]: i32} = Map()`)",
            ctx,
            code: 0,
          });
        }
        // Pin the hole so downstream codegen doesn't see a bare `Unknown`.
        updateType(left.subType, softenImplicitType(right));
        return false;
      }
      if (!validateType(left.subType, right)) {
        if (left.subType.type === "Unknown") updateType(left.subType, right);
        else if (left.subType.type === "Union") {
          left.subType.subTypes.push(softenImplicitType(right));
        } else {
          left.subType = {
            type: "Union",
            subTypes: [left.subType, softenImplicitType(right)],
          };
        }
      }
      return true;
    }
    case "Custom":
      if (!left.validate(right)) return pushError("custom-validation");
      return true;
    default: {
      const exhaustive: never = left;
      console.warn(`Did not type check ${exhaustive}`);
      return false;
    }
  }
};

/** Does not register diangostics */
export const validateType = (left: VLType, right: VLType): boolean => {
  const oldErrors = errors.splice(0, Infinity);
  const ret = ensureType(left, right, null as unknown as Context);
  errors.splice(0, Infinity, ...oldErrors);
  return ret;
};

// Reorder call arguments into PARAMETER (declaration) order, mirroring the
// matching `ensureParameters` performs: first place each *named* argument into
// the slot of the parameter with that name, then fill the remaining slots, in
// order, with the *positional* (unnamed) arguments. Returns one entry per
// parameter — `undefined` where no argument was supplied (an omitted nullable
// param) — followed by any leftover/unmatched arguments (a named arg with no
// matching parameter, or surplus positionals) appended in source order so the
// result never silently drops an argument. This is the single source of truth
// for argument<->parameter alignment shared by typechecking and codegen.
//
// Pure: no shared state, no diagnostics — callers (`ensureParameters` for
// checking, `toWasm` for emission) handle arity/name errors themselves.
export const orderArgumentsByParameters = (
  parameters: VLParameterNode[],
  args: VLArgumentNode[],
): (VLArgumentNode | undefined)[] => {
  const slots: (VLArgumentNode | undefined)[] = parameters.map(() => undefined);
  const leftover: VLArgumentNode[] = [];
  const positional: VLArgumentNode[] = [];

  // First place named arguments by parameter name.
  for (const arg of args) {
    if (arg.name === undefined) {
      positional.push(arg);
      continue;
    }
    const paramIndex = parameters.findIndex((p) => p.name === arg.name);
    if (paramIndex === -1 || slots[paramIndex] !== undefined) {
      // Unknown name, or a slot already filled (named collision): leave it for
      // the caller to diagnose rather than overwriting.
      leftover.push(arg);
    } else {
      slots[paramIndex] = arg;
    }
  }

  // Then fill the remaining slots, in order, with positional arguments.
  let next = 0;
  for (const arg of positional) {
    while (next < slots.length && slots[next] !== undefined) next++;
    if (next < slots.length) slots[next++] = arg;
    else leftover.push(arg);
  }

  return [...slots, ...leftover];
};

export const ensureParameters = (
  parameters: VLParameterNode[],
  args: VLArgumentNode[],
  ctx: Context,
) => {
  let pass = true;
  const params = [...parameters];
  const args2 = [...args];

  // First consume named parameters
  for (let i = 0; i < args2.length; i++) {
    // const [arg, ctx] = args2[i];
    if (args2[i].name) {
      const paramIndex = params.findIndex((p) => p.name === args2[i].name);
      const argType = typeFromExpression(args2[i].value, args2[i].context);
      if (paramIndex === -1) {
        errors.push({ type: "UnmatchedParameter", ctx, code: 8 });
        pass = false;
      } else if (
        ensureType(
          params[paramIndex].paramaterType,
          argType,
          ctx,
        )
        // validateType(
        //   argType,
        //   params[paramIndex].paramaterType,
        //   ctx,
        // )
      ) {
        params.splice(paramIndex, 1);
        args2.splice(i, 1);
        i--;
      }
    }
  }

  // Then consume positional ones
  while (args2.length) {
    // const [arg, ctx] = args[0];

    if (!params.length) {
      errors.push({
        type: "UnmatchedParameter",
        ctx: args2[0].context,
        code: 9,
      });
      pass = false;
      break;
    } else {
      // Point a mismatch at the offending argument, not the whole call.
      const argCtx = args2[0].context ?? ctx;
      const argType = typeFromExpression(args2[0].value, argCtx);
      ensureType(params[0].paramaterType, argType, argCtx);
      // validateType(argType, params[0].paramaterType, ctx);
      params.splice(0, 1);
      args2.splice(0, 1);
    }
  }

  const unmatchedParams = params.filter((p) =>
    p.paramaterType.type !== "Nullable"
  );
  if (unmatchedParams.length) {
    // TODO: indicate how many?
    errors.push({ type: "UnmatchedParameter", ctx, code: 10 });
    pass = false;
  }

  return pass;
};

export const validateParameters = (
  params: VLParameterNode[],
  args: VLArgumentNode[],
) => {
  const oldErrors = errors.splice(0, Infinity);
  const ret = ensureParameters(params, args, null as unknown as Context);
  errors.splice(0, Infinity, ...oldErrors);
  return ret;
};
