// The VL type algebra: implicit-type inference, softening, structural
// subtyping / coercion checks (`ensureType`/`validateType`), and the
// expression/statement type derivations. Operates on the AST + shared state.
import type {
  Context,
  VLAliasType,
  VLArgumentNode,
  VLExpression,
  VLParameterNode,
  VLStatement,
  VLStringLiteralNode,
  VLType,
} from "./ast.ts";
import { errors, flow, scopes } from "./state.ts";

export const _typeFromExpression = (
  expr: VLExpression,
  ctx: Context,
): VLType => {
  switch (expr.type) {
    case "BinaryOperation": {
      let leftType = typeFromExpression(expr.left, ctx);
      const rightType = typeFromExpression(expr.right, ctx);
      const op = expr.operator;
      // Operators live on the numeric object types (i32/f64/...), not on the
      // literal types, so a bare literal operand (e.g. `2` in `2 + 3`) has no
      // operator methods. Default an unconstrained numeric literal to its soft
      // type (IntegerLiteral -> i32, RealLiteral -> f64) and re-memoize the
      // operand so both type-checking and codegen see the concrete type.
      // TODO: when there's a concrete flow.desiredType, prefer it over the default
      // (so `f64 x = 2 + 3` makes the literals f64) with range checking.
      if (leftType.type === "IntegerLiteral" || leftType.type === "RealLiteral") {
        leftType = softenImplicitType(leftType);
        setNodeType(expr.left, leftType);
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
      if (leftType.type !== "Object") return missingOpFunc("left-not-object");
      const opFunc = leftType.properties.find((p) =>
        validateType(p.name, { type: "StringLiteral", value: op })
      )?.type;
      if (!opFunc || opFunc.type !== "Function") {
        return missingOpFunc("no-operator-function");
      }
      const param = opFunc.paramaters[0]?.paramaterType;
      if (!param) return missingOpFunc("bad-operator-function");
      if (!ensureType(param, rightType, ctx)) return { type: "Never" };
      return opFunc.return;
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
      const objType = typeFromExpression(expr.array, ctx);
      if (objType.type !== "Object") return { type: "Never" };
      const propType = typeFromExpression(expr.index, ctx);
      const property = objType.properties.find((p) =>
        validateType(p.name, propType)
      );
      if (!property) return { type: "Never" };
      return property.type;
    }
    case "Name":
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (expr.name in scopes[i]) return scopes[i][expr.name];
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
      let objType = typeFromExpression(expr.object, ctx);
      if (objType.type === "Infer") objType = objType.subType;
      if (objType.type !== "Object") return { type: "Never" };
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
    case "BooleanLiteral":
      return { type: "BooleanLiteral", value: expr.value };
    case "NullLiteral":
      // We can assume this is meant as a nullable value, though that's slightly different than a complex inference
      return { type: "Alias", name: "null" };
    case "FunctionCall":
      // Prefer the per-call instantiated signature (its return is resolved to a
      // concrete type for this call's arguments); the shared scope entry's
      // return may still hold an inference hole pinned by another call site.
      if (expr.functionType) return expr.functionType.return;
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (expr.function in scopes[i]) {
          const funcType = scopes[i][expr.function];
          if (funcType.type === "Function") return funcType.return;
          return { type: "Never" };
        }
      }
      return { type: "Never" };
    case "Call":
      return expr.functionType?.return ?? { type: "Never" };
    case "If": {
      const stmts = expr.conditionals.map((c) => c.statement);
      if (expr.else) {
        stmts.push(expr.else);
        return {
          type: "Union",
          subTypes: stmts.map((s) => typeFromStatement(s, ctx)),
        };
      }
      return {
        type: "Nullable",
        subType: {
          type: "Union",
          subTypes: stmts.map((s) => typeFromStatement(s, ctx)),
        },
      };
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
  while (type.type === "Alias") {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if ((type as VLAliasType).name in scopes[i]) {
        type = scopes[i][(type as VLAliasType).name];
        continue;
      }
    }
    break;
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

export const _softenImplicitType = (type: VLType): VLType => {
  if (type.type === "IntegerLiteral") return { type: "Alias", name: "i32" };
  if (type.type === "RealLiteral") return { type: "Alias", name: "f64" };
  if (type.type === "StringLiteral") return { type: "Alias", name: "string" };
  if (type.type === "BooleanLiteral") return { type: "Alias", name: "boolean" };
  if (type.type === "Nullable") {
    const subType = softenImplicitType(type.subType);
    if (subType === type.subType) return type;
    return { type: "Nullable", subType: softenImplicitType(type.subType) };
  }
  if (
    type.type === "Alias" || type.type === "Function" ||
    type.type === "Never" || type.type === "Type" || type.type === "Unknown" ||
    type.type === "Custom"
  ) return type;
  if (type.type === "Object") {
    let softenedProperty = false;
    const properties = type.properties.map((p) => {
      const next = softenImplicitType(p.type);
      if (p.type !== next) softenedProperty = true;
      return next;
    });
    if (softenedProperty) {
      return {
        type: "Object",
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
  const exhaustive: never = type;
  throw new Error(`Unhandled soften type: ${exhaustive}`);
};

export const softenImplicitType = (type: VLType): VLType =>
  getConcreteType(_softenImplicitType(type), undefined);

export const typeFromStatement = (
  stmt: VLStatement,
  ctx: Context,
): VLType => {
  switch (stmt.type) {
    case "Return":
      return stmt.value
        ? typeFromExpression(stmt.value, ctx)
        : { type: "Alias", name: "null" };
    case "VariableDeclaration":
      return stmt.variableType;
    case "While":
      return {
        type: "Nullable",
        subType: typeFromStatement(stmt.statement, ctx),
      };
    case "For":
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

export const flattenType = (type: VLType): VLType => {
  const flattened = _flattenType(type);
  if (flattened.length === 1 && flattened[0] === type) return type;

  const deduped: VLType[] = [flattened[0]];
  outer: for (let i = 1; i < flattened.length; i++) {
    for (let n = 0; n < deduped.length; n++) {
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
  if (type.name === "null" || type.name === "string") return type; // TODO: remove string and make it an object type

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
    if (type.name in scopes[i]) {
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
      return type.paramaters.some((p) => containsInfer(p.paramaterType, seen)) ||
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

export const getType = (name: string, ctx: Context): VLType => {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (name in scopes[i]) return scopes[i][name];
  }
  errors.push({ type: "Undeclared", name, ctx, code: "undeclared-type" });
  return { type: "Unknown" };
};

export const getChildType = (
  object: VLType,
  property: VLType,
  objectCtx: Context,
  propertyCtx: Context,
) => {
  let infer = false;
  if (object.type === "Infer") {
    infer = true;
    object = object.subType;
    if (object.type === "Unknown") {
      updateType(object, { type: "Object", properties: [] });
    }
  }
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
      if (left.name in scopes[i]) {
        left = scopes[i][left.name];
        continue outer;
      }
    }
    break;
  }

  outer: while (right.type === "Alias") {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (right.name in scopes[i]) {
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
          if (left.name in scopes[i]) {
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
        // be part of the signature
        if (left.paramaters[i].name !== right.paramaters[i].name) {
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
              return false;
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
      if (rprops.size && indexProperties.length) {
        outer: for (const rprop of rprops.values()) {
          for (const lprop of indexProperties) {
            if (validateType(lprop.name, rprop.name)) continue outer;
          }
          return pushError("extra-prop");
        }
      }
      return true;
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
    // case "Never":
    //   if (right.type !== "Never") return pushError(29);
    //   return true;
    case "Type":
      if (right.type !== "Type") return pushError(30);
      return ensureType(left, right, ctx);
    case "Infer": {
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

