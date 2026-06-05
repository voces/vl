// Maps a VL type to its binaryen wasm type. `binaryen` is the dynamically-typed
// binaryen instance.
import { softenImplicitType, type VLType } from "./toAST.ts";

// deno-lint-ignore no-explicit-any
export const toWasmType = (binaryen: any, node: VLType): number => {
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
        // Booleans are represented as an i32 (0 / 1).
        if (type.name === "boolean") return binaryen.i32;
        throw new Error(`Unhandled AST -> WASM "Object" type ${type.name}`);
      case "Function":
        // A function value is an i32 index into the function table.
        return binaryen.i32;
      default:
        console.log(type);
        throw new Error(`Unhandled AST -> WASM "${type.type}" type`);
    }
};
