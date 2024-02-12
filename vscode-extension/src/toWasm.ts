import { inspect } from "node:util";
import Binaryen from "binaryen";
import {
  typeFromExpression,
  VLProgramNode,
  VLStatement,
  VLType,
} from "./toAST.ts";

const raise = (err?: string | Error) => {
  if (typeof err === "object" && err instanceof Error) throw err;
  throw new Error(err);
};

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

  m.addGlobal("__global_offset__", binaryen.i32, true, m.i32.const(4));
  m.addFunction(
    "__allocate__",
    binaryen.i32,
    binaryen.i32,
    [],
    m.block(null, [
      m.global.set(
        "__global_offset__",
        m.i32.add(
          m.global.get("__global_offset__", binaryen.i32),
          m.local.get(0, binaryen.i32),
        ),
      ),
      m.return(
        m.i32.sub(
          m.global.get("__global_offset__", binaryen.i32),
          m.local.get(0, binaryen.i32),
        ),
      ),
    ], binaryen.i32),
  );

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

  // m.addFunction(
  //   "__store_f64__",
  //   binaryen.createType([binaryen.i32, binaryen.f64]),
  //   binaryen.none,
  //   [],
  //   m.block(null, [
  //     m.i64.store(
  //       0,
  //       8,
  //       m.local.get(0, binaryen.i32),
  //       m.local.get(1, binaryen.f64),
  //     ),
  //   ]),
  // );

  type Scope = Record<string, VLType>;
  const scopes: Scope[] = [];
  let currentScope: Scope;
  const withScope = <T>(scope: Scope, fn: () => T) => {
    scopes.push(scope);
    currentScope = scope;
    const ret = fn();
    scopes.pop();
    currentScope = scopes[scopes.length - 1];
    return ret;
  };

  const toExpression = (node: VLProgramNode | VLStatement): number => {
    switch (node.type) {
      case "Program": {
        const modifiedScope = Object.fromEntries(
          Object.entries(node.scope).filter(([k]) =>
            ![
              "i32",
              "i64",
              "f32",
              "f64",
              "__allocate__",
              "__store_i32__",
              "__store_i64__",
              "log",
            ].includes(k)
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
              Object.values(modifiedScope).map(toType),
              m.block(null, node.statements.map(toExpression)),
            ),
        );
      }
      case "IntegerLiteral":
        return m.i32.const(node.value);
      case "FunctionCall":
        return m.call(
          node.function,
          node.arguments.map((a) => toExpression(a.value)),
          toType(node.functionType!.return),
        );
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
        const leftType = typeFromExpression(node.left, null as any);
        const rightType = typeFromExpression(node.right, null as any);
        // const opFunc = leftType.type === "Object"
        //   ? leftType.properties.find((p) =>
        //     p.name.type === "StringLiteral" && p.name.value === op
        //   )?.type
        //   : raise();
        // const ret = opFunc?.type === "Function" ? opFunc.return : raise();
        if (leftType.type === "Object" && leftType.name === "i32") {
          return m.i32[op === "+" ? "add" : raise()](
            toExpression(node.left),
            toExpression(node.right), // TODO need to handle casting...
          );
        }
        throw new Error("Have only handled addition for i32");
        // if (node.left)
      }
      default:
        throw new Error(`Unhandled AST -> WASM "${node.type}" expression`);
    }
  };

  const toType = (node: VLType): number => {
    switch (node.type) {
      case "Alias":
        if (node.name === "number") return binaryen.i32;
        if (node.name === "null") return binaryen.none;
        throw new Error(`Unhandled AST -> WASM Alias type "${node.name}"`);
      case "IntegerLiteral":
        return binaryen.i32;
      case "RealLiteral":
        return binaryen.f64;
      case "Object":
        if (node.name === "i32") return binaryen.i32;
        throw new Error(`Unhandled AST -> WASM "Object" type`);
      default:
        throw new Error(`Unhandled AST -> WASM "${node.type}" type`);
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
