// import { inspect } from "node:util";
import Binaryen from "binaryen";
import {
  validateParameters,
  validateType,
  VLFunctionDeclarationNode,
  VLParameterNode,
  VLProgramNode,
  VLStatement,
  VLType,
  vlType,
} from "./toAST.ts";
import { defaultScope } from "./defaultScope.ts";
import { softenImplicitType } from "./toAST.ts";

const raise = (err?: string | Error) => {
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
    m.block(null, [
      m.i32.store(
        0,
        4,
        m.local.get(0, binaryen.i32),
        m.local.get(1, binaryen.i32),
      ),
    ]),
  );

  m.addFunction(
    "__load_i32__",
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    m.block(null, [m.i32.load(0, 4, m.local.get(0, binaryen.i32))]),
  );

  m.addFunction(
    "__store_i64__",
    binaryen.createType([binaryen.i32, binaryen.i64]),
    binaryen.none,
    [],
    m.block(null, [
      m.i64.store(
        0,
        8,
        m.local.get(0, binaryen.i32),
        m.local.get(1, binaryen.i64),
      ),
    ]),
  );

  m.addFunction(
    "__store_f32__",
    binaryen.createType([binaryen.i32, binaryen.f32]),
    binaryen.none,
    [],
    m.block(null, [
      m.f32.store(
        0,
        4,
        m.local.get(0, binaryen.i32),
        m.local.get(1, binaryen.f32),
      ),
    ]),
  );

  m.addFunction(
    "__store_f64__",
    binaryen.createType([binaryen.i32, binaryen.f64]),
    binaryen.none,
    [],
    m.block(null, [
      m.f64.store(
        0,
        8,
        m.local.get(0, binaryen.i32),
        m.local.get(1, binaryen.f64),
      ),
    ]),
  );

  type Scope = Record<string, VLType>;
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

  let desiredType: VLType | undefined = undefined;
  const withDesiredType = <T>(type: VLType | undefined, fn: () => T) => {
    const oldType = desiredType;
    desiredType = type;
    const ret = fn();
    desiredType = oldType;
    return ret;
  };

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
  const getFunction = (name: string) =>
    functions[getResolvedFunctionName(name)];

  const handleFunctionDecl = (node: VLFunctionDeclarationNode) => {
    if (!node.name) throw new Error("Anonymous functions not yet handled");
    let name = node.name;
    let i = 1;
    while (name in functions) name = `${node.name}_${i++}`;
    functionScopes[functionScopes.length - 1][node.name] = name;
    functions[name] = { declaration: node, instances: [] };
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
          Object.entries(node.scope).filter(([k, v]) =>
            !ignoredKeys.has(k) && v.type !== "Function"
          ),
        );
        return withScope(
          modifiedScope,
          () =>
            m.addFunction(
              "__program__",
              binaryen.none,
              binaryen.none,
              // This really doesn't work with closures...
              Object.values(modifiedScope).filter((v) => v.type !== "Function")
                .map(toWasmType),
              m.block(
                null,
                node.statements.map((n) =>
                  n.type === "FunctionDeclaration"
                    ? handleFunctionDecl(n)
                    : toExpression(n)
                ).filter((v: number | void): v is number =>
                  typeof v === "number"
                ),
              ),
            ),
        );
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
        if (!ignoredKeys.has(node.function)) {
          const { declaration, instances } = getFunction(node.function);
          if (
            !instances.some((i) =>
              validateParameters(i.parameters, node.arguments)
            )
          ) {
            m.addFunction(
              getResolvedFunctionName(node.function),
              // TODO: named/optional params
              binaryen.createType(
                declaration.parameters.map((p) => toWasmType(p.paramaterType)),
              ),
              toWasmType(declaration.returnType),
              [],
              m.block(null, []), // TODO
            );
          }
        }
        console.log("writing call for", node);
        return m.call(
          node.function,
          node.arguments.map((a, i) =>
            withDesiredType(
              // TODO: named params
              node.functionType?.paramaters[i]?.paramaterType,
              () => toExpression(a.value),
            )
          ),
          toWasmType(node.functionType!.return),
        );
      }
      case "VariableDeclaration":
        if (node.value) {
          return m.local.set(
            Object.keys(currentScope).indexOf(node.name),
            toExpression(node.value),
          );
        }
        return m.i32.const(0); // Hmm...
      case "Name": {
        let type: VLType | undefined;
        for (let i = scopes.length - 1; i >= 0; i--) {
          if (node.name in scopes[i]) type = scopes[i][node.name];
        }
        if (!type) throw new Error(`Expected "${node.name}" to be in scope`);
        return m.local.get(
          Object.keys(currentScope).indexOf(node.name),
          binaryen.i32,
        );
      }
      case "BinaryOperation": {
        const op = node.operator;
        const leftType = vlType(node.left);
        const opFunc = leftType.type === "Object"
          ? leftType.properties.find((p) =>
            validateType(p.name, { type: "StringLiteral", value: op })
          )?.type
          : raise("left not object");
        const paramType = opFunc?.type === "Function"
          ? opFunc.paramaters[0].paramaterType ?? raise("op missing param")
          : raise("op not function");
        // const ret = opFunc?.type === "Function" ? opFunc.return : raise();
        if (leftType.type === "Object" && leftType.name === "i32") {
          return m.i32[
            op === "+"
              ? "add"
              : op === "-"
              ? "sub"
              : raise(`binop ${op} not handled`)
          ](
            toExpression(node.left),
            withDesiredType(paramType, () => toExpression(node.right)),
          );
        }
        throw new Error("Have only handled addition for i32");
      }
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
        throw new Error(`Unhandled AST -> WASM "Object" type`);
      default:
        console.log(type);
        throw new Error(`Unhandled AST -> WASM "${type.type}" type`);
    }
  };

  // console.log(inspect(ast, { depth: Infinity }));
  m.setStart(toExpression(ast));

  // console.log(m.emitText());
  m.optimize();
  console.log(m.emitText());
  if (!m.validate()) throw new Error("validation error");
  return m.emitBinary();
};
