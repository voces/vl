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
        if (type.name === "i64") return binaryen.i64;
        if (type.name === "f32") return binaryen.f32;
        if (type.name === "f64") return binaryen.f64;
        // Booleans are represented as an i32 (0 / 1).
        if (type.name === "boolean") return binaryen.i32;
        throw new Error(`Unhandled AST -> WASM "Object" type ${type.name}`);
      case "Function":
        // A function value is an i32 index into the function table.
        return binaryen.i32;
      default:
        // Thrown (not logged): an inferred return type (`Unknown`/`Infer`) has
        // no wasm mapping, and `instantiate` deliberately catches this to read
        // the result type off the compiled body instead. Logging here would
        // leak to stdout on that expected path.
        throw new Error(`Unhandled AST -> WASM "${type.type}" type`);
    }
};
