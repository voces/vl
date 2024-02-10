import Binaryen from "binaryen";
import { VLNode, VLProgramNode } from "./toAST.ts";

let unnamedExportIndex = 0;

// const _toWasm = (
//   module: Awaited<ReturnType<typeof Binaryen>>,
//   node: VLNode,
// ): void => {
//   switch (node.type) {
//     case "Program":
//       for (const stmt of node.statements)

//     default:
//       console.warn(`Skipping ${node.type}`);
//   }
// };

export const toWasm = async (ast: VLProgramNode) => {
  const binaryen = await Binaryen();
  const m = new binaryen.Module();
  m.addFunctionImport("log", "imports", "log", binaryen.stringview_wtf8, 0);
  // m.setStart(0);
  // m.addFunction(
  //   "__init__",
  //   binaryen.none,
  //   binaryen.none,
  //   [],
  //   m.block(null, statementsToWasm(m, )),
  // );

  // _toWasm(binaryen, ast);

  const f = m.addFunction(
    "!init",
    binaryen.none,
    binaryen.none,
    [],
    m.block(null, [m.call("log", [m.i32.const(5)], binaryen.none)]),
  );

  m.setStart(f);

  for (const stmt of ast.statements) {
    switch (stmt.type) {
      // case "FunctionCall":
      // m.
      default:
        console.warn(`Skipping ${stmt.type}`);
    }
  }
  //   // if (stmt.type !== "Return" || !stmt.value) continue;
  //   // switch (stmt.value.type) {
  //   //   default:
  //   //     console.log("")
  //   //   // case "NumberLiteral":
  //   //   //     myModule.addGlobal("")
  //   //   //     continue;
  //   // }
  //   // if (stmt.value.type !== "FunctionDeclaration") continue;
  //   // // const ret = stmt.value.returnType;
  //   // // myModule.addFunction(
  //   // //   stmt.value.name!,
  //   // //   stmt.value.parameters.length,
  //   // //   ret.type === "Alias" && ret.name === "null" ? 0 : 1,
  //   // //   0,
  //   // // );
  // }

  // console.log(ast);

  // console.log("c");
  // myModule.addFunction(
  //   "add",
  //   binaryen.createType([binaryen.i32, binaryen.i32]),
  //   binaryen.i32,
  //   [binaryen.i32],
  //   myModule.block(null, [
  //     myModule.local.set(
  //       2,
  //       myModule.i32.add(
  //         myModule.local.get(0, binaryen.i32),
  //         myModule.local.get(1, binaryen.i32),
  //       ),
  //     ),
  //     myModule.return(
  //       myModule.local.get(2, binaryen.i32),
  //     ),
  //   ]),
  // );
  // myModule.addFunctionExport("add", "add");
  m.optimize();
  if (!m.validate()) throw new Error("validation error");
  console.log(m.emitText());
  return m.emitBinary();
};
