import { inspect } from "node:util";
import Binaryen from "binaryen";
import {
  setNodeType,
  softenImplicitType,
  validateParameters,
  validateType,
  VLFunctionCallNode,
  VLFunctionDeclarationNode,
  VLParameterNode,
  VLProgramNode,
  VLStatement,
  VLType,
  vlType,
} from "./toAST.ts";
import { defaultScope } from "./defaultScope.ts";

const raise = (err?: string | Error): never => {
  if (typeof err === "object" && err instanceof Error) throw err;
  throw new Error(err);
};

const lowMask = BigInt(0xFFFFFFFF);

const ignoredKeys = new Set(Object.keys(defaultScope()));

export const toWasm = async (ast: VLProgramNode) => {
  const binaryen = await Binaryen();
  const m = new binaryen.Module();

  m.addMemoryImport("memory", "imports", "memory");

  m.addFunctionImport(
    "log",
    "imports",
    "log",
    binaryen.createType([binaryen.i32, binaryen.i32]),
    0,
  );

  // TODO: These don't need to be actual funcitons... can inline. But I think binaryen does that for us.
  m.addFunction(
    "__store_i32__",
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    m.i32.store(
      0,
      4,
      m.local.get(0, binaryen.i32),
      m.local.get(1, binaryen.i32),
    ),
  );

  m.addFunction(
    "__load_i32__",
    binaryen.i32,
    binaryen.i32,
    [],
    m.i32.load(0, 4, m.local.get(0, binaryen.i32)),
  );

  m.addFunction(
    "__store_i64__",
    binaryen.createType([binaryen.i32, binaryen.i64]),
    binaryen.none,
    [],
    m.i64.store(
      0,
      8,
      m.local.get(0, binaryen.i32),
      m.local.get(1, binaryen.i64),
    ),
  );

  m.addFunction(
    "__store_f32__",
    binaryen.createType([binaryen.i32, binaryen.f32]),
    binaryen.none,
    [],
    m.f32.store(
      0,
      4,
      m.local.get(0, binaryen.i32),
      m.local.get(1, binaryen.f32),
    ),
  );

  m.addFunction(
    "__store_f64__",
    binaryen.createType([binaryen.i32, binaryen.f64]),
    binaryen.none,
    [],
    m.f64.store(
      0,
      8,
      m.local.get(0, binaryen.i32),
      m.local.get(1, binaryen.f64),
    ),
  );

  m.addFunction(
    "__memory_grow__",
    binaryen.i32,
    binaryen.i32,
    [],
    m.memory.grow(m.local.get(0, binaryen.i32)),
  );

  m.addFunction(
    "__memory_size__",
    binaryen.none,
    binaryen.i32,
    [],
    m.memory.size(),
  );

  let loopIndex = 0;

  type ScopeEntry = [type: VLType, index: number];
  type Scope = Record<string, ScopeEntry>;
  const scopes: Scope[] = [];
  let currentScope: Scope;
  const withScope = <T>(scope: Scope, fn: () => T) => {
    scopes.push(scope);
    currentScope = scope;
    functionScopes.push({});
    const ret = fn();
    scopes.pop();
    functionScopes.pop();
    currentScope = scopes[scopes.length - 1];
    return ret;
  };

  const getScopeEntry = (name: string) => {
    let entry: ScopeEntry | undefined;
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (name in scopes[i]) {
        entry = scopes[i][name];
        break;
      }
    }
    if (!entry) throw new Error(`Expected "${name}" to be in scope`);
    return entry;
  };

  const isSomething = (type: VLType | undefined) =>
    !!type && !validateType({ type: "Alias", name: "null" }, type);

  let returnType: VLType | undefined = undefined;
  let desiredType: VLType | undefined = undefined;
  const withDesiredType = <T>(type: VLType | undefined, fn: () => T) => {
    const oldType = desiredType;
    desiredType = type;
    const ret = fn();
    desiredType = oldType;
    return ret;
  };
  const hasDesiredType = () => isSomething(desiredType);

  const loopLabels: string[] = [];

  const functionScopes: Record<string, string>[] = [];
  const functions: Record<
    string,
    {
      declaration: VLFunctionDeclarationNode;
      instances: { parameters: VLParameterNode[]; ref: number }[];
    }
  > = {};
  const getResolvedFunctionName = (name: string) => {
    let i = functionScopes.length - 1;
    while (i >= 0) {
      if (name in functionScopes[i]) return functionScopes[i][name];
      i--;
    }
    throw new Error(`Expected function ${name} to be in scope`);
  };
  const getDirectFunction = (name: string, node: VLFunctionCallNode) => {
    // Don't need to instantate built-ins
    if (ignoredKeys.has(name)) return name;

    // This just handles functions with the same name in different scopes; does not handle polymorphism
    const resolvedName = getResolvedFunctionName(name);
    const { declaration, instances } = functions[resolvedName];
    // This is wrong; we need to return a type-specific name of the function
    if (
      instances.some((i) => validateParameters(i.parameters, node.arguments))
    ) return resolvedName;

    // TODO: named/optional params
    const params = binaryen.createType(
      declaration.parameters.map((p) => toWasmType(p.paramaterType)),
    );
    const oldReturnType = returnType;
    returnType = declaration.returnType;
    const locals: number[] & { params?: number } = [];
    locals.params = declaration.parameters.length;
    const body = withScope(
      Object.fromEntries(
        declaration.parameters.map((
          p,
          i,
        ): [string, ScopeEntry] => [p.name, [p.paramaterType, i]]),
      ),
      () =>
        withLocals(locals, () =>
          withDesiredType(
            declaration.returnType,
            () => toExpression(declaration.body),
          )),
    );
    instances.push({
      parameters: node.functionType!.paramaters,
      ref: m.addFunction(
        resolvedName,
        params,
        toWasmType(returnType),
        locals,
        body,
      ),
    });
    returnType = oldReturnType;

    return resolvedName;
  };
  const getFunction = (node: VLFunctionCallNode) => {
    const [type, index] = getScopeEntry(node.function);

    if (type.type !== "Function") {
      throw new Error("Can only get function types");
    }

    let isDirect = true;
    try {
      getResolvedFunctionName(node.function);
    } catch {
      isDirect = false;
    }

    console.log("getFunction", node.function, isDirect);

    if (isDirect) return getDirectFunction(node.function, node);

    // WRONG; we need to instantiate!
    return m.local.get(index, toWasmType(type));
  };

  let _locals: number[] & { params?: number };
  const withLocals = <T>(newLocals: number[], fn: () => T) => {
    const oldLocals = _locals;
    _locals = newLocals;
    const ret = fn();
    _locals = oldLocals;
    return ret;
  };

  const handleFunctionDecl = (node: VLFunctionDeclarationNode) => {
    if (!node.name) throw new Error("Anonymous functions not yet handled");
    let name = node.name;
    let i = 1;
    while (name in functions) name = `${node.name}_${i++}`;
    functionScopes[functionScopes.length - 1][node.name] = name;
    functions[name] = { declaration: node, instances: [] };
    const index = _locals.push(binaryen.funcref) - 1 + (_locals.params ?? 0);
    console.log(...[
      "declared function",
      node.name,
      ...(name === node.name) ? [] : ["with alias", name],
      "at index",
      index,
    ]);
    currentScope[name] = [vlType(node), index];
  };

  const toExpression = (node: VLProgramNode | VLStatement): number => {
    // console.log(
    //   "toExpression",
    //   inspect(node, { depth: Infinity, compact: true }),
    //   desiredType,
    // );
    switch (node.type) {
      case "Program": {
        const modifiedScope = Object.fromEntries(
          Object.entries(node.scope)
            .filter(([k, v]) => !ignoredKeys.has(k) && v.type !== "Function")
            .map(([k, v], i): [string, ScopeEntry] => [k, [v, i]]),
        );
        const locals: number[] = [];
        return withLocals(locals, () =>
          withScope(
            modifiedScope,
            () =>
              m.addFunction(
                "__program__",
                binaryen.none,
                binaryen.none,
                // This really doesn't work with closures...
                locals,
                // Object.values(modifiedScope).filter((v) => v.type !== "Function")
                //   .map(toWasmType),
                m.block(
                  null,
                  node.statements
                    .map((n) =>
                      n.type === "FunctionDeclaration"
                        ? handleFunctionDecl(n)
                        : toExpression(n)
                    )
                    .filter((v: number | void): v is number =>
                      typeof v === "number"
                    ),
                ),
              ),
          ));
      }
      case "IntegerLiteral": {
        const type = desiredType?.type === "Object"
          ? desiredType?.name || "i32"
          : desiredType?.type === "Alias" // TODO: Should be concrete, but right now the built-ins have Aliases
          ? desiredType.name
          : "i32";
        if (
          type !== "i32" && type !== "i64" && type !== "f32" && type !== "f64"
        ) throw new Error("Expected numeric type");
        if (type === "i64") {
          const big = BigInt(node.text);
          return m.i64.const(Number(big & lowMask), Number(big >> BigInt(32)));
        }
        return m[type].const(node.value);
      }
      case "BooleanLiteral":
        return m.i32.const(node.value ? 1 : 0);
      case "RealLiteral": {
        const type = desiredType?.type === "Object"
          ? desiredType?.name || "f64"
          : desiredType?.type === "Alias" // TODO: Should be concrete, but right now the built-ins have Aliases
          ? desiredType.name
          : "f64";
        if (type !== "f32" && type !== "f64") {
          throw new Error("Expected numeric type");
        }
        return m[type].const(node.value);
      }
      case "FunctionCall": {
        const func = getFunction(node) as unknown as string | number;
        const functionType = node.functionType;
        if (!functionType) {
          throw new Error("Expected functionType to be set on function");
        }

        // TODO: named params
        const operands = node.arguments.map((a, i) =>
          withDesiredType(
            functionType.paramaters[i].paramaterType,
            () => toExpression(a.value),
          )
        );
        const returnType = toWasmType(functionType.return);

        console.log("???", func);

        const call = typeof func === "string"
          ? m.call(func, operands, returnType)
          : m.call_indirect(
            func,
            operands,
            binaryen.createType(
              functionType.paramaters.map((p) => toWasmType(p.paramaterType)),
            ),
            returnType,
          );

        return !hasDesiredType() && isSomething(functionType.return)
          ? m.drop(call)
          : call;
      }
      case "VariableDeclaration": {
        const index = _locals.push(toWasmType(node.variableType)) - 1 +
          (_locals.params ?? 0);
        currentScope[node.name] = [node.variableType, index];
        if (node.value) {
          return m.local.set(
            index,
            withDesiredType(node.variableType, () => toExpression(node.value!)),
          );
        }
        return m.i32.const(0); // Hmm...
      }
      case "Name": {
        const entry = getScopeEntry(node.name);
        return m.local.get(entry[1], toWasmType(entry[0]));
      }
      case "BinaryOperation": {
        const op = node.operator;
        const leftType = vlType(node.left);
        let rightType: VLType;
        {
          if (leftType.type !== "Object") rightType = leftType;
          else {
            const opFunc = leftType.properties.find((p) =>
              validateType(p.name, { type: "StringLiteral", value: op })
            )?.type;
            rightType = opFunc?.type === "Function"
              ? opFunc.paramaters[0].paramaterType ?? raise("op missing param")
              : raise("op not function");
          }
        }

        if (
          (leftType.type === "Object" &&
            (leftType.name === "i32" || leftType.name === "boolean" ||
              leftType.name === "f64")) ||
          op === "="
        ) {
          if (op === "=") {
            const left = node.left;
            if (left.type !== "Name") {
              throw new Error(`binop = for non-names not handled`);
            }
            const [type, localIndex] = getScopeEntry(left.name);
            const wasmType = toWasmType(type);
            const set = m.local.set(
              localIndex,
              withDesiredType(type, () => toExpression(node.right)),
            );
            return desiredType
              ? m.block(
                null,
                [set, m.local.get(localIndex, wasmType)],
                wasmType,
              )
              : set;
          }

          if (leftType.type !== "Object") throw new Error("Expected object");
          const name = leftType.name;
          if (name === "i32" || name === "boolean") {
            return m.i32[
              op === "+"
                ? "add"
                : op === "-"
                ? "sub"
                : op === "/"
                ? "div_s"
                : op === ">"
                ? "gt_s"
                : op === "<"
                ? "lt_s"
                : op === "%"
                ? "rem_s"
                : op === "*"
                ? "mul"
                : op === "=="
                ? "eq"
                : op === "!="
                ? "ne"
                : op === ">="
                ? "ge_s"
                : op === "<="
                ? "le_s"
                : op === "&&"
                ? "and"
                : raise(`binop ${op} not handled on i32`)
            ](
              withDesiredType(leftType, () => toExpression(node.left)),
              withDesiredType(rightType, () => toExpression(node.right)),
            );
          }
          if (name === "f64") {
            return m.f64[
              op === "+"
                ? "add"
                : op === "-"
                ? "sub"
                : op === "*"
                ? "mul"
                : op === "=="
                ? "eq"
                : op === "!="
                ? "ne"
                : raise(`binop ${op} not handled on f64`)
            ](
              withDesiredType(leftType, () => toExpression(node.left)),
              withDesiredType(rightType, () => toExpression(node.right)),
            );
          }
          throw new Error(`Didn't handle ${op} on ${name}`);
        }
        throw new Error(
          `Have only handled i32 with ${op}, got ${leftType.type}${
            leftType.type === "Object"
              ? leftType.name ? ` (${leftType.name})` : ""
              : ""
          }`,
        );
      }
      case "Block":
        return m.block(
          null,
          withScope(
            {},
            () =>
              node.statements.map((stmt, i, arr) =>
                i === arr.length - 1
                  ? toExpression(stmt)
                  : withDesiredType(undefined, () => toExpression(stmt))
              ),
          ),
          desiredType ? toWasmType(desiredType) : undefined,
        );
      case "If":
        return m.if(
          withDesiredType(
            { type: "Alias", name: "boolean" },
            () => toExpression(node.conditionals[0].condition),
          ),
          toExpression(node.conditionals[0].statement),
          node.conditionals.length > 1
            ? toExpression({
              ...node,
              conditionals: node.conditionals.slice(1),
            })
            : node.else
            ? toExpression(node.else)
            : undefined,
        );
      case "Return":
        // TODO: need returnType in global scope
        return withDesiredType(
          returnType,
          () => m.return(node.value ? toExpression(node.value) : undefined),
        );
      case "While": {
        const name = node.label ?? `loop${loopIndex++}`;
        loopLabels.push(name);
        const loop = m.loop(
          name,
          m.block(null, [
            m.br(name, toExpression(node.condition)),
            toExpression(node.statement),
          ]),
        );
        if (!node.label) loopIndex--;
        loopLabels.pop();
        return loop;
      }
      case "For": {
        const name = node.label ?? `loop${loopIndex++}`;
        loopLabels.push(name);
        const variableType = softenImplicitType(vlType(node.from));
        const varRef = setNodeType(
          { type: "Name", name: node.variable },
          variableType,
        );
        const loop = m.loop(
          name,
          m.block(null, [
            toExpression({
              type: "VariableDeclaration",
              name: node.variable,
              variableType,
              value: node.from,
              mutable: true,
            }),
            m.br(
              name,
              toExpression({
                type: "BinaryOperation",
                left: varRef,
                operator: ">",
                right: node.to,
              }),
            ),
            toExpression(node.statement),
            // TODO, actually wire up step
            toExpression({
              type: "BinaryOperation",
              left: varRef,
              operator: "=",
              right: {
                type: "BinaryOperation",
                left: varRef,
                operator: "+",
                right: { type: "IntegerLiteral", value: 1, text: "1" },
              },
            }),
          ]),
        );
        if (!node.label) loopIndex--;
        loopLabels.pop();
        return loop;
      }
      case "Continue":
        return m.br(node.label ?? loopLabels[loopLabels.length - 1]);
      default:
        throw new Error(`Unhandled AST -> WASM "${node.type}" expression`);
    }
  };

  const toWasmType = (node: VLType): number => {
    const type = softenImplicitType(node);
    switch (type.type) {
      case "Alias":
        if (type.name === "number") return binaryen.i32;
        if (type.name === "null") return binaryen.none;
        throw new Error(`Unhandled AST -> WASM Alias type "${type.name}"`);
      case "IntegerLiteral":
        return binaryen.i32;
      case "RealLiteral":
        return binaryen.f64;
      case "Object":
        if (type.name === "i32") return binaryen.i32;
        if (type.name === "f64") return binaryen.f64;
        throw new Error(`Unhandled AST -> WASM "Object" type ${type.name}`);
      case "Function":
        return binaryen.funcref;
      default:
        console.log(type);
        throw new Error(`Unhandled AST -> WASM "${type.type}" type`);
    }
  };

  // console.log(inspect(logSimplified(ast), { depth: Infinity }));
  m.setStart(toExpression(ast));

  console.log("result");
  console.log(m.emitText());
  // if (!m.validate()) throw new Error("validation error");
  m.optimize();
  console.log("optimized");
  console.log(m.emitText());
  if (!m.validate()) throw new Error("validation error");
  return m.emitBinary();
};

const logSimplified = (obj: unknown): unknown => {
  if (obj == null) return obj;
  if (typeof obj !== "object") return obj;
  if (
    "type" in obj && obj.type === "Object" && "name" in obj &&
    typeof obj.name === "string"
  ) {
    return { type: "Alias", name: obj.name };
  }
  if (Array.isArray(obj)) return obj.map((v) => logSimplified(v));
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, logSimplified(v)]),
  );
};
