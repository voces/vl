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
      // A `Custom` is a builtin operator-param validator; it carries the same
      // numeric `name` and arises when an un-annotated value unifies to a
      // builtin operator's RHS type (e.g. `n` in `i32 >= n`). Map both by name.
      case "Custom":
        if (type.name === "i32") return binaryen.i32;
        if (type.name === "i64") return binaryen.i64;
        if (type.name === "f32") return binaryen.f32;
        if (type.name === "f64") return binaryen.f64;
        // Booleans are represented as an i32 (0 / 1).
        if (type.name === "boolean") return binaryen.i32;
        throw new Error(
          `Unhandled AST -> WASM "${type.type}" type ${type.name}`,
        );
      case "Function":
        // A function value is an i32 index into the function table.
        return binaryen.i32;
      case "Unknown":
      case "Infer":
        // An UNRESOLVED inference hole reached codegen. This is normally caught
        // earlier as a clean "cannot infer … annotate" diagnostic (see
        // `reportUninferredBinding` in typecheck.ts); this is the BACKSTOP so a
        // missed case surfaces as a clear, actionable message rather than the
        // opaque `Unhandled AST -> WASM "Unknown" type`. Still thrown (not logged)
        // so `instantiate`'s inferred-return-type path can catch it and read the
        // result type off the compiled body — on that expected path this message
        // never reaches the user; it only surfaces (via `compile`'s catch) for a
        // genuinely un-inferable value.
        throw new Error(
          "cannot infer a type — add a type annotation " +
            "(e.g. `let xs: i32[] = []`)",
        );
      default:
        // Thrown (not logged): any other type with no wasm mapping. `instantiate`
        // deliberately catches this to read the result type off the compiled body
        // instead. Logging here would leak to stdout on that expected path.
        throw new Error(`Unhandled AST -> WASM "${type.type}" type`);
    }
};
